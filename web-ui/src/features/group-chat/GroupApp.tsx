import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { AppShell } from "../../components/AppShell/AppShell";
import { WindowBar } from "../../components/WindowBar/WindowBar";
import type { ViewSurface } from "../../components/ViewSwitcher/ViewSwitcher";
import { AgentRoster } from "./components/AgentRoster";
import { GroupComposer } from "./components/GroupComposer";
import { GroupHeader } from "./components/GroupHeader";
import { MemberDialog } from "./components/MemberDialog";
import { MemberProfileDrawer } from "./components/MemberProfileDrawer";
import { MessageTimeline } from "./components/MessageTimeline";
import { RoomSidebar } from "./components/RoomSidebar";
import { useGroupRoom } from "./hooks/useGroupRoom";
import type { GroupMode, GroupProfile } from "./model/types";
import { useDeviceInfo } from "../device/hooks/useDeviceInfo";
import { useArtifacts } from "../artifacts/hooks/useArtifacts";
import { RefreshNotice } from "../app-update/components/AppUpdateNotice";
import styles from "./GroupApp.module.css";

export function GroupApp({ active = true, onViewChange }: { active?: boolean; onViewChange?: (surface: Exclude<ViewSurface, "progress">) => void }) {
  const group = useGroupRoom();
  const device = useDeviceInfo(group.connected);
  const [mode, setMode] = useState<GroupMode>("discussion");
  const [agentId, setAgentId] = useState("manager");
  const [profile, setProfile] = useState<GroupProfile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [localSendVersion, setLocalSendVersion] = useState(0);
  const snapshot = group.snapshot;
  const artifactIds = useMemo(() => snapshot?.messages.flatMap((message) => message.artifactIds || []) || [], [snapshot?.messages]);
  const artifactState = useArtifacts(artifactIds, group.artifactEvent);
  const join = async (name: string) => {
    await group.join(name);
  };
  const sendMessage = useCallback(async (text: string, targetAgentIds: string[], attachmentIds: string[] = []) => {
    const accepted = await group.send(mode, targetAgentIds, text, attachmentIds);
    if (accepted) setLocalSendVersion((version) => version + 1);
    return accepted;
  }, [group.send, mode]);

  useEffect(() => {
    if (!active || !group.initialSyncReady) return;
    window.dispatchEvent(new Event("negus:app-ready"));
  }, [active, group.initialSyncReady]);

  const agents = snapshot?.agents || [];
  const members = snapshot?.members || [];

  return (
    <>
      <AppShell
        chrome={<WindowBar />}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        sidebar={
          <div className={styles.sidebarContent}>
            <RoomSidebar project={snapshot?.project || "Negus"} members={members} onOpenProfile={(member) => { setProfile({ kind: "member", profile: member }); setSidebarOpen(false); }} />
            <AgentRoster agents={agents} onOpenProfile={(agent) => { setProfile({ kind: "agent", profile: agent }); setSidebarOpen(false); }} />
          </div>
        }
        header={
          <GroupHeader
            roomName={snapshot?.room.name || "Negus 项目群"}
            connected={group.connected}
            deviceName={device?.name}
            members={members}
            agents={agents}
            onOpenSidebar={() => setSidebarOpen(true)}
            onViewChange={onViewChange}
          />
        }
        conversation={snapshot ? (
          <MessageTimeline
            messages={snapshot.messages}
            agents={agents}
            members={members}
            streaming={group.streaming}
            artifacts={artifactState.artifacts}
            artifactLoadErrors={artifactState.loadErrors}
            reviewingArtifactIds={artifactState.reviewingIds}
            reviewerName={group.member?.name || "当前成员"}
            onRetryArtifact={artifactState.loadOne}
            onReviewArtifact={artifactState.review}
            onOpenProfile={setProfile}
            localSendVersion={localSendVersion}
          />
        ) : group.error ? (
          <main className={styles.loading}>
            <RefreshNotice
              surface="group"
              title="项目群暂时未连接"
              detail="连接没有响应，请刷新网页后重试。"
              actionLabel="刷新网页"
              onAction={() => window.location.reload()}
            />
          </main>
        ) : <main className={styles.loading} role="status" aria-label="正在连接项目群"><LoaderCircle className={styles.spinner} aria-hidden="true" /></main>}
        composer={snapshot ? (
        <GroupComposer
          mode={mode}
          agentId={agentId}
          agents={agents}
          members={members}
          disabled={!group.member || group.sending}
          error={group.error}
          onModeChange={setMode}
          onAgentChange={setAgentId}
          onSend={sendMessage}
        />
        ) : <div className={styles.composerPlaceholder} />}
      />
      <MemberDialog initialName={group.member?.name || ""} open={!group.member} onSubmit={join} />
      <MemberProfileDrawer
        profile={profile}
        onClose={() => setProfile(null)}
        onAgentUpdated={(agent) => setProfile({ kind: "agent", profile: agent })}
      />
    </>
  );
}
