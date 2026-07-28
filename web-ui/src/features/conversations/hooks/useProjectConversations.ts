import { useCallback, useEffect, useRef, useState } from "react";
import { conversationApi } from "../data/conversationApi";
import { readConversationSnapshot, writeConversationSnapshot } from "../data/conversationSnapshot";
import { hasAccessToken } from "../data/http";
import type { ContentBlock, MediaFile, ProjectInfo, SessionDetail, SessionMessage, SessionSummary } from "../model/types";
import { useConversationEvents } from "../realtime/useConversationEvents";
import { useCodexExecution } from "../../execution/hooks/useCodexExecution";
import { useContextManagement } from "../../context-management/hooks/useContextManagement";
import { useModels } from "../../models/hooks/useModels";
import type { ProjectEvent } from "../../execution/model/types";

let nextOptimisticMessageId = 1;

const optimisticBlocks = (messageId: string, text: string, attachments: MediaFile[]): ContentBlock[] => {
  const blocks: ContentBlock[] = text
    ? [{ id: `${messageId}-text`, type: "markdown", text }]
    : [];
  for (const file of attachments) {
    const common = { id: `${messageId}-${file.id}`, source: file.url, file };
    if (file.mimeType.startsWith("image/")) blocks.push({ ...common, type: "image", alt: file.name });
    else if (file.mimeType.startsWith("audio/")) blocks.push({ ...common, type: "audio" });
    else if (file.mimeType.startsWith("video/")) blocks.push({ ...common, type: "video" });
    else blocks.push({ ...common, type: "file", name: file.name });
  }
  return blocks;
};

