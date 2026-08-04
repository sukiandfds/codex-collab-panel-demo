import { useCallback, useEffect, useState } from "react";
import type { MediaFile } from "../../../shared/model/media";
import type { RealtimeRecoveryReason } from "../../../shared/model/realtime";
import { useContextManagement } from "../../context-management/hooks/useContextManagement";
import { useCodexExecution } from "../../execution/hooks/useCodexExecution";
import type { ProjectEvent } from "../../execution/model/types";
import { useModels } from "../../models/hooks/useModels";
import { readConversationSnapshotAsync, writeConversationSnapshot } from "../data/conversationSnapshot";
import { useConversationEvents } from "../realtime/useConversationEvents";
import { createOptimisticMessage, createSubmissionId } from "../state/optimisticMessage";
import { readInitialConversationState } from "../state/initialConversation";
import { useConversationCatalog } from "./useConversationCatalog";
import { useConversationSession } from "./useConversationSession";
import type { SessionMessage } from "../model/types";

export function useProjectConversations() {
  const [initial] = useState(readInitialConversationState);
  const selection = useConversationSession(initial);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("archived") === "1") return;
    let cancelled = false;
    void readConversationSnapshotAsync().then((snapshot) => {
      if (cancelled || !snapshot?.session) return;
      selection.hydrateSnapshot(snapshot.session);
    });
    return () => { cancelled = true; };
  }, [initial, selection.hydrateSnapshot]);

  const execution = useCodexExecution(selection.selectedId);
  const [forkingMessageId, setForkingMessageId] = useState("");
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
    setSyncing: selection.setSyncing,
  }, contextManagement.status.model);

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

  const sendMessage = useCallback(async (text: string, attachments: MediaFile[] = []) => {
    const threadId = selection.selectedIdRef.current;
    const messageText = text.trim();
    if (!threadId || (!messageText && !attachments.length)) return false;

    const submissionId = createSubmissionId();
    const optimisticMessage = createOptimisticMessage(messageText, attachments, submissionId);
    selection.updateCurrentSession(threadId, (current) => ({
      ...current,
      messages: [...current.messages, optimisticMessage],
    }));

    const sent = await execution.sendMessage(messageText, attachments.map((attachment) => attachment.id), submissionId);
    if (!sent) {
      selection.updateCurrentSession(threadId, (current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== optimisticMessage.id),
      }));
    }
    return sent;
  }, [execution.sendMessage, selection.selectedIdRef, selection.updateCurrentSession]);

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

  const onSessionsChanged = useCallback((threadId?: string) => {
    const selected = selection.selectedIdRef.current;
    if (selected && (!threadId || threadId === selected)) {
      void selection.loadSession(selected, { quiet: true });
    }
    void catalog.refreshSessions(false, threadId, false);
  }, [catalog.refreshSessions, selection.loadSession, selection.selectedIdRef]);

  const handleEvent = useCallback((event: ProjectEvent) => {
    execution.handleEvent(event);
    if (event.type === "context_status") contextManagement.handleEvent(event);
    if (event.type === "user_message_submitted") {
      const generated = createOptimisticMessage(
        event.text,
        event.attachments || [],
        event.submissionId,
        event.createdAt,
      );
      const message = generated.id === event.messageId ? generated : { ...generated, id: event.messageId };
      selection.updateCurrentSession(event.threadId, (current) => (
        current.messages.some((item) => item.id === message.id)
          ? current
          : { ...current, messages: [...current.messages, message] }
      ));
    }
  }, [contextManagement.handleEvent, execution.handleEvent, selection.updateCurrentSession]);
  const recoverRealtime = useCallback((_reason: RealtimeRecoveryReason) => {
    void execution.refreshStatus(undefined, true).then(() => {
      onSessionsChanged(selection.selectedIdRef.current || undefined);
    });
  }, [execution.refreshStatus, onSessionsChanged, selection.selectedIdRef]);
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
    loadingSession: selection.loadingSession,
    loadingOlder: selection.loadingOlder,
    syncing: selection.syncing,
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
    interrupt: execution.interrupt,
    compactContext: contextManagement.compact,
    setAutoCompactThreshold: contextManagement.setThreshold,
    changeModel: modelManager.change,
    changeReasoningEffort: modelManager.changeReasoningEffort,
    refresh: () => catalog.refreshSessions(),
  };
}
