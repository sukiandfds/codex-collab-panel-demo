import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { hasAccessToken } from "../../../shared/api/http";
import { conversationApi } from "../data/conversationApi";
import type { ProjectInfo, SessionDetail, SessionSummary } from "../model/types";
import type { InitialConversationState } from "../state/initialConversation";

interface ConversationSelection {
  selectedIdRef: MutableRefObject<string>;
  loadSession: (threadId: string, options?: { older?: boolean; quiet?: boolean; retry?: boolean; recovery?: boolean }) => Promise<boolean>;
  adoptSelection: (threadId: string, quiet: boolean) => Promise<boolean>;
  clearSelection: () => void;
  setCreatedSession: (detail: SessionDetail) => void;
}

interface RemovedSession {
  session: SessionSummary;
  index: number;
  archivedView: boolean;
}

const archiveIconFeedbackMs = 110;
const waitForArchiveIconFeedback = () => new Promise<void>((resolve) => {
  window.setTimeout(resolve, archiveIconFeedbackMs);
});

const sameSessionSummary = (left: SessionSummary, right: SessionSummary) => (
  left.threadId === right.threadId
  && left.source === right.source
  && left.title === right.title
  && left.updatedAt === right.updatedAt
  && left.messageCount === right.messageCount
  && left.latestUser === right.latestUser
  && left.latestAssistant === right.latestAssistant
  && left.archived === right.archived
  && left.archivable === right.archivable
  && left.conversationKind === right.conversationKind
  && left.readOnly === right.readOnly
  && left.forkedFromId === right.forkedFromId
  && left.cwd === right.cwd
);

const sameSessionList = (left: SessionSummary[], right: SessionSummary[]) => (
  left.length === right.length && left.every((session, index) => sameSessionSummary(session, right[index]))
);

