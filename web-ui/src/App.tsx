import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./components/AppShell/AppShell";
import type { ViewSurface } from "./components/ViewSwitcher/ViewSwitcher";
import { WindowBar } from "./components/WindowBar/WindowBar";
import { ConversationComposer } from "./features/conversations/components/ConversationComposer";
import { ConversationHeader } from "./features/conversations/components/ConversationHeader";
import { ConversationSidebar } from "./features/conversations/components/ConversationSidebar";
import { ConversationView } from "./features/conversations/components/ConversationView";
import { useProjectConversations } from "./features/conversations/hooks/useProjectConversations";
import { useDeviceInfo } from "./features/device/hooks/useDeviceInfo";
import { GroupApp } from "./features/group-chat/GroupApp";
import { prefetchGroupSnapshot } from "./features/group-chat/data/groupSnapshot";
import { IntelligenceEfficiencyControl } from "./features/intelligence-efficiency/components/IntelligenceEfficiencyControl";
import { UsageSummaryControl } from "./features/usage-monitor/components/UsageSummaryControl";
import { useUsageMonitor } from "./features/usage-monitor/hooks/useUsageMonitor";

type InteractiveSurface = Exclude<ViewSurface, "progress">;

const readSurface = (): InteractiveSurface => window.location.pathname === "/group.html"
  || new URLSearchParams(window.location.search).get("view") === "group"
  ? "group"
  : "conversation";

function ConversationApp({ onViewChange }: { onViewChange: (surface: InteractiveSurface) => void }) {
  const conversations = useProjectConversations();
  const device = useDeviceInfo(conversations.connected);
  const usage = useUsageMonitor(conversations.executionStatus);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    if (conversations.loadingList || conversations.loadingSession || conversations.snapshotLoading) return;
    window.dispatchEvent(new Event("negus:app-ready"));
  }, [conversations.loadingList, conversations.loadingSession, conversations.snapshotLoading]);
  const selectSession = useCallback((threadId: string) => {
    conversations.selectSession(threadId);
    setSidebarOpen(false);
  }, [conversations.selectSession]);

  return (
    <AppShell
      chrome={<WindowBar />}
      sidebarOpen={sidebarOpen}
      onCloseSidebar={() => setSidebarOpen(false)}
      sidebar={
        <ConversationSidebar
          project={conversations.project}
          sessions={conversations.sessions}
          selectedId={conversations.selectedId}
          loading={conversations.loadingList}
          connected={conversations.connected}
          creating={conversations.creating}
          archivedView={conversations.archivedView}
          archiveBusyId={conversations.archiveBusyId}
          error={conversations.listError}
          onSelect={selectSession}
          onCreate={conversations.createSession}
          onRefresh={conversations.refresh}
          onArchiveViewChange={conversations.setArchiveViewMode}
          onArchive={conversations.archiveSession}
          onUnarchive={conversations.unarchiveSession}
        />
      }
      header={
        <ConversationHeader
          project={conversations.project}
          session={conversations.session}
          deviceName={device?.name}
          connected={conversations.connected}
          onOpenSidebar={() => setSidebarOpen(true)}
          onRename={conversations.renameSession}
          renaming={conversations.renaming}
          usage={
            <>
              <UsageSummaryControl
                snapshot={usage.snapshot}
                loading={usage.loading}
                error={usage.error}
                onRefresh={() => void usage.refresh(true)}
              />
              <IntelligenceEfficiencyControl />
            </>
          }
          onViewChange={onViewChange}
        />
      }
      conversation={
        <ConversationView
          session={conversations.session}
          loading={conversations.loadingSession}
          contentSyncState={conversations.contentSyncState}
          loadingOlder={conversations.loadingOlder}
          error={conversations.sessionError}
          listAvailable={!conversations.listError}
          streamingText={conversations.streamingText}
          executionStatus={conversations.executionStatus}
          contextStatus={conversations.contextStatus}
          onLoadOlder={conversations.loadOlder}
          onForkMessage={conversations.forkFromMessage}
          forkingMessageId={conversations.forkingMessageId}
          onEditMessage={conversations.beginEditMessage}
          editingMessageId={conversations.editingMessageId}
          onRetryMessage={conversations.retryPendingMessage}
          retryingMessageId={conversations.retryingMessageId}
        />
      }
      composer={
        <ConversationComposer
          key={conversations.selectedId}
          connected={conversations.connected}
          selected={Boolean(conversations.selectedId)}
          archived={Boolean(conversations.session?.archived)}
          sending={conversations.sending}
          sendingSlow={conversations.sendingSlow}
          status={conversations.executionStatus}
          commentary={conversations.commentaryText}
          contextStatus={conversations.contextStatus}
          models={conversations.models}
          modelsLoading={conversations.modelsLoading}
          modelChanging={conversations.modelChanging}
          modelError={conversations.modelError}
          onSend={conversations.sendMessage}
          onQueue={conversations.queueMessage}
          queueing={conversations.queueBusy}
          queueItems={conversations.queueItems}
          queueError={conversations.queueError}
          onEditQueueItem={conversations.editQueueItem}
          onRemoveQueueItem={conversations.removeQueueItem}
          onMoveQueueItem={conversations.moveQueueItem}
          onRetryQueueItem={conversations.retryQueueItem}
          onSendQueueItem={conversations.sendQueueItem}
          editingMessage={conversations.editingMessage}
          onCancelEdit={conversations.cancelEditMessage}
          onInterrupt={conversations.interrupt}
          onCompactContext={conversations.compactContext}
          onAutoCompactThresholdChange={conversations.setAutoCompactThreshold}
          onModelChange={conversations.changeModel}
          onReasoningEffortChange={conversations.changeReasoningEffort}
        />
      }
    />
  );
}

export function App() {
  const [surface, setSurface] = useState<InteractiveSurface>(readSurface);
  const [groupMounted, setGroupMounted] = useState(() => readSurface() === "group");

  const showSurface = useCallback((next: InteractiveSurface, pushHistory = true) => {
    if (next === "group") setGroupMounted(true);
    setSurface(next);
    if (!pushHistory) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("view");
    if (next === "group") params.set("view", "group");
    const query = params.toString();
    window.history.pushState({ surface: next }, "", `/${query ? `?${query}` : ""}`);
  }, []);

  useEffect(() => {
    const handlePopState = () => showSurface(readSurface(), false);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [showSurface]);

  useEffect(() => {
    if (groupMounted) return;
    const timer = window.setTimeout(() => void prefetchGroupSnapshot(), 1800);
    return () => window.clearTimeout(timer);
  }, [groupMounted]);

  return (
    <>
      <div hidden={surface !== "conversation"} aria-hidden={surface !== "conversation"} style={{ width: "100%", height: "100%" }}>
        <ConversationApp onViewChange={showSurface} />
      </div>
      {groupMounted ? (
        <div hidden={surface !== "group"} aria-hidden={surface !== "group"} style={{ width: "100%", height: "100%" }}>
          <GroupApp onViewChange={showSurface} />
        </div>
      ) : null}
    </>
  );
}
