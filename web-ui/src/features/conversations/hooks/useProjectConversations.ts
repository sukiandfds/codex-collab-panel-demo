import { useCallback, useEffect, useState } from "react";
import type { MediaFile } from "../../../shared/model/media";
import type { RealtimeRecoveryReason } from "../../../shared/model/realtime";
import { useContextManagement } from "../../context-management/hooks/useContextManagement";
import { useCodexExecution } from "../../execution/hooks/useCodexExecution";
import type { ProjectEvent } from "../../execution/model/types";
import { useModels } from "../../models/hooks/useModels";
import { writeConversationSnapshot } from "../data/conversationSnapshot";
import { useConversationEvents } from "../realtime/useConversationEvents";
import { createOptimisticMessage } from "../state/optimisticMessage";
import { readInitialConversationState } from "../state/initialConversation";
import { useConversationCatalog } from "./useConversationCatalog";
import { useConversationSession } from "./useConversationSession";

export function useProjectConversations() {
  const [initial] = useState(readInitialConversationState);
  const selection = useConversationSession(initial);

  const onMessageAccepted = useCallback(() => {
    if (selection.selectedIdRef.current) {
      void selection.loadSession(selection.selectedIdRef.current, { quiet: true });
    }
  }, [selection.loadSession, selection.selectedIdRef]);
  const execution = useCodexExecution(selection.selectedId, onMessageAccepted);
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

    const optimisticMessage = createOptimisticMessage(messageText, attachments);
    selection.updateCurrentSession(threadId, (current) => ({
      ...current,
      messages: [...current.messages, optimisticMessage],
    }));

    const sent = await execution.sendMessage(messageText, attachments.map((attachment) => attachment.id));
    if (!sent) {
      selection.updateCurrentSession(threadId, (current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== optimisticMessage.id),
      }));
    }
    return sent;
  }, [execution.sendMessage, selection.selectedIdRef, selection.updateCurrentSession]);

  const onSessionsChanged = useCallback((threadId?: string, clearStreaming = true) => {
    if (threadId) selection.invalidate(threadId);
    const selected = selection.selectedIdRef.current;
    if (selected && (!threadId || threadId === selected)) {
      void selection.loadSession(selected, { quiet: true }).then((loaded) => {
        if (loaded && clearStreaming) execution.clearStreaming();
      });
    }
    void catalog.refreshSessions(false, threadId, false);
  }, [catalog.refreshSessions, execution.clearStreaming, selection.invalidate, selection.loadSession, selection.selectedIdRef]);

  const handleEvent = useCallback((event: ProjectEvent) => {
    execution.handleEvent(event);
    if (event.type === "context_status") contextManagement.handleEvent(event);
  }, [contextManagement.handleEvent, execution.handleEvent]);
  const recoverRealtime = useCallback((reason: RealtimeRecoveryReason) => {
    void execution.refreshStatus().then((latest) => {
      if (reason === "stale-execution" && latest?.active) return;
      onSessionsChanged(undefined, latest ? !latest.active : false);
    });
  }, [execution.refreshStatus, onSessionsChanged]);
  const connected = useConversationEvents(
    onSessionsChanged,
    handleEvent,
    recoverRealtime,
    selection.selectedId,
    execution.status.active,
    execution.status.phase === "submitted",
  );

  useEffect(() => {
    if (connected && selection.selectedId) void execution.refreshStatus();
  }, [connected, execution.refreshStatus, selection.selectedId]);

  return {
    project: catalog.project,
    sessions: catalog.sessions,
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
    sendMessage,
    interrupt: execution.interrupt,
    compactContext: contextManagement.compact,
    setAutoCompactThreshold: contextManagement.setThreshold,
    changeModel: modelManager.change,
    changeReasoningEffort: modelManager.changeReasoningEffort,
    refresh: () => catalog.refreshSessions(),
  };
}