export function useConversationCatalog(
  initial: InitialConversationState,
  selection: ConversationSelection,
  currentModel: string,
) {
  const initialArchivedView = new URLSearchParams(window.location.search).get("archived") === "1";
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>(initialArchivedView ? [] : initial.sessions);
  const [loadingList, setLoadingList] = useState(initialArchivedView || !initial.sessions.length);
  const [initialSyncReady, setInitialSyncReady] = useState(false);
  const [archivedView, setArchivedView] = useState(initialArchivedView);
  const [creating, setCreating] = useState(false);
  const [archiveBusyIds, setArchiveBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [listError, setListError] = useState("");
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const archivedViewRef = useRef(initialArchivedView);
  const creatingRef = useRef(false);
  const archiveBusyIdsRef = useRef(new Set<string>());
  const listRetryTimerRef = useRef(0);
  const listRequestRef = useRef(0);
  const listAbortControllerRef = useRef<AbortController | null>(null);
  const transientSessionsRef = useRef(new Map<string, SessionSummary>());
  const refreshSessionsRef = useRef<(initialLoad?: boolean, changedThreadId?: string, reloadSelected?: boolean, retry?: boolean) => Promise<void>>(async () => {});

  const refreshSessionsOnce = useCallback(async (initialLoad = false, changedThreadId?: string, reloadSelected = true, retry = true) => {
    const requestId = ++listRequestRef.current;
    const requestedArchivedView = archivedViewRef.current;
    listAbortControllerRef.current?.abort();
    const controller = new AbortController();
    listAbortControllerRef.current = controller;
    if (initialLoad) setLoadingList(true);
    setListError("");
    try {
      const serverSessions = (await conversationApi.sessions(requestedArchivedView, controller.signal))
        .filter((item) => !archiveBusyIdsRef.current.has(item.threadId));
      if (requestId !== listRequestRef.current || requestedArchivedView !== archivedViewRef.current) return;

      const serverIds = new Set(serverSessions.map((item) => item.threadId));
      for (const threadId of serverIds) transientSessionsRef.current.delete(threadId);
      const transientSessions = archivedViewRef.current
        ? []
        : Array.from(transientSessionsRef.current.values()).reverse();
      const nextSessions = [...transientSessions, ...serverSessions];
      if (!sameSessionList(sessionsRef.current, nextSessions)) {
        sessionsRef.current = nextSessions;
        setSessions(nextSessions);
      }
      if (requestedArchivedView) {
        if (selection.selectedIdRef.current) selection.clearSelection();
        return;
      }
      const requestedId = new URLSearchParams(window.location.search).get("thread") || "";
      const currentId = selection.selectedIdRef.current;
      const agentScoped = Boolean(new URLSearchParams(window.location.search).get("agent"));
      if (agentScoped) {
        const pinnedId = requestedId || currentId;
        if (!pinnedId) return;
        if (currentId !== pinnedId) await selection.adoptSelection(pinnedId, !initialLoad);
        else if (reloadSelected && (!changedThreadId || changedThreadId === pinnedId)) {
          await selection.loadSession(pinnedId, { quiet: !initialLoad });
        }
        return;
      }
      const nextId = nextSessions.some((item) => item.threadId === requestedId)
        ? requestedId
        : nextSessions.some((item) => item.threadId === currentId)
          ? currentId
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
      if (controller.signal.aborted) return;
      if (requestId !== listRequestRef.current || requestedArchivedView !== archivedViewRef.current) return;
      setListError(reason instanceof Error ? reason.message : String(reason));
      if (retry) {
        window.clearTimeout(listRetryTimerRef.current);
        listRetryTimerRef.current = window.setTimeout(() => {
          void refreshSessionsRef.current(false, changedThreadId, reloadSelected, false);
        }, 10000);
      }
    } finally {
      if (listAbortControllerRef.current === controller) listAbortControllerRef.current = null;
      if (!controller.signal.aborted && requestId === listRequestRef.current && requestedArchivedView === archivedViewRef.current) {
        setLoadingList(false);
      }
    }
  }, [selection.adoptSelection, selection.clearSelection, selection.loadSession, selection.selectedIdRef]);

  const refreshSessions = useCallback(
    (initialLoad = false, changedThreadId?: string, reloadSelected = true, retry = true) => (
      refreshSessionsOnce(initialLoad, changedThreadId, reloadSelected, retry)
    ),
    [refreshSessionsOnce],
  );
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
    sessionsRef.current = [];
    setSessions([]);
    selection.clearSelection();
    updateArchiveQuery(archived);
    await refreshSessions(true, undefined, false);
  }, [refreshSessions, selection.clearSelection, updateArchiveQuery]);

  useEffect(() => {
    if (!hasAccessToken) {
      setLoadingList(false);
      setListError("访问链接缺少令牌，请运行 pnpm start:demo 并打开输出的完整链接");
      setInitialSyncReady(true);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const hasCachedList = Boolean(initial.sessions.length);
    const hasCachedSession = Boolean(initial.session);
    const initialSessionRequest = initial.selectedId
      ? selection.loadSession(initial.selectedId, { quiet: hasCachedSession, recovery: initial.sessionIsPartial })
      : Promise.resolve(false);
    void Promise.allSettled([
      conversationApi.project(controller.signal).then(setProject),
      refreshSessions(!hasCachedList, undefined, !initial.selectedId),
      initialSessionRequest,
    ]).then((results) => {
      if (cancelled || controller.signal.aborted) return;
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (rejected) {
        const reason = rejected.reason;
        setListError(reason instanceof Error ? reason.message : String(reason));
      }
    }).finally(() => {
      if (cancelled) return;
      setInitialSyncReady(true);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [initial, refreshSessions, selection.loadSession]);

  const createSession = useCallback(async (projectRoot = "") => {
    if (creatingRef.current) return false;
    creatingRef.current = true;
    setCreating(true);
    setListError("");
    try {
      if (archivedViewRef.current) {
        archivedViewRef.current = false;
        setArchivedView(false);
        sessionsRef.current = [];
        setSessions([]);
        selection.clearSelection();
        updateArchiveQuery(false);
      }
      const created = await conversationApi.create(currentModel, projectRoot);
      const detail: SessionDetail = { ...created, messages: [] };
      transientSessionsRef.current.set(created.threadId, created);
      selection.setCreatedSession(detail);
      const nextSessions = [created, ...sessionsRef.current.filter((item) => item.threadId !== created.threadId)];
      sessionsRef.current = nextSessions;
      setSessions(nextSessions);
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
      const nextSessions = [created, ...sessionsRef.current.filter((item) => item.threadId !== created.threadId)];
      sessionsRef.current = nextSessions;
      setSessions(nextSessions);
      selection.setCreatedSession(detail);
      await selection.loadSession(created.threadId, { quiet: false });
      return true;
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : String(reason));
      return false;
    }
  }, [selection.loadSession, selection.setCreatedSession, updateArchiveQuery]);

  const beginArchiveOperation = useCallback((threadId: string) => {
    if (archiveBusyIdsRef.current.has(threadId)) return false;
    const next = new Set(archiveBusyIdsRef.current);
    next.add(threadId);
    archiveBusyIdsRef.current = next;
    setArchiveBusyIds(next);
    return true;
  }, []);

  const finishArchiveOperation = useCallback((threadId: string) => {
    const next = new Set(archiveBusyIdsRef.current);
    next.delete(threadId);
    archiveBusyIdsRef.current = next;
    setArchiveBusyIds(next);
  }, []);

  const removeSessionOptimistically = useCallback((threadId: string): RemovedSession | null => {
    const index = sessionsRef.current.findIndex((item) => item.threadId === threadId);
    if (index < 0) return null;
    const removed = { session: sessionsRef.current[index], index, archivedView: archivedViewRef.current };
    const next = sessionsRef.current.filter((item) => item.threadId !== threadId);
    sessionsRef.current = next;
    setSessions(next);
    return removed;
  }, []);

  const restoreRemovedSession = useCallback((removed: RemovedSession | null) => {
    if (!removed || removed.archivedView !== archivedViewRef.current) return;
    if (sessionsRef.current.some((item) => item.threadId === removed.session.threadId)) return;
    const next = [...sessionsRef.current];
    next.splice(Math.min(removed.index, next.length), 0, removed.session);
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  const archiveSession = useCallback(async (threadId: string) => {
    if (!beginArchiveOperation(threadId)) return false;
    let removed: RemovedSession | null = null;
    let requestFailed = false;
    let requestError: unknown;
    setListError("");
    try {
      const request = conversationApi.archive(threadId).catch((reason) => {
        requestFailed = true;
        requestError = reason;
      });
      await waitForArchiveIconFeedback();
      if (requestFailed) throw requestError;
      removed = removeSessionOptimistically(threadId);
      await request;
      if (requestFailed) throw requestError;
      window.dispatchEvent(new CustomEvent("negus:conversation-archived", { detail: { threadId } }));
      transientSessionsRef.current.delete(threadId);
      if (selection.selectedIdRef.current === threadId) selection.clearSelection();
      return true;
    } catch (reason) {
      restoreRemovedSession(removed);
      setListError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      finishArchiveOperation(threadId);
    }
  }, [beginArchiveOperation, finishArchiveOperation, removeSessionOptimistically, restoreRemovedSession, selection.clearSelection, selection.selectedIdRef]);

  const unarchiveSession = useCallback(async (threadId: string) => {
    if (!beginArchiveOperation(threadId)) return false;
    let removed: RemovedSession | null = null;
    let requestFailed = false;
    let requestError: unknown;
    setListError("");
    try {
      const request = conversationApi.unarchive(threadId).catch((reason) => {
        requestFailed = true;
        requestError = reason;
      });
      await waitForArchiveIconFeedback();
      if (requestFailed) throw requestError;
      removed = removeSessionOptimistically(threadId);
      await request;
      if (requestFailed) throw requestError;
      if (selection.selectedIdRef.current === threadId) selection.clearSelection();
      return true;
    } catch (reason) {
      restoreRemovedSession(removed);
      setListError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      finishArchiveOperation(threadId);
    }
  }, [beginArchiveOperation, finishArchiveOperation, removeSessionOptimistically, restoreRemovedSession, selection.clearSelection, selection.selectedIdRef]);

  useEffect(() => () => {
    window.clearTimeout(listRetryTimerRef.current);
    listAbortControllerRef.current?.abort();
  }, []);

  return {
    project,
    sessions,
    archivedView,
    loadingList,
    initialSyncReady,
    creating,
    archiveBusyIds,
    listError,
    refreshSessions,
    setArchiveViewMode,
    createSession,
    forkSession,
    archiveSession,
    unarchiveSession,
  };
}
