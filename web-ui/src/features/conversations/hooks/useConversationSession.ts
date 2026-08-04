import { useCallback, useEffect, useRef, useState } from "react";
import type { InitialConversationState } from "../state/initialConversation";
import { conversationApi } from "../data/conversationApi";
import type { SessionDelta, SessionDetail, SessionMessage, SessionResponse } from "../model/types";

type LoadOptions = { older?: boolean; quiet?: boolean; retry?: boolean };

const isSessionDelta = (response: SessionResponse): response is SessionDelta => (
  !Array.isArray((response as SessionDetail).messages)
  && Array.isArray((response as SessionDelta).upserts)
  && Array.isArray((response as SessionDelta).deletes)
);

const mergeOlderMessages = (olderMessages: SessionDetail["messages"], currentMessages: SessionDetail["messages"]) => {
  const currentIds = new Set(currentMessages.map((message) => message.id).filter(Boolean));
  const seenIds = new Set<string>();
  const older = olderMessages.filter((message) => {
    if (!message.id) return true;
    if (currentIds.has(message.id) || seenIds.has(message.id)) return false;
    seenIds.add(message.id);
    return true;
  });
  const current = currentMessages.filter((message) => {
    if (!message.id) return true;
    if (seenIds.has(message.id)) return false;
    seenIds.add(message.id);
    return true;
  });
  return [...older, ...current];
};

const isOptimisticMessage = (message: SessionDetail["messages"][number]) => message.id.startsWith("optimistic-");

const attachmentSignature = (message: SessionDetail["messages"][number]) => (message.blocks || [])
  .filter((block) => "source" in block)
  .map((block) => `${block.type}:${block.file?.id || block.source}`)
  .sort()
  .join("|");

const persistedMatchesOptimistic = (
  persisted: SessionDetail["messages"][number],
  optimistic: SessionDetail["messages"][number],
) => {
  if (persisted.role !== "user" || isOptimisticMessage(persisted) || persisted.text !== optimistic.text) return false;
  const persistedAttachments = attachmentSignature(persisted);
  const optimisticAttachments = attachmentSignature(optimistic);
  if ((persistedAttachments || optimisticAttachments) && persistedAttachments !== optimisticAttachments) return false;
  if (persisted.turnId && optimistic.turnId) return persisted.turnId === optimistic.turnId;
  const persistedAt = Date.parse(persisted.createdAt || "");
  const optimisticAt = Date.parse(optimistic.createdAt || "");
  return !Number.isFinite(persistedAt)
    || !Number.isFinite(optimisticAt)
    || Math.abs(persistedAt - optimisticAt) <= 5 * 60 * 1000;
};

const unresolvedOptimisticMessages = (incoming: SessionDetail, current: SessionDetail) => {
  const persistedUsers = incoming.messages.filter((message) => message.role === "user" && !isOptimisticMessage(message));
  const consumed = new Set<number>();
  return current.messages.filter(isOptimisticMessage).filter((optimistic) => {
    const match = persistedUsers.findIndex((persisted, index) => (
      !consumed.has(index) && persistedMatchesOptimistic(persisted, optimistic)
    ));
    if (match < 0) return true;
    consumed.add(match);
    return false;
  });
};

const mergePendingOptimisticMessages = (incoming: SessionDetail, pending: SessionMessage[]) => {
  if (!pending.length) return incoming;
  const incomingIds = new Set(incoming.messages.map((message) => message.id));
  const unresolved = unresolvedOptimisticMessages(incoming, { ...incoming, messages: pending })
    .filter((message) => !incomingIds.has(message.id));
  return unresolved.length
    ? { ...incoming, messages: [...incoming.messages, ...unresolved] }
    : incoming;
};

