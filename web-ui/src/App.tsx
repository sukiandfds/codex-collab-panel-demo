import { useCallback, useState } from "react";
import { AppShell } from "./components/AppShell/AppShell";
import { Composer } from "./components/Composer/Composer";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Topbar } from "./components/Topbar/Topbar";
import { WindowBar } from "./components/WindowBar/WindowBar";
import { ConversationView } from "./features/conversations/components/ConversationView";
import { useProjectConversations } from "./features/conversations/hooks/useProjectConversations";
import { useDeviceInfo } from "./features/device/hooks/useDeviceInfo";

export function App() {
  const conversations = useProjectConversations();
  const device = useDeviceInfo(conversations.connected);
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
        <Sidebar
          project={conversations.project}
          sessions={conversations.sessions}
          selectedId={conversations.selectedId}
          loading={conversations.loadingList}
          connected={conversations.connected}
          creating={conversations.creating}
          error={conversations.listError}
          onSelect={selectSession}
          onCreate={conversations.createSession}
          onRefresh={conversations.refresh}
        />
      }
      header={<Topbar project={conversations.project} session={conversations.session} deviceName={device?.name} connected={conversations.connected} onOpenSidebar={() => setSidebarOpen(true)} />}
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
        />
      }
      composer={
        <Composer
          key={conversations.selectedId}
          connected={conversations.connected}
          selected={Boolean(conversations.selectedId)}
          sending={conversations.sending}
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
        />
      }
    />
  );
}
