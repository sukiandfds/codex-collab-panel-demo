import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaFile } from "../../../shared/model/media";
import type { RealtimeRecoveryReason } from "../../../shared/model/realtime";
import { useContextManagement } from "../../context-management/hooks/useContextManagement";
import { executionApi } from "../../execution/data/executionApi";
import { useCodexExecution } from "../../execution/hooks/useCodexExecution";
import type { ProjectEvent } from "../../execution/model/types";
import { useModels } from "../../models/hooks/useModels";
import { writeConversationSnapshot } from "../data/conversationSnapshot";
import { conversationApi } from "../data/conversationApi";
import { useConversationEvents } from "../realtime/useConversationEvents";
import { createOptimisticMessage, createSubmissionId } from "../state/optimisticMessage";
import { readInitialConversationState } from "../state/initialConversation";
import { useConversationCatalog } from "./useConversationCatalog";
import { useConversationSession } from "./useConversationSession";
import { useFollowUpQueue } from "./useFollowUpQueue";
import { useThreadGoal } from "../../goals/hooks/useThreadGoal";
import type { SessionMessage } from "../model/types";

const attachmentsFromMessage = (message: SessionMessage): MediaFile[] => {
  const attachments = new Map<string, MediaFile>();
  for (const block of message.blocks || []) {
    if ("file" in block && block.file) attachments.set(block.file.id, block.file);
  }
  return [...attachments.values()];
};

const conversationLocationKey = () => {
  const params = new URLSearchParams(window.location.search);
  return JSON.stringify([
    params.get("thread") || "",
    params.get("agent") || "",
    params.get("employee") || "",
    params.get("conversation") || "",
    params.get("archived") === "1",
  ]);
};