const mergeSessionRefresh = (current: SessionDetail, incoming: SessionDetail): SessionDetail => {
  const incomingIds = new Set(incoming.messages.map((message) => message.id));
  const firstOverlap = current.messages.findIndex((message) => !isOptimisticMessage(message) && incomingIds.has(message.id));
  const olderPrefix = firstOverlap > 0
    ? current.messages.slice(0, firstOverlap).filter((message) => !isOptimisticMessage(message))
    : [];
  const pending = unresolvedOptimisticMessages(incoming, current)
    .filter((message) => !incomingIds.has(message.id));
  return {
    ...incoming,
    messages: mergeOlderMessages(olderPrefix, [...incoming.messages, ...pending]),
  };
};

const mergeSessionDelta = (cached: SessionDetail, delta: SessionDelta): SessionDetail => {
  const upserts = new Map(delta.upserts.map((message) => [message.id, message]));
  const deleted = new Set(delta.deletes);
  const resolved = cached.messages
    .filter((message) => !deleted.has(message.id))
    .map((message) => upserts.get(message.id) || message);
  const persistedUsers = delta.upserts.filter((message) => message.role === "user" && !isOptimisticMessage(message));
  const consumed = new Set<number>();
  const withoutOptimisticDuplicates = resolved.filter((message) => (
    !isOptimisticMessage(message)
    || (() => {
      const match = persistedUsers.findIndex((persisted, index) => (
        !consumed.has(index) && persistedMatchesOptimistic(persisted, message)
      ));
      if (match < 0) return true;
      consumed.add(match);
      return false;
    })()
  ));
  const resolvedIds = new Set(withoutOptimisticDuplicates.map((message) => message.id));
  const appended = delta.upserts.filter((message) => !resolvedIds.has(message.id));
  return {
    ...cached,
    ...delta.sessionPatch,
    contentVersion: delta.contentVersion,
    messages: [...withoutOptimisticDuplicates, ...appended],
  };
};

