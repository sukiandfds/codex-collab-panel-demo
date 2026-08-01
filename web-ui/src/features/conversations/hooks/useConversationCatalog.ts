import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { hasAccessToken } from "../../../shared/api/http";
import { conversationApi } from "../data/conversationApi";
import type { ProjectInfo, SessionDetail, SessionSummary } from "../model/types";
import type { InitialConversationState } from "../state/initialConversation";

interface ConversationSelection {
  selectedIdRef: MutableRefObject<string>;
  loadSession: (threadId: string, options?: { older?: boolean; quiet?: boolean; retry?: boolean }) => Promise<boolean>;
  adoptSelection: (threadId: string, quiet: boolean) => Promise<boolean>;
  clearSelection: () => void;
  setCreatedSession: (detail: SessionDetail) => void;
  setSyncing: (syncing: boolean) => void;
}

export function useConversationCatalog(
  initial: InitialConversationState,
  selection: ConversationSelection,
  currentModel: string,
) {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>(initial.sessions);
  const [loadingList, setLoadingList] = useState(!initial.sessions.length);
  const [creating, setCreating] = useState(false);
  const [listError, setListError] = useState("");
  const creatingRef = useRef(false);
  const listRetryTimerRef = useRef(0);
  const listRequestRef = useRef(0);
  const transientSessionsRef = useRef(new Map<string, SessionSummary>());
  const refreshSessionsRef = useRef<(initialLoad?: boolean, changedThreadId?: string, reloadSelected?: boolean, retry?: boolean) => Promise<void>>(async () => {});

  const refreshSessions = useCallback(async (initialLoad = false, changedThreadId?: string, reloadSelected = true, retry = true) => {
    const requestId = ++listRequestRef.current;
    if (initialLoad) setLoadingList(true);
    setListError("");
    try {
      const serverSessions = await conversationApi.sessions();
      if (requestId !== listRequestRef.current) return;

      const serverIds = new Set(serverSessions.map((item) => item.threadId));
      for (const threadId of serverIds) transientSessionsRef.current.delete(threadId);
      const transientSessions = Array.from(transientSessionsRef.current.values()).reverse();
      const nextSessions = [...transientSessions, ...serverSessions];
      setSessions(nextSessions);
      const requestedId = new URLSearchParams(window.location.search).get("thread") || "";
      const currentId = selection.selectedIdRef.current;
      const nextId = nextSessions.some((item) => item.threadId === currentId)
        ? currentId
        : nextSessions.some((item) => item.threadId === requestedId)
          ? requestedId
          : nextSessions[0]?.threadId || "";
      if (!nextId) {
        selection.clearSelection();
        return;
      }
      const selectionChanged = nextId !== currentId;
      if (selectionChanged) await selection.adoptSelection(nextId, !initialLoad);
      else if (reloadSelected && (!changedThreadId || changedThreadId === nextId)) {
        await selection.loadSession(nextId, { quiet: !initialLoad });
      }
    } catch (reason) {
      if (requestId !== listRequestRef.current) return;
      setListError(reason instanceof Error ? reason.message : String(reason));
      if (retry) {
        window.clearTimeout(listRetryTimerRef.current);
        listRetryTimerRef.current = window.setTimeout(() => {
          void refreshSessionsRef.current(false, changedThreadId, reloadSelected, false);
        }, 10000);
      }
    } finally {
      if (initialLoad) setLoadingList(false);
    }
  }, [selection.adoptSelection, selection.clearSelection, selection.loadSession, selection.selectedIdRef]);
  refreshSessionsRef.current = refreshSessions;

  useEffect(() => {
    if (!hasAccessToken) {
      setLoadingList(false);
      setListError("访问链接缺少令牌，请运行 pnpm start:demo 并打开输出的完整链接");
      return;
    }
    const controller = new AbortController();
    const hasCachedList = Boolean(initial.sessions.length);
    const hasCachedSession = Boolean(initial.session);
    if (hasCachedSession) selection.setSyncing(true);
    const initialSessionRequest = initial.selectedId
      ? selection.loadSession(initial.selectedId, { quiet: hasCachedSession })
      : Promise.resolve(false);
    void Promise.all([
      conversationApi.project(controller.signal).then(setProject),
      refreshSessions(!hasCachedList, undefined, !initial.selectedId),
      initialSessionRequest,
    ]).catch((reason) => {
      if (!controller.signal.aborted) setListError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => selection.setSyncing(false));
    return () => controller.abort();
  }, [initial, refreshSessions, selection.loadSession, selection.setSyncing]);

  const createSession = useCallback(async () => {
    if (creatingRef.current) return false;
    creatingRef.current = true;
    setCreating(true);
    setListError("");
    try {
      const created = await conversationApi.create(currentModel);
      const detail: SessionDetail = { ...created, messages: [] };
      transientSessionsRef.current.set(created.threadId, created);
      selection.setCreatedSession(detail);
      setSessions((current) => [created, ...current.filter((item) => item.threadId !== created.threadId)]);
      return true;
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [currentModel, selection.setCreatedSession]);

  useEffect(() => () => window.clearTimeout(listRetryTimerRef.current), []);

  return { project, sessions, loadingList, creating, listError, refreshSessions, createSession };
}
