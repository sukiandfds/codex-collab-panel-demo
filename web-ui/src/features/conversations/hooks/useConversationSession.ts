import { useCallback, useEffect, useRef, useState } from "react";
import type { InitialConversationState } from "../state/initialConversation";
import { conversationApi } from "../data/conversationApi";
import type { SessionDetail } from "../model/types";

type LoadOptions = { older?: boolean; quiet?: boolean; retry?: boolean };

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
  const sessionCache = useRef(new Map<string, SessionDetail>(initial.session
    ? [[initial.session.threadId, initial.session]]
    : []));
  const loadSessionRef = useRef<(threadId: string, options?: LoadOptions) => Promise<boolean>>(async () => false);

  const loadSession = useCallback(async (threadId: string, { older = false, quiet = false, retry = true }: LoadOptions = {}) => {
    const cached = sessionCache.current.get(threadId);
    if (!older) {
      requestRef.current?.abort();
      if (cached) setSession(cached);
      if (!quiet && !cached) setLoadingSession(true);
      setSessionError("");
    } else {
      if (!cached?.hasMore || cached.nextBefore === null || cached.nextBefore === undefined) return false;
      setLoadingOlder(true);
    }
    const controller = new AbortController();
    if (!older) requestRef.current = controller;
    try {
      const detail = await conversationApi.session(threadId, older ? cached?.nextBefore ?? undefined : undefined, controller.signal);
      const next = older && cached ? { ...detail, messages: [...detail.messages, ...cached.messages] } : detail;
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
    setSyncing, loadSession, selectSession, adoptSelection, clearSelection, setCreatedSession,
    updateCurrentSession, invalidate, loadOlder,
  };
}