export function useConversationSession(initial: InitialConversationState) {
  const [selectedId, setSelectedId] = useState(initial.selectedId);
  const [session, setSession] = useState<SessionDetail | null>(initial.session);
  const [loadingSession, setLoadingSession] = useState(Boolean(initial.selectedId) && !initial.session);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [syncing, setSyncing] = useState(Boolean(initial.session));
  const [sessionError, setSessionError] = useState("");
  const selectedIdRef = useRef(initial.selectedId);
  const requestRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef(0);
  const sessionLoadsRef = useRef(new Map<string, Promise<boolean>>());
  const pendingSessionSyncRef = useRef(new Set<string>());
  const pendingOptimisticMessagesRef = useRef(new Map<string, SessionMessage[]>());
  const sessionCache = useRef(new Map<string, SessionDetail>(initial.session
    ? [[initial.session.threadId, initial.session]]
    : []));
  const loadSessionRef = useRef<(threadId: string, options?: LoadOptions) => Promise<boolean>>(async () => false);

  const loadSessionOnce = useCallback(async (threadId: string, { older = false, quiet = false, retry = true }: LoadOptions = {}) => {
    const cached = sessionCache.current.get(threadId);
    if (!older) {
      requestRef.current?.abort();
      if (cached) setSession(cached);
      if (!quiet && !cached) setLoadingSession(true);
      setSessionError("");
    } else {
      if (!cached?.hasMore || (!cached.nextCursor && (cached.nextBefore === null || cached.nextBefore === undefined))) return false;
      setLoadingOlder(true);
    }
    const controller = new AbortController();
    if (!older) requestRef.current = controller;
    try {
      const response = await conversationApi.session(threadId, older ? {
        before: cached?.nextCursor ? undefined : cached?.nextBefore ?? undefined,
        cursor: cached?.nextCursor ?? undefined,
      } : {
        contentVersion: cached?.contentVersion,
      }, controller.signal);
      const latest = sessionCache.current.get(threadId);
      const pendingOptimistic = pendingOptimisticMessagesRef.current.get(threadId) || [];
      const latestWithPending = latest
        ? mergePendingOptimisticMessages(latest, pendingOptimistic)
        : latest;
      const latestVersion = latest?.contentVersion ?? 0;
      const responseVersion = response.contentVersion ?? 0;
      if (!older && latest && responseVersion > 0 && latestVersion > responseVersion) return true;
      const deltaResponse = isSessionDelta(response);
      const detail = deltaResponse
        ? latestWithPending ? mergeSessionDelta(latestWithPending, response) : null
        : response;
      if (!detail) throw new Error("会话增量缺少本地快照，正在重新读取");
      const next = older && latestWithPending
        ? {
          ...latestWithPending,
          hasMore: detail.hasMore,
          nextBefore: detail.nextBefore,
          nextCursor: detail.nextCursor,
          contentVersion: latestWithPending.contentVersion ?? detail.contentVersion,
          messages: mergeOlderMessages(detail.messages, latestWithPending.messages),
        }
        : !deltaResponse && latestWithPending ? mergeSessionRefresh(latestWithPending, detail) : detail;
      const resolved = mergePendingOptimisticMessages(next, pendingOptimistic);
      sessionCache.current.set(threadId, resolved);
      if (pendingOptimistic.length) pendingOptimisticMessagesRef.current.delete(threadId);
      if (selectedIdRef.current === threadId) setSession(resolved);
      setSessionError("");
      return true;
    } catch (reason) {
      if (!controller.signal.aborted) {
        const detail = reason instanceof Error ? reason.message : String(reason);
        setSessionError(detail.includes("同步超时") ? "同步较慢，正在重试" : detail);
        if (!older && retry && selectedIdRef.current === threadId) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = window.setTimeout(() => {
            setSyncing(true);
            void loadSessionRef.current(threadId, { quiet: true, retry: false });
          }, 10000);
        }
      }
      return false;
    } finally {
      if (!controller.signal.aborted) {
        setLoadingSession(false);
        setLoadingOlder(false);
        setSyncing(false);
      }
    }
  }, []);

  const loadSession = useCallback((threadId: string, options: LoadOptions = {}) => {
    if (options.older) return loadSessionOnce(threadId, options);
    const inFlight = sessionLoadsRef.current.get(threadId);
    if (inFlight) {
      pendingSessionSyncRef.current.add(threadId);
      return inFlight;
    }

    const request = loadSessionOnce(threadId, options);
    sessionLoadsRef.current.set(threadId, request);
    void request.finally(() => {
      if (sessionLoadsRef.current.get(threadId) === request) sessionLoadsRef.current.delete(threadId);
      if (pendingSessionSyncRef.current.delete(threadId) && selectedIdRef.current === threadId) {
        window.setTimeout(() => {
          void loadSessionRef.current(threadId, { quiet: true, retry: false });
        }, 0);
      }
    }).catch(() => {});
    return request;
  }, [loadSessionOnce]);
  loadSessionRef.current = loadSession;

  const selectSession = useCallback((threadId: string) => {
    if (threadId === selectedIdRef.current) return;
    selectedIdRef.current = threadId;
    setSelectedId(threadId);
    const cached = sessionCache.current.get(threadId);
    setSession(cached || null);
    setSyncing(Boolean(cached));
    const params = new URLSearchParams(window.location.search);
    params.set("thread", threadId);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    void loadSession(threadId, { quiet: Boolean(cached) });
  }, [loadSession]);

  const adoptSelection = useCallback(async (threadId: string, quiet: boolean) => {
    selectedIdRef.current = threadId;
    setSelectedId(threadId);
    return loadSession(threadId, { quiet });
  }, [loadSession]);

  const clearSelection = useCallback(() => {
    selectedIdRef.current = "";
    setSelectedId("");
    setSession(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("thread");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  const setCreatedSession = useCallback((detail: SessionDetail) => {
    pendingOptimisticMessagesRef.current.delete(detail.threadId);
    sessionCache.current.set(detail.threadId, detail);
    selectedIdRef.current = detail.threadId;
    setSelectedId(detail.threadId);
    setSession(detail);
    const params = new URLSearchParams(window.location.search);
    params.set("thread", detail.threadId);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  const hydrateSnapshot = useCallback((detail: SessionDetail) => {
    if (!detail.threadId || (selectedIdRef.current && selectedIdRef.current !== detail.threadId)) return false;
    const current = sessionCache.current.get(detail.threadId);
    const currentVersion = current?.contentVersion ?? 0;
    const incomingVersion = detail.contentVersion ?? 0;
    const currentHasOptimistic = current?.messages.some((message) => message.id.startsWith("optimistic-")) === true;
    const incomingHasOptimistic = detail.messages.some((message) => message.id.startsWith("optimistic-"));
    if (current && currentHasOptimistic && !incomingHasOptimistic) return false;
    if (current && currentVersion > incomingVersion && incomingVersion > 0) return false;
    if (current && currentVersion === incomingVersion && current.messages.length >= detail.messages.length) return false;
    if (!selectedIdRef.current) {
      selectedIdRef.current = detail.threadId;
      setSelectedId(detail.threadId);
      const params = new URLSearchParams(window.location.search);
      params.set("thread", detail.threadId);
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
    sessionCache.current.set(detail.threadId, detail);
    setSession(detail);
    setSyncing(true);
    void loadSessionRef.current(detail.threadId, { quiet: true, retry: false });
    return true;
  }, []);

  const updateCurrentSession = useCallback((threadId: string, update: (current: SessionDetail) => SessionDetail) => {
    const current = sessionCache.current.get(threadId);
    if (!current) return;
    const next = update(current);
    if (next === current) return;
    sessionCache.current.set(threadId, next);
    if (selectedIdRef.current === threadId) setSession(next);
  }, []);

  const addOptimisticMessage = useCallback((threadId: string, message: SessionMessage) => {
    const current = sessionCache.current.get(threadId);
    if (current) {
      if (current.messages.some((item) => item.id === message.id)) return;
      const next = { ...current, messages: [...current.messages, message] };
      sessionCache.current.set(threadId, next);
      if (selectedIdRef.current === threadId) setSession(next);
      return;
    }
    const pending = pendingOptimisticMessagesRef.current.get(threadId) || [];
    if (pending.some((item) => item.id === message.id)) return;
    pendingOptimisticMessagesRef.current.set(threadId, [...pending, message]);
  }, []);

  const removeOptimisticMessage = useCallback((threadId: string, messageId: string) => {
    const pending = pendingOptimisticMessagesRef.current.get(threadId);
    if (pending) {
      const nextPending = pending.filter((message) => message.id !== messageId);
      if (nextPending.length) pendingOptimisticMessagesRef.current.set(threadId, nextPending);
      else pendingOptimisticMessagesRef.current.delete(threadId);
    }
    updateCurrentSession(threadId, (current) => ({
      ...current,
      messages: current.messages.filter((message) => message.id !== messageId),
    }));
  }, [updateCurrentSession]);

  const invalidate = useCallback((threadId: string) => sessionCache.current.delete(threadId), []);
  const loadOlder = useCallback(async () => {
    if (selectedIdRef.current) await loadSession(selectedIdRef.current, { older: true });
  }, [loadSession]);

  useEffect(() => () => {
    requestRef.current?.abort();
    window.clearTimeout(retryTimerRef.current);
  }, []);

  return {
    selectedId, selectedIdRef, session, loadingSession, loadingOlder, syncing, sessionError,
    setSyncing, loadSession, selectSession, adoptSelection, clearSelection, setCreatedSession, hydrateSnapshot,
    updateCurrentSession, addOptimisticMessage, removeOptimisticMessage, invalidate, loadOlder,
  };
}
