import { useCallback, useEffect, useRef, useState } from "react";
import { conversationApi } from "../data/conversationApi";
import { hasAccessToken } from "../data/http";
import type { ContentBlock, MediaFile, ProjectInfo, SessionDetail, SessionMessage, SessionSummary } from "../model/types";
import { useConversationEvents } from "../realtime/useConversationEvents";
import { useCodexExecution } from "../../execution/hooks/useCodexExecution";
import { useContextManagement } from "../../context-management/hooks/useContextManagement";
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
      return true;
    } catch (reason) {
      if (!controller.signal.aborted) setSessionError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      if (!controller.signal.aborted) {
        setLoadingSession(false);
        setLoadingOlder(false);
      }
    }
  }, []);

  const refreshSessions = useCallback(async (initial = false, changedThreadId?: string, reloadSelected = true) => {
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
      if (reloadSelected && (!changedThreadId || changedThreadId === nextId)) await loadSession(nextId, { quiet: !initial });
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

  const onMessageAccepted = useCallback(() => {
    if (selectedIdRef.current) void loadSession(selectedIdRef.current, { quiet: true });
  }, [loadSession]);
  const execution = useCodexExecution(selectedId, onMessageAccepted);
  const contextManagement = useContextManagement(selectedId);
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
  const connected = useConversationEvents(onSessionsChanged, handleEvent);

  useEffect(() => {
    if (connected && selectedId) void execution.refreshStatus();
  }, [connected, execution.refreshStatus, selectedId]);

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

  const loadOlder = useCallback(async () => {
    if (!selectedIdRef.current) return;
    await loadSession(selectedIdRef.current, { older: true });
  }, [loadSession]);

  return {
    project, sessions, selectedId, session, loadingList, loadingSession, loadingOlder,
    connected, listError, sessionError, selectSession, loadOlder,
    executionStatus: execution.status,
    streamingText: execution.streamingText,
    commentaryText: execution.commentaryText,
    contextStatus: contextManagement.status,
    sending: execution.sending,
    sendMessage,
    interrupt: execution.interrupt,
    compactContext: contextManagement.compact,
    setAutoCompactThreshold: contextManagement.setThreshold,
    refresh: () => refreshSessions(),
  };
}