export function useProjectConversations() {
  const [initialSnapshot] = useState(() => readConversationSnapshot());
  const [initialSelectedId] = useState(() => new URLSearchParams(window.location.search).get("thread")
    || initialSnapshot?.selectedId
    || "");
  const [initialSession] = useState<SessionDetail | null>(() => initialSnapshot?.session?.threadId === initialSelectedId
    ? initialSnapshot.session
    : null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>(() => initialSnapshot?.sessions || []);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [session, setSession] = useState<SessionDetail | null>(initialSession);
  const [loadingList, setLoadingList] = useState(!initialSnapshot?.sessions.length);
  const [loadingSession, setLoadingSession] = useState(Boolean(initialSelectedId) && !initialSession);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [syncing, setSyncing] = useState(Boolean(initialSession));
  const [creating, setCreating] = useState(false);
  const [listError, setListError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const selectedIdRef = useRef(initialSelectedId);
  const requestRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef(0);
  const listRetryTimerRef = useRef(0);
  const creatingRef = useRef(false);
  const sessionCache = useRef(new Map<string, SessionDetail>(initialSession
    ? [[initialSession.threadId, initialSession]]
    : []));
  const loadSessionRef = useRef<(threadId: string, options?: { older?: boolean; quiet?: boolean; retry?: boolean }) => Promise<boolean>>(
    async () => false,
  );
  const refreshSessionsRef = useRef<(initial?: boolean, changedThreadId?: string, reloadSelected?: boolean, retry?: boolean) => Promise<void>>(
    async () => {},
  );

  const loadSession = useCallback(async (threadId: string, { older = false, quiet = false, retry = true } = {}) => {
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
      const next = older && cached
        ? { ...detail, messages: [...detail.messages, ...cached.messages] }
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
  loadSessionRef.current = loadSession;

  const refreshSessions = useCallback(async (initial = false, changedThreadId?: string, reloadSelected = true, retry = true) => {
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
      const selectionChanged = nextId !== currentId;
      if ((reloadSelected || selectionChanged) && (!changedThreadId || changedThreadId === nextId)) {
        await loadSession(nextId, { quiet: !initial });
      }
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : String(reason));
      if (retry) {
        window.clearTimeout(listRetryTimerRef.current);
        listRetryTimerRef.current = window.setTimeout(() => {
          void refreshSessionsRef.current(false, changedThreadId, reloadSelected, false);
        }, 10000);
      }
    } finally {
      if (initial) setLoadingList(false);
    }
  }, [loadSession]);
  refreshSessionsRef.current = refreshSessions;

  useEffect(() => {
    if (!hasAccessToken) {
      setLoadingList(false);
      setListError("访问链接缺少令牌，请运行 pnpm start:demo 并打开输出的完整链接");
      return;
    }
    const controller = new AbortController();
    const hasCachedList = Boolean(initialSnapshot?.sessions.length);
    const hasCachedSession = Boolean(initialSession);
    if (hasCachedSession) setSyncing(true);
    const initialSessionRequest = initialSelectedId
      ? loadSession(initialSelectedId, { quiet: hasCachedSession })
      : Promise.resolve(false);
    void Promise.all([
      conversationApi.project(controller.signal).then(setProject),
      refreshSessions(!hasCachedList, undefined, !initialSelectedId),
      initialSessionRequest,
    ]).catch((reason) => {
      if (!controller.signal.aborted) setListError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => setSyncing(false));
    return () => controller.abort();
  }, [initialSelectedId, initialSession, initialSnapshot?.sessions.length, loadSession, refreshSessions]);

  useEffect(() => {
    if (!selectedId || !session) return;
    const timer = window.setTimeout(() => {
      writeConversationSnapshot({ selectedId, sessions, session });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [selectedId, session, sessions]);

  const onMessageAccepted = useCallback(() => {
    if (selectedIdRef.current) void loadSession(selectedIdRef.current, { quiet: true });
  }, [loadSession]);
  const execution = useCodexExecution(selectedId, onMessageAccepted);
  const contextManagement = useContextManagement(selectedId);
  const onModelChanged = useCallback(() => {
    void contextManagement.refresh();
  }, [contextManagement.refresh]);
  const modelManager = useModels(selectedId, onModelChanged);
  const sendMessage = useCallback(async (text: string, attachments: MediaFile[] = []) => {
    const threadId = selectedIdRef.current;
    const messageText = text.trim();
    if (!threadId || (!messageText && !attachments.length)) return false;

    const messageId = `optimistic-${Date.now().toString(36)}-${nextOptimisticMessageId++}`;
    const optimisticMessage: SessionMessage = {
      id: messageId,
      role: "user",
      text: messageText,
      blocks: optimisticBlocks(messageId, messageText, attachments),
    };
    setSession((current) => {
      if (!current || current.threadId !== threadId) return current;
      const next = { ...current, messages: [...current.messages, optimisticMessage] };
      sessionCache.current.set(threadId, next);
      return next;
    });

    const sent = await execution.sendMessage(messageText, attachments.map((attachment) => attachment.id));
    if (!sent) {
      setSession((current) => {
        if (!current || current.threadId !== threadId) return current;
        const next = { ...current, messages: current.messages.filter((message) => message.id !== messageId) };
        sessionCache.current.set(threadId, next);
        return next;
      });
    }
    return sent;
  }, [execution.sendMessage]);
  const onSessionsChanged = useCallback((threadId?: string) => {
    if (threadId) sessionCache.current.delete(threadId);
    const selected = selectedIdRef.current;
    if (selected && (!threadId || threadId === selected)) {
      void loadSession(selected, { quiet: true }).then((loaded) => {
        if (loaded) execution.clearStreaming();
      });
    }
    void refreshSessions(false, threadId, false);
  }, [execution.clearStreaming, loadSession, refreshSessions]);
  const handleEvent = useCallback((event: ProjectEvent) => {
    execution.handleEvent(event);
    if (event.type === "context_status") contextManagement.handleEvent(event);
  }, [contextManagement.handleEvent, execution.handleEvent]);
  const recoverRealtime = useCallback(() => {
    onSessionsChanged();
    void execution.refreshStatus();
  }, [execution.refreshStatus, onSessionsChanged]);
  const connected = useConversationEvents(
    onSessionsChanged,
    handleEvent,
    recoverRealtime,
    execution.status.active,
    execution.status.phase === "submitted",
  );

  useEffect(() => {
    if (connected && selectedId) void execution.refreshStatus();
  }, [connected, execution.refreshStatus, selectedId]);

  useEffect(() => () => {
    requestRef.current?.abort();
    window.clearTimeout(retryTimerRef.current);
    window.clearTimeout(listRetryTimerRef.current);
  }, []);

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

  const createSession = useCallback(async () => {
    if (creatingRef.current) return false;
    creatingRef.current = true;
    setCreating(true);
    setListError("");
    try {
      const created = await conversationApi.create(contextManagement.status.model);
      const detail: SessionDetail = { ...created, messages: [] };
      sessionCache.current.set(created.threadId, detail);
      selectedIdRef.current = created.threadId;
      setSelectedId(created.threadId);
      setSession(detail);
      setSessions((current) => [created, ...current.filter((item) => item.threadId !== created.threadId)]);
      const params = new URLSearchParams(window.location.search);
      params.set("thread", created.threadId);
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      void refreshSessions(false, created.threadId, false);
      return true;
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [contextManagement.status.model, refreshSessions]);

  const loadOlder = useCallback(async () => {
    if (!selectedIdRef.current) return;
    await loadSession(selectedIdRef.current, { older: true });
  }, [loadSession]);

  return {
    project, sessions, selectedId, session, loadingList, loadingSession, loadingOlder, syncing,
    connected, listError, sessionError, selectSession, createSession, creating, loadOlder,
    executionStatus: execution.status,
    streamingText: execution.streamingText,
    commentaryText: execution.commentaryText,
    contextStatus: contextManagement.status,
    models: modelManager.models,
    modelsLoading: modelManager.loading,
    modelChanging: modelManager.changing,
    modelError: modelManager.error,
    sending: execution.sending,
    sendMessage,
    interrupt: execution.interrupt,
    compactContext: contextManagement.compact,
    setAutoCompactThreshold: contextManagement.setThreshold,
    changeModel: modelManager.change,
    refresh: () => refreshSessions(),
  };
}
