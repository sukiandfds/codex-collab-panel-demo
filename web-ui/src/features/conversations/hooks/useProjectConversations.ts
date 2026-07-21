import { useCallback, useEffect, useRef, useState } from "react";
import { conversationApi } from "../data/conversationApi";
import { hasAccessToken } from "../data/http";
import type { ProjectInfo, SessionDetail, SessionSummary } from "../model/types";
import { useConversationEvents } from "../realtime/useConversationEvents";

export function useProjectConversations() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [listError, setListError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const selectedIdRef = useRef("");
  const requestRef = useRef<AbortController | null>(null);
  const sessionCache = useRef(new Map<string, SessionDetail>());

  const loadSession = useCallback(async (threadId: string, { older = false, quiet = false } = {}) => {
    const cached = sessionCache.current.get(threadId);
    if (!older) {
      requestRef.current?.abort();
      if (cached) setSession(cached);
      if (!quiet && !cached) setLoadingSession(true);
      setSessionError("");
    } else {
      if (!cached?.hasMore || cached.nextBefore === null || cached.nextBefore === undefined) return;
      setLoadingOlder(true);
    }
    const controller = new AbortController();
    if (!older) requestRef.current = controller;
    try {
      const detail = await conversationApi.session(threadId, older ? cached?.nextBefore ?? undefined : undefined, controller.signal);
      const next = older && cached
        ? { ...detail, messages: [...detail.messages, ...cached.messages] }
        : detail;
      sessionCache.current.set(threadId, next);
      if (selectedIdRef.current === threadId) setSession(next);
    } catch (reason) {
      if (!controller.signal.aborted) setSessionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!controller.signal.aborted) {
        setLoadingSession(false);
        setLoadingOlder(false);
      }
    }
  }, []);

  const refreshSessions = useCallback(async (initial = false, changedThreadId?: string) => {
    if (initial) setLoadingList(true);
    setListError("");
    try {
      const nextSessions = await conversationApi.sessions();
      setSessions(nextSessions);
      const requestedId = new URLSearchParams(window.location.search).get("thread") || "";
      const currentId = selectedIdRef.current;
      const nextId = nextSessions.some((item) => item.threadId === currentId)
        ? currentId
        : nextSessions.some((item) => item.threadId === requestedId)
          ? requestedId
          : nextSessions[0]?.threadId || "";
      if (!nextId) {
        setSession(null);
        return;
      }
      selectedIdRef.current = nextId;
      setSelectedId(nextId);
      if (!changedThreadId || changedThreadId === nextId) await loadSession(nextId, { quiet: !initial });
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (initial) setLoadingList(false);
    }
  }, [loadSession]);

  useEffect(() => {
    if (!hasAccessToken) {
      setLoadingList(false);
      setListError("访问链接缺少令牌，请运行 pnpm start:demo 并打开输出的完整链接");
      return;
    }
    const controller = new AbortController();
    void Promise.all([
      conversationApi.project(controller.signal).then(setProject),
      refreshSessions(true),
    ]).catch((reason) => {
      if (!controller.signal.aborted) setListError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => controller.abort();
  }, [refreshSessions]);

  const onSessionsChanged = useCallback((threadId?: string) => {
    if (threadId) sessionCache.current.delete(threadId);
    void refreshSessions(false, threadId);
  }, [refreshSessions]);
  const connected = useConversationEvents(onSessionsChanged);

  useEffect(() => () => requestRef.current?.abort(), []);

  const selectSession = useCallback((threadId: string) => {
    if (threadId === selectedIdRef.current) return;
    selectedIdRef.current = threadId;
    setSelectedId(threadId);
    const cached = sessionCache.current.get(threadId);
    setSession(cached || null);
    const params = new URLSearchParams(window.location.search);
    params.set("thread", threadId);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    void loadSession(threadId);
  }, [loadSession]);

  const loadOlder = useCallback(() => {
    if (!selectedIdRef.current) return Promise.resolve();
    return loadSession(selectedIdRef.current, { older: true });
  }, [loadSession]);

  return {
    project, sessions, selectedId, session, loadingList, loadingSession, loadingOlder,
    connected, listError, sessionError, selectSession, loadOlder,
    refresh: () => refreshSessions(),
  };
}
