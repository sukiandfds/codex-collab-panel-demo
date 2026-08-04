import { useCallback, useEffect, useRef, useState } from "react";
import type { InitialConversationState } from "../state/initialConversation";
import { conversationApi } from "../data/conversationApi";
import type { SessionDelta, SessionDetail, SessionResponse } from "../model/types";

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

const mergeSessionDelta = (cached: SessionDetail, delta: SessionDelta): SessionDetail => {
  const upserts = new Map(delta.upserts.map((message) => [message.id, message]));
  const deleted = new Set(delta.deletes);
  const resolved = cached.messages
    .filter((message) => !deleted.has(message.id))
    .map((message) => upserts.get(message.id) || message);
  const realMessageCounts = new Map<string, number>();
  for (const message of delta.upserts) {
    if (message.id.startsWith("optimistic-")) continue;
    const key = `${message.role}:${message.text}`;
    realMessageCounts.set(key, (realMessageCounts.get(key) || 0) + 1);
  }
  const withoutOptimisticDuplicates = resolved.filter((message) => (
    !message.id.startsWith("optimistic-")
    || (() => {
      const key = `${message.role}:${message.text}`;
      const count = realMessageCounts.get(key) || 0;
      if (!count) return true;
      realMessageCounts.set(key, count - 1);
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
      const detail = isSessionDelta(response)
        ? cached ? mergeSessionDelta(cached, response) : null
        : response;
      if (!detail) throw new Error("会话增量缺少本地快照，正在重新读取");
      const next = older && cached
        ? {
          ...detail,
          contentVersion: detail.contentVersion ?? cached.contentVersion,
          messages: mergeOlderMessages(detail.messages, cached.messages),
        }
        : detail;
      sessionCache.current.set(threadId, next);
      if (selectedIdRef.current === threadId) setSession(next);
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
    setSession((current) => {
      if (!current || current.threadId !== threadId) return current;
      const next = update(current);
      sessionCache.current.set(threadId, next);
      return next;
    });
  }, []);

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
    updateCurrentSession, invalidate, loadOlder,
  };
}
