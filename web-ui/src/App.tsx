import { useCallback, useState } from "react";
import { AppShell } from "./components/AppShell/AppShell";
import { WindowBar } from "./components/WindowBar/WindowBar";
import { ConversationComposer } from "./features/conversations/components/ConversationComposer";
import { ConversationHeader } from "./features/conversations/components/ConversationHeader";
import { ConversationSidebar } from "./features/conversations/components/ConversationSidebar";
import { ConversationView } from "./features/conversations/components/ConversationView";
import { useProjectConversations } from "./features/conversations/hooks/useProjectConversations";
import { useDeviceInfo } from "./features/device/hooks/useDeviceInfo";
import { UsageSummaryControl } from "./features/usage-monitor/components/UsageSummaryControl";
import { useUsageMonitor } from "./features/usage-monitor/hooks/useUsageMonitor";

export function App() {
  const conversations = useProjectConversations();
  const device = useDeviceInfo(conversations.connected);
  const usage = useUsageMonitor(conversations.executionStatus);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
          usage={
            <UsageSummaryControl
              snapshot={usage.snapshot}
              loading={usage.loading}
              error={usage.error}
              onRefresh={() => void usage.refresh(true)}
            />
          }
        />
      }
      conversation={
        <ConversationView
          session={conversations.session}
          loading={conversations.loadingSession}
          syncing={conversations.syncing}
          loadingOlder={conversations.loadingOlder}
          error={conversations.sessionError}
          listAvailable={!conversations.listError}
          streamingText={conversations.streamingText}
          executionStatus={conversations.executionStatus}
          onLoadOlder={conversations.loadOlder}
          onForkMessage={conversations.forkFromMessage}
          forkingMessageId={conversations.forkingMessageId}
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