export function useProjectConversations() {
  const [initial] = useState(readInitialConversationState);
  const selection = useConversationSession(initial);

  const execution = useCodexExecution(selection.selectedId);
  const followUpQueue = useFollowUpQueue(selection.selectedId);
  const goal = useThreadGoal(selection.selectedId);
  const [forkingMessageId, setForkingMessageId] = useState("");
  const [editingMessage, setEditingMessage] = useState<SessionMessage | null>(null);
  const editingMessageRef = useRef<SessionMessage | null>(null);
  const pendingEditRef = useRef<{
    threadId: string;
    text: string;
    attachments: MediaFile[];
    resolve: (accepted: boolean) => void;
  } | null>(null);
  const [editRequestVersion, setEditRequestVersion] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [retryingMessageId, setRetryingMessageId] = useState("");
  const [localSendVersion, setLocalSendVersion] = useState(0);
  const reconcilingSubmissionsRef = useRef(new Set<string>());
  const contextManagement = useContextManagement(selection.selectedId);
  const onModelChanged = useCallback(() => {
    void contextManagement.refresh();
  }, [contextManagement.refresh]);
  const modelManager = useModels(selection.selectedId, onModelChanged);
  const catalog = useConversationCatalog(initial, {
    selectedIdRef: selection.selectedIdRef,
    loadSession: selection.loadSession,
    adoptSelection: selection.adoptSelection,
    clearSelection: selection.clearSelection,
    setCreatedSession: selection.setCreatedSession,
  }, contextManagement.status.model);

  const syncLocation = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const requestedArchived = params.get("archived") === "1";
    if (requestedArchived !== catalog.archivedView) {
      await catalog.setArchiveViewMode(requestedArchived);
      return;
    }
    const requestedId = params.get("thread") || "";
    const currentId = selection.selectedIdRef.current;
    if (!requestedId) {
      if (currentId) selection.clearSelection();
      await catalog.refreshSessions(false, undefined, false);
      return;
    }
    if (requestedId !== currentId) {
      await selection.adoptSelection(requestedId, false);
    } else {
      await selection.loadSession(requestedId, { quiet: true });
    }
    await catalog.refreshSessions(false, requestedId, false);
  }, [catalog.archivedView, catalog.refreshSessions, catalog.setArchiveViewMode, selection.adoptSelection, selection.clearSelection, selection.loadSession, selection.selectedIdRef]);

  const syncLocationRef = useRef(syncLocation);
  syncLocationRef.current = syncLocation;
  const locationKeyRef = useRef(conversationLocationKey());

  useEffect(() => {
    const handleNavigation = () => {
      const nextLocationKey = conversationLocationKey();
      if (nextLocationKey === locationKeyRef.current) return;
      locationKeyRef.current = nextLocationKey;
      void syncLocationRef.current();
    };
    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("negus:navigate", handleNavigation);
    return () => {
      window.removeEventListener("popstate", handleNavigation);
      window.removeEventListener("negus:navigate", handleNavigation);
    };
  }, []);

  useEffect(() => {
    if (!selection.selectedId || !selection.session) return;
    const timer = window.setTimeout(() => {
      writeConversationSnapshot({
        selectedId: selection.selectedId,
        sessions: catalog.sessions,
        session: selection.session!,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [catalog.sessions, selection.selectedId, selection.session]);

  useEffect(() => {
    editingMessageRef.current = editingMessage;
  }, [editingMessage]);

  const sendDirectMessage = useCallback(async (text: string, attachments: MediaFile[] = [], existingSubmissionId = "") => {
    const threadId = selection.selectedIdRef.current;
    const messageText = text.trim();
    if (!threadId || (!messageText && !attachments.length)) return false;

    const submissionId = existingSubmissionId || createSubmissionId();
    const optimisticMessage = createOptimisticMessage(messageText, attachments, submissionId);
    selection.addOptimisticMessage(threadId, optimisticMessage);
    setLocalSendVersion((version) => version + 1);
    const startsNewTurn = !execution.status.active;

    const attempt = await execution.sendMessage(messageText, attachments.map((attachment) => attachment.id), submissionId);
    if (!attempt || attempt.outcome === "failed") {
      selection.removeOptimisticMessage(threadId, optimisticMessage.id);
      return false;
    }
    if (attempt.outcome === "uncertain") {
      selection.updateCurrentSession(threadId, (current) => ({
        ...current,
        messages: current.messages.map((message) => message.id === optimisticMessage.id
          ? { ...message, deliveryState: "pending" as const }
          : message),
      }));
      void selection.loadSession(threadId, { quiet: true, retry: false });
      return true;
    }
    selection.updateCurrentSession(threadId, (current) => ({
      ...current,
      messages: current.messages.map((message) => {
        if (message.id !== optimisticMessage.id) return message;
        const { deliveryState: _deliveryState, ...resolvedMessage } = message;
        return resolvedMessage;
      }),
    }));
    const accepted = attempt.result;
    if (startsNewTurn && accepted.threadId === threadId && accepted.turnId) {
      selection.updateCurrentSession(threadId, (current) => ({
        ...current,
        messages: current.messages.map((message) => message.id === optimisticMessage.id
          ? { ...message, turnId: accepted.turnId }
          : message),
      }));
      void selection.loadSession(threadId, { quiet: true, retry: false });
    }
    if (accepted.threadId !== threadId) {
      selection.removeOptimisticMessage(threadId, optimisticMessage.id);
      selection.addOptimisticMessage(accepted.threadId, optimisticMessage);
      selection.selectSession(accepted.threadId);
      void catalog.refreshSessions(false, accepted.threadId, false);
    }
    return true;
  }, [
    catalog.refreshSessions,
    execution.sendMessage,
    selection.addOptimisticMessage,
    selection.loadSession,
    selection.removeOptimisticMessage,
    selection.selectSession,
    selection.selectedIdRef,
    selection.updateCurrentSession,
  ]);

  useEffect(() => {
    const threadId = selection.selectedId;
    const pending = selection.session?.messages.filter((message) => message.deliveryState === "pending" && message.submissionId) || [];
    if (!threadId || !pending.length) return;
    let cancelled = false;
    for (const message of pending) {
      const submissionId = message.submissionId || "";
      if (!submissionId || reconcilingSubmissionsRef.current.has(submissionId)) continue;
      reconcilingSubmissionsRef.current.add(submissionId);
      void (async () => {
        try {
          for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
            const result = await execution.reconcileSubmission(submissionId);
            if (result?.status === "accepted") {
              selection.updateCurrentSession(threadId, (current) => ({
                ...current,
                messages: current.messages.map((currentMessage) => {
                  if (currentMessage.id !== message.id) return currentMessage;
                  const { deliveryState: _deliveryState, ...resolvedMessage } = currentMessage;
                  return resolvedMessage;
                }),
              }));
              void selection.loadSession(threadId, { quiet: true, retry: false, recovery: true });
              break;
            }
            if (result?.status === "failed") {
              selection.removeOptimisticMessage(threadId, message.id);
              break;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 2000));
          }
        } finally {
          reconcilingSubmissionsRef.current.delete(submissionId);
        }
      })();
    }
    return () => { cancelled = true; };
  }, [execution.reconcileSubmission, selection.loadSession, selection.removeOptimisticMessage, selection.selectedId, selection.session, selection.updateCurrentSession]);

  const retryPendingMessage = useCallback(async (message: SessionMessage) => {
    if (!message.submissionId || retryingMessageId) return false;
    setRetryingMessageId(message.id);
    try {
      return await sendDirectMessage(message.text, attachmentsFromMessage(message), message.submissionId);
    } finally {
      setRetryingMessageId("");
    }
  }, [retryingMessageId, sendDirectMessage]);

  useEffect(() => {
    const pending = pendingEditRef.current;
    if (!pending || pending.threadId !== selection.selectedId) return;
    pendingEditRef.current = null;
    void sendDirectMessage(pending.text, pending.attachments)
      .then(pending.resolve)
      .catch(() => pending.resolve(false));
  }, [editRequestVersion, sendDirectMessage, selection.selectedId]);

  const sendMessage = useCallback(async (text: string, attachments: MediaFile[] = []) => {
    const target = editingMessageRef.current;
    if (!target) return sendDirectMessage(text, attachments);
    const sourceThreadId = selection.selectedIdRef.current;
    if (!sourceThreadId || !target.turnId || target.role !== "user" || execution.status.active || selection.session?.archived) return false;
    const sourceMessages = selection.session?.messages || [];
    const targetIndex = sourceMessages.findIndex((message) => message.id === target.id);
    const previousTurnId = targetIndex > 0
      ? [...sourceMessages.slice(0, targetIndex)].reverse().find((message) => message.role === "assistant" && message.turnId)?.turnId || ""
      : "";
    setForkingMessageId(target.id);
    try {
      const created = previousTurnId
        ? await catalog.forkSession(sourceThreadId, previousTurnId)
        : await catalog.createSession(selection.session?.cwd || "");
      if (!created) return false;
      setEditingMessage(null);
      editingMessageRef.current = null;
      return await new Promise<boolean>((resolve) => {
        pendingEditRef.current = {
          threadId: selection.selectedIdRef.current,
          text,
          attachments,
          resolve,
        };
        setEditRequestVersion((value) => value + 1);
      });
    } finally {
      setForkingMessageId("");
    }
  }, [catalog.createSession, catalog.forkSession, execution.status.active, selection.selectedIdRef, selection.session, sendDirectMessage]);

  const startGoal = useCallback(async (objective: string) => {
    const normalized = objective.trim();
    if (!normalized || !selection.selectedIdRef.current || selection.session?.archived) return false;
    const created = await goal.update({ objective: normalized, status: "active" });
    if (!created) return false;
    return sendDirectMessage(normalized);
  }, [goal.update, selection.selectedIdRef, selection.session?.archived, sendDirectMessage]);

  const beginEditMessage = useCallback((message: SessionMessage) => {
    if (message.role !== "user" || !message.turnId || selection.session?.archived) return;
    editingMessageRef.current = message;
    setEditingMessage(message);
  }, [selection.session?.archived]);

  const cancelEditMessage = useCallback(() => {
    editingMessageRef.current = null;
    setEditingMessage(null);
  }, []);

  const renameSession = useCallback(async (name: string) => {
    const threadId = selection.selectedIdRef.current;
    const normalized = name.trim();
    if (!threadId || !normalized || normalized.length > 120 || renaming) return false;
    setRenaming(true);
    try {
      const renamed = await conversationApi.rename(threadId, normalized);
      selection.updateCurrentSession(threadId, (current) => ({
        ...current,
        ...renamed,
        title: renamed.title || normalized,
      }));
      await catalog.refreshSessions(false, threadId, false);
      return true;
    } catch {
      return false;
    } finally {
      setRenaming(false);
    }
  }, [catalog.refreshSessions, renaming, selection.selectedIdRef, selection.updateCurrentSession]);

  useEffect(() => {
    if (!editingMessageRef.current) return;
    editingMessageRef.current = null;
    setEditingMessage(null);
  }, [selection.selectedId]);

  const forkFromMessage = useCallback(async (message: SessionMessage) => {
    const threadId = selection.selectedIdRef.current;
    if (!threadId || !message.turnId || execution.status.active || selection.session?.archived) return false;
    setForkingMessageId(message.id);
    try {
      return await catalog.forkSession(threadId, message.turnId);
    } finally {
      setForkingMessageId("");
    }
  }, [catalog.forkSession, execution.status.active, selection.selectedIdRef, selection.session?.archived]);

  const queueMessage = useCallback(async (text: string, attachments: MediaFile[] = []) => {
    const messageText = text.trim();
    if (!messageText && !attachments.length) return false;
    return followUpQueue.enqueue(messageText, attachments);
  }, [followUpQueue.enqueue]);

  const review = useCallback(async () => {
    const threadId = selection.selectedIdRef.current;
    if (!threadId || execution.status.active || selection.session?.archived) return false;
    try {
      await executionApi.review(threadId);
      await execution.refreshStatus(undefined, true);
      return true;
    } catch {
      return false;
    }
  }, [execution.refreshStatus, execution.status.active, selection.selectedIdRef, selection.session?.archived]);

  const onSessionsChanged = useCallback((threadId?: string) => {
    const selected = selection.selectedIdRef.current;
    if (selected && (!threadId || threadId === selected)) {
      void selection.loadSession(selected, { quiet: true });
    }
    void catalog.refreshSessions(false, threadId, false);
  }, [catalog.refreshSessions, selection.loadSession, selection.selectedIdRef]);

  const handleEvent = useCallback((event: ProjectEvent) => {
    execution.handleEvent(event);
    followUpQueue.handleEvent(event);
    goal.handleEvent(event);
    if (event.type === "context_status") contextManagement.handleEvent(event);
    if (event.type === "user_message_submitted") {
      const generated = createOptimisticMessage(
        event.text,
        event.attachments || [],
        event.submissionId,
        event.createdAt,
      );
      const message = generated.id === event.messageId ? generated : { ...generated, id: event.messageId };
      selection.addOptimisticMessage(event.threadId, message);
    }
  }, [contextManagement.handleEvent, execution.handleEvent, followUpQueue.handleEvent, goal.handleEvent, selection.addOptimisticMessage]);
  const recoverRealtime = useCallback((_reason: RealtimeRecoveryReason) => {
    const selected = selection.selectedIdRef.current;
    if (selected) void selection.loadSession(selected, { quiet: true, retry: false, recovery: true });
    if (selected) void goal.refresh();
    void execution.refreshStatus(undefined, true).then(() => {
      onSessionsChanged(selection.selectedIdRef.current || undefined);
    });
    void followUpQueue.refresh();
  }, [execution.refreshStatus, followUpQueue.refresh, goal.refresh, onSessionsChanged, selection.selectedIdRef]);
  const connected = useConversationEvents(
    onSessionsChanged,
    handleEvent,
    recoverRealtime,
    selection.selectedId,
    execution.status.active,
    execution.status.phase === "submitted",
  );

  return {
    project: catalog.project,
    sessions: catalog.sessions,
    archivedView: catalog.archivedView,
    selectedId: selection.selectedId,
    session: selection.session,
    loadingList: catalog.loadingList,
    initialSyncReady: catalog.initialSyncReady,
    loadingSession: selection.loadingSession,
    loadingOlder: selection.loadingOlder,
    syncing: selection.syncing,
    contentSyncState: selection.contentSyncState,
    connected,
    listError: catalog.listError,
    sessionError: selection.sessionError,
    selectSession: selection.selectSession,
    createSession: catalog.createSession,
    creating: catalog.creating,
    setArchiveViewMode: catalog.setArchiveViewMode,
    archiveSession: catalog.archiveSession,
    unarchiveSession: catalog.unarchiveSession,
    archiveBusyId: catalog.archiveBusyId,
    forkFromMessage,
    forkingMessageId,
    editingMessage,
    editingMessageId: editingMessage?.id || "",
    retryPendingMessage,
    retryingMessageId,
    localSendVersion,
    beginEditMessage,
    cancelEditMessage,
    renameSession,
    renaming,
    loadOlder: selection.loadOlder,
    executionStatus: execution.status,
    streamingText: execution.streamingText,
    commentaryText: execution.commentaryText,
    contextStatus: contextManagement.status,
    models: modelManager.models,
    modelsLoading: modelManager.loading,
    modelChanging: modelManager.changing,
    modelError: modelManager.error,
    sending: execution.sending,
    sendingSlow: execution.sendingSlow,
    sendMessage,
    queueMessage,
    queueItems: followUpQueue.items,
    queueLoading: followUpQueue.loading,
    queueBusy: followUpQueue.busy,
    queueError: followUpQueue.error,
    editQueueItem: followUpQueue.edit,
    removeQueueItem: followUpQueue.remove,
    moveQueueItem: followUpQueue.move,
    retryQueueItem: followUpQueue.retry,
    sendQueueItem: followUpQueue.sendNow,
    interrupt: execution.interrupt,
    review,
    compactContext: contextManagement.compact,
    setAutoCompactThreshold: contextManagement.setThreshold,
    changeModel: modelManager.change,
    changeReasoningEffort: modelManager.changeReasoningEffort,
    goal: goal.goal,
    goalBusy: goal.busy,
    goalError: goal.error,
    startGoal,
    changeGoalStatus: async (status: "active" | "paused" | "complete") => Boolean(await goal.update({ status })),
    clearGoal: goal.clear,
    refresh: () => catalog.refreshSessions(),
  };
}
