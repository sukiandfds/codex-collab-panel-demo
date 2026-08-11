import { useCallback, useEffect, useRef, useState } from "react";
import type { InitialConversationState } from "../state/initialConversation";
import { conversationApi } from "../data/conversationApi";
import { mergeMessageList, mergeOlderMessages, mergePendingOptimisticMessages, mergeSessionDelta, mergeSessionRefresh } from "../state/conversationMerge";
import type { ContentSyncState, SessionDelta, SessionDetail, SessionMessage, SessionResponse } from "../model/types";

type LoadOptions = { older?: boolean; quiet?: boolean; retry?: boolean; recovery?: boolean };

const isSessionDelta = (response: SessionResponse): response is SessionDelta => (
  !Array.isArray((response as SessionDetail).messages)
  && Array.isArray((response as SessionDelta).upserts)
  && Array.isArray((response as SessionDelta).deletes)
);

export function useConversationSession(initial: InitialConversationState) {
  const [selectedId, setSelectedId] = useState(initial.selectedId);
  const [session, setSession] = useState<SessionDetail | null>(initial.session);
  const [loadingSession, setLoadingSession] = useState(Boolean(initial.selectedId && !initial.session));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [syncing, setSyncing] = useState(Boolean(initial.session));
  const [contentSyncState, setContentSyncState] = useState<ContentSyncState>(
    initial.session ? initial.sessionIsPartial ? "recovering" : "syncing" : "stable",
  );
  const [sessionError, setSessionError] = useState("");
  const selectedIdRef = useRef(initial.selectedId);
  const requestRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef(0);
  const sessionLoadsRef = useRef(new Map<string, Promise<boolean>>());
  const sessionRequestControllersRef = useRef(new Map<string, AbortController>());
  const pendingSessionSyncRef = useRef(new Map<string, boolean>());
  const pendingOptimisticMessagesRef = useRef(new Map<string, SessionMessage[]>());
  const sessionCache = useRef(new Map<string, SessionDetail>(
    initial.cachedSessions.map((cached) => [cached.threadId, cached]),
  ));
  const partialSessionIdsRef = useRef(new Set(initial.partialSessionIds));
  const loadSessionRef = useRef<(threadId: string, options?: LoadOptions) => Promise<boolean>>(async () => false);

  const loadSessionOnce = useCallback(async (threadId: string, {
    older = false,
    quiet = false,
    retry = true,
    recovery = false,
  }: LoadOptions = {}) => {
    const cached = sessionCache.current.get(threadId);
    const isSelected = () => selectedIdRef.current === threadId;
    if (!older) {
      requestRef.current?.abort();
      if (cached) {
        setSession(cached);
        setLoadingSession(false);
      } else if (!cached) {
        setLoadingSession(true);
      }
      setSyncing(true);
      setContentSyncState(recovery ? "recovering" : "syncing");
      setSessionError("");
    } else {
      if (!cached?.hasMore || (!cached.nextCursor && (cached.nextBefore === null || cached.nextBefore === undefined))) return false;
      if (isSelected()) setLoadingOlder(true);
    }
    const controller = new AbortController();
    if (!older) {
      requestRef.current = controller;
      sessionRequestControllersRef.current.set(threadId, controller);
    }
    let loadSucceeded = false;
    try {
      const response = await conversationApi.session(threadId, older ? {
        before: cached?.nextCursor ? undefined : cached?.nextBefore ?? undefined,
        cursor: cached?.nextCursor ?? undefined,
      } : {
        // Recovery must receive a fresh page. A partial local snapshot must
        // never be allowed to turn into an "unchanged" delta.
        ...(recovery ? {} : { contentVersion: cached?.contentVersion }),
      }, controller.signal);
      const latest = sessionCache.current.get(threadId);
      const pendingOptimistic = pendingOptimisticMessagesRef.current.get(threadId) || [];
      const latestWithPending = latest
        ? mergePendingOptimisticMessages(latest, pendingOptimistic)
        : latest;
      const latestVersion = latest?.contentVersion ?? 0;
      const responseVersion = response.contentVersion ?? 0;
      if (!older && latest && responseVersion > 0 && latestVersion > responseVersion) {
        loadSucceeded = true;
        return true;
      }
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
      partialSessionIdsRef.current.delete(threadId);
      if (pendingOptimistic.length) pendingOptimisticMessagesRef.current.delete(threadId);
      if (isSelected()) {
        setSession(resolved);
        setSessionError("");
      }
      loadSucceeded = true;
      return true;
    } catch (reason) {
      if (!controller.signal.aborted && isSelected()) {
        const detail = reason instanceof Error ? reason.message : String(reason);
        setSessionError(detail.includes("同步超时") ? "同步较慢，正在重试" : detail);
        if (!older && retry) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = window.setTimeout(() => {
            if (!isSelected()) return;
            setSyncing(true);
            void loadSessionRef.current(threadId, { quiet: true, retry: false, recovery: true });
          }, 10000);
        }
        if (!older) setContentSyncState("degraded");
      }
      return false;
    } finally {
      if (!controller.signal.aborted && isSelected()) {
        if (older) {
          setLoadingOlder(false);
        } else {
          setLoadingSession(false);
          setSyncing(false);
          if (loadSucceeded) setContentSyncState("stable");
        }
      }
      if (!older && sessionRequestControllersRef.current.get(threadId) === controller) {
        sessionRequestControllersRef.current.delete(threadId);
        if (requestRef.current === controller) requestRef.current = null;
      }
    }
  }, []);

  const loadSession = useCallback((threadId: string, options: LoadOptions = {}) => {
    if (options.older) return loadSessionOnce(threadId, options);
    const inFlight = sessionLoadsRef.current.get(threadId);
    if (inFlight) {
      const controller = sessionRequestControllersRef.current.get(threadId);
      if (controller?.signal.aborted) sessionLoadsRef.current.delete(threadId);
      else {
        pendingSessionSyncRef.current.set(
          threadId,
          Boolean(pendingSessionSyncRef.current.get(threadId) || options.recovery),
        );
        return inFlight;
      }
    }
    const request = loadSessionOnce(threadId, options);
    sessionLoadsRef.current.set(threadId, request);
    void request.finally(() => {
      if (sessionLoadsRef.current.get(threadId) === request) sessionLoadsRef.current.delete(threadId);
      const pendingRecovery = pendingSessionSyncRef.current.get(threadId);
      if (pendingRecovery !== undefined) {
        pendingSessionSyncRef.current.delete(threadId);
      }
      if (pendingRecovery !== undefined && selectedIdRef.current === threadId) {
        window.setTimeout(() => {
          void loadSessionRef.current(threadId, { quiet: true, retry: false, recovery: pendingRecovery });
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
    setLoadingOlder(false);
    setSyncing(Boolean(cached));
    setContentSyncState("syncing");
    const params = new URLSearchParams(window.location.search);
    params.set("thread", threadId);
    params.delete("agent");
    params.delete("employee");
    params.delete("employeeId");
    params.delete("conversation");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    void loadSession(threadId, {
      quiet: Boolean(cached),
      recovery: partialSessionIdsRef.current.has(threadId),
    });
  }, [loadSession]);

  const adoptSelection = useCallback(async (threadId: string, quiet: boolean) => {
    selectedIdRef.current = threadId;
    setSelectedId(threadId);
    const cached = sessionCache.current.get(threadId);
    setSession(cached || null);
    setLoadingOlder(false);
    setLoadingSession(!cached);
    setSyncing(Boolean(cached));
    setContentSyncState(cached ? "syncing" : "stable");
    return loadSession(threadId, { quiet });
  }, [loadSession]);

  const clearSelection = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    selectedIdRef.current = "";
    setSelectedId("");
    setSession(null);
    setLoadingSession(false);
    setLoadingOlder(false);
    setSyncing(false);
    setSessionError("");
    setContentSyncState("stable");
    const params = new URLSearchParams(window.location.search);
    params.delete("thread");
    params.delete("agent");
    params.delete("employee");
    params.delete("employeeId");
    params.delete("conversation");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  const setCreatedSession = useCallback((detail: SessionDetail) => {
    pendingOptimisticMessagesRef.current.delete(detail.threadId);
    sessionCache.current.set(detail.threadId, detail);
    selectedIdRef.current = detail.threadId;
    setSelectedId(detail.threadId);
    setSession(detail);
    setLoadingSession(false);
    setLoadingOlder(false);
    setSyncing(false);
    setContentSyncState("stable");
    const params = new URLSearchParams(window.location.search);
    params.set("thread", detail.threadId);
    params.delete("agent");
    params.delete("employee");
    params.delete("employeeId");
    params.delete("conversation");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
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
      const next = { ...current, messages: mergeMessageList(current.messages, [message]) };
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
  const markSyncing = useCallback((value: boolean) => {
    setSyncing(value);
    if (value) setContentSyncState((current) => current === "recovering" ? current : "syncing");
    else setContentSyncState((current) => current === "degraded" ? current : "stable");
  }, []);
  const loadOlder = useCallback(async () => {
    if (selectedIdRef.current) await loadSession(selectedIdRef.current, { older: true });
  }, [loadSession]);

  useEffect(() => () => {
    requestRef.current?.abort();
    window.clearTimeout(retryTimerRef.current);
  }, []);

  return {
    selectedId, selectedIdRef, session, loadingSession, loadingOlder, syncing, contentSyncState, sessionError,
    setSyncing: markSyncing, loadSession, selectSession, adoptSelection, clearSelection, setCreatedSession,
    updateCurrentSession, addOptimisticMessage, removeOptimisticMessage, invalidate, loadOlder,
  };
}
