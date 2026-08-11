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
import { IntelligenceEfficiencyControl } from "./features/intelligence-efficiency/components/IntelligenceEfficiencyControl";
import { UsageSummaryControl } from "./features/usage-monitor/components/UsageSummaryControl";
import { useUsageMonitor } from "./features/usage-monitor/hooks/useUsageMonitor";

type InteractiveSurface = Exclude<ViewSurface, "progress">;
const surfaceStorageKey = "negus:last-surface";

const readSurface = (): InteractiveSurface => {
  const params = new URLSearchParams(window.location.search);
  if (window.location.pathname === "/group.html" || params.get("view") === "group") return "group";
  if (params.has("thread") || params.has("archived") || params.get("view") === "conversation") return "conversation";
  try {
    return window.localStorage.getItem(surfaceStorageKey) === "group" ? "group" : "conversation";
  } catch {
    return "conversation";
  }
};

function ConversationApp({ active, onViewChange }: { active: boolean; onViewChange: (surface: InteractiveSurface) => void }) {
  const conversations = useProjectConversations();
  const device = useDeviceInfo(conversations.connected);
  const usage = useUsageMonitor(conversations.executionStatus);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    if (!active) return;
    if (
      conversations.snapshotLoading
      || !conversations.initialSyncReady
      || conversations.loadingSession
      || conversations.syncing
    ) return;
    window.dispatchEvent(new Event("negus:app-ready"));
  }, [
    conversations.initialSyncReady,
    conversations.loadingSession,
    conversations.snapshotLoading,
    conversations.syncing,
    active,
  ]);
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
          currentStatus={conversations.executionStatus}
          onCloseSidebar={() => setSidebarOpen(false)}
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
          active={active}
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
          localSendVersion={conversations.localSendVersion}
        />
      }
      composer={conversations.session?.readOnly ? null : (
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
          onReview={conversations.review}
          onCompactContext={conversations.compactContext}
          onAutoCompactThresholdChange={conversations.setAutoCompactThreshold}
          onModelChange={conversations.changeModel}
          onReasoningEffortChange={conversations.changeReasoningEffort}
        />
      )}
    />
  );
}

export function App() {
  const [surface, setSurface] = useState<InteractiveSurface>(readSurface);
  const [groupMounted, setGroupMounted] = useState(() => readSurface() === "group");

  const showSurface = useCallback((next: InteractiveSurface, pushHistory = true) => {
    if (next === surface) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (next === "group") setGroupMounted(true);
    setSurface(next);
    try { window.localStorage.setItem(surfaceStorageKey, next); } catch {}
    if (!pushHistory) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("view");
    if (next === "group") params.set("view", "group");
    const query = params.toString();
    window.history.pushState({ surface: next }, "", `/${query ? `?${query}` : ""}`);
  }, [surface]);

  useEffect(() => {
    const handlePopState = () => {
      const next = readSurface();
      if (next === "group") setGroupMounted(true);
      setSurface(next);
      try { window.localStorage.setItem(surfaceStorageKey, next); } catch {}
    };
    const handleInternalNavigation = () => {
      const next = readSurface();
      if (next === "group") setGroupMounted(true);
      setSurface(next);
      try { window.localStorage.setItem(surfaceStorageKey, next); } catch {}
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("negus:navigate", handleInternalNavigation);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("negus:navigate", handleInternalNavigation);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <div
        aria-hidden={surface !== "conversation"}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          visibility: surface === "conversation" ? "visible" : "hidden",
          pointerEvents: surface === "conversation" ? "auto" : "none",
          zIndex: surface === "conversation" ? 1 : 0,
        }}
      >
        <ConversationApp active={surface === "conversation"} onViewChange={showSurface} />
      </div>
      {groupMounted ? (
        <div
          aria-hidden={surface !== "group"}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            visibility: surface === "group" ? "visible" : "hidden",
            pointerEvents: surface === "group" ? "auto" : "none",
            zIndex: surface === "group" ? 1 : 0,
          }}
        >
          <GroupApp active={surface === "group"} onViewChange={showSurface} />
        </div>
      ) : null}
    </div>
  );
}
