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
  const initialArchivedView = new URLSearchParams(window.location.search).get("archived") === "1";
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>(initialArchivedView ? [] : initial.sessions);
  const [loadingList, setLoadingList] = useState(initialArchivedView || !initial.sessions.length);
  const [archivedView, setArchivedView] = useState(initialArchivedView);
  const [creating, setCreating] = useState(false);
  const [archiveBusyId, setArchiveBusyId] = useState("");
  const [listError, setListError] = useState("");
  const archivedViewRef = useRef(initialArchivedView);
  const creatingRef = useRef(false);
  const listRetryTimerRef = useRef(0);
  const listRequestRef = useRef(0);
  const transientSessionsRef = useRef(new Map<string, SessionSummary>());
  const refreshSessionsRef = useRef<(initialLoad?: boolean, changedThreadId?: string, reloadSelected?: boolean, retry?: boolean) => Promise<void>>(async () => {});
  const listRequestInFlightRef = useRef<Promise<void> | null>(null);
  const pendingListRefreshRef = useRef<{
    initialLoad: boolean;
    changedThreadId?: string;
    reloadSelected: boolean;
    retry: boolean;
  } | null>(null);

  const refreshSessionsOnce = useCallback(async (initialLoad = false, changedThreadId?: string, reloadSelected = true, retry = true) => {
    const requestId = ++listRequestRef.current;
    if (initialLoad) setLoadingList(true);
    setListError("");
    try {
      const serverSessions = await conversationApi.sessions(archivedViewRef.current);
      if (requestId !== listRequestRef.current) return;

      const serverIds = new Set(serverSessions.map((item) => item.threadId));
      for (const threadId of serverIds) transientSessionsRef.current.delete(threadId);
      const transientSessions = archivedViewRef.current
        ? []
        : Array.from(transientSessionsRef.current.values()).reverse();
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

  const refreshSessions = useCallback((initialLoad = false, changedThreadId?: string, reloadSelected = true, retry = true) => {
    const inFlight = listRequestInFlightRef.current;
    if (inFlight) {
      const pending = pendingListRefreshRef.current || {
        initialLoad: false,
        changedThreadId,
        reloadSelected: false,
        retry: false,
      };
      pending.initialLoad ||= initialLoad;
      pending.changedThreadId = pending.changedThreadId === changedThreadId ? changedThreadId : undefined;
      pending.reloadSelected ||= reloadSelected;
      pending.retry ||= retry;
      pendingListRefreshRef.current = pending;
      return inFlight;
    }

    const request = refreshSessionsOnce(initialLoad, changedThreadId, reloadSelected, retry);
    listRequestInFlightRef.current = request;
    void request.finally(() => {
      if (listRequestInFlightRef.current !== request) return;
      listRequestInFlightRef.current = null;
      const pending = pendingListRefreshRef.current;
      pendingListRefreshRef.current = null;
      if (pending) {
        window.setTimeout(() => {
          void refreshSessionsRef.current(
            pending.initialLoad,
            pending.changedThreadId,
            pending.reloadSelected,
            pending.retry,
          );
        }, 0);
      }
    }).catch(() => {});
    return request;
  }, [refreshSessionsOnce]);
  refreshSessionsRef.current = refreshSessions;

  const updateArchiveQuery = useCallback((archived: boolean) => {
    const params = new URLSearchParams(window.location.search);
    if (archived) params.set("archived", "1");
    else params.delete("archived");
    params.delete("thread");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  const setArchiveViewMode = useCallback(async (archived: boolean) => {
    if (archived === archivedViewRef.current) return;
    archivedViewRef.current = archived;
    setArchivedView(archived);
    selection.clearSelection();
    updateArchiveQuery(archived);
    await refreshSessions(true, undefined, false);
  }, [refreshSessions, selection.clearSelection, updateArchiveQuery]);

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
      if (archivedViewRef.current) {
        archivedViewRef.current = false;
        setArchivedView(false);
        setSessions([]);
        selection.clearSelection();
        updateArchiveQuery(false);
      }
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
  }, [currentModel, selection.clearSelection, selection.setCreatedSession, updateArchiveQuery]);

  const forkSession = useCallback(async (threadId: string, lastTurnId: string) => {
    setListError("");
    try {
      const result = await conversationApi.fork(threadId, lastTurnId);
      const created = result.session;
      const detail: SessionDetail = { ...created, archived: false, messages: [] };
      transientSessionsRef.current.set(created.threadId, created);
      archivedViewRef.current = false;
      setArchivedView(false);
      updateArchiveQuery(false);
      setSessions((current) => [created, ...current.filter((item) => item.threadId !== created.threadId)]);
      selection.setCreatedSession(detail);
      await selection.loadSession(created.threadId, { quiet: false });
      return true;
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : String(reason));
      return false;
    }
  }, [selection.loadSession, selection.setCreatedSession, updateArchiveQuery]);

  const archiveSession = useCallback(async (threadId: string) => {
    if (archiveBusyId) return false;
    setArchiveBusyId(threadId);
    setListError("");
    try {
      await conversationApi.archive(threadId);
      transientSessionsRef.current.delete(threadId);
      if (selection.selectedIdRef.current === threadId) selection.clearSelection();
      await refreshSessions(false, threadId, false);
      return true;
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setArchiveBusyId("");
    }
  }, [archiveBusyId, refreshSessions, selection.clearSelection, selection.selectedIdRef]);

  const unarchiveSession = useCallback(async (threadId: string) => {
    if (archiveBusyId) return false;
    setArchiveBusyId(threadId);
    setListError("");
    try {
      await conversationApi.unarchive(threadId);
      if (selection.selectedIdRef.current === threadId) selection.clearSelection();
      await refreshSessions(false, threadId, false);
      return true;
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setArchiveBusyId("");
    }
  }, [archiveBusyId, refreshSessions, selection.clearSelection, selection.selectedIdRef]);

  useEffect(() => () => window.clearTimeout(listRetryTimerRef.current), []);

  return {
    project,
    sessions,
    archivedView,
    loadingList,
    creating,
    archiveBusyId,
    listError,
    refreshSessions,
    setArchiveViewMode,
    createSession,
    forkSession,
    archiveSession,
    unarchiveSession,
  };
}
