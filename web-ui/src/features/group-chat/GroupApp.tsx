import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/AppShell/AppShell";
import { WindowBar } from "../../components/WindowBar/WindowBar";
import type { ViewSurface } from "../../components/ViewSwitcher/ViewSwitcher";
import { AgentRoster } from "./components/AgentRoster";
import { GroupComposer } from "./components/GroupComposer";
import { GroupHeader } from "./components/GroupHeader";
import { MemberDialog } from "./components/MemberDialog";
import { MessageTimeline } from "./components/MessageTimeline";
import { RoomSidebar } from "./components/RoomSidebar";
import { useGroupRoom } from "./hooks/useGroupRoom";
import type { GroupMode } from "./model/types";
import { useDeviceInfo } from "../device/hooks/useDeviceInfo";
import { useArtifacts } from "../artifacts/hooks/useArtifacts";
import styles from "./GroupApp.module.css";

export function GroupApp({ active = true, onViewChange }: { active?: boolean; onViewChange?: (surface: Exclude<ViewSurface, "progress">) => void }) {
  const group = useGroupRoom();
  const device = useDeviceInfo(group.connected);
  const [mode, setMode] = useState<GroupMode>("discussion");
  const [agentId, setAgentId] = useState("manager");
  const [editingMember, setEditingMember] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const snapshot = group.snapshot;
  const artifactIds = useMemo(() => snapshot?.messages.flatMap((message) => message.artifactIds || []) || [], [snapshot?.messages]);
  const artifactState = useArtifacts(artifactIds, group.artifactEvent);
  const join = async (name: string) => {
    await group.join(name);
    setEditingMember(false);
  };

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
            <RoomSidebar project={snapshot?.project || "Negus"} members={members} />
            <AgentRoster agents={agents} selectedId={agentId} onSelect={(id) => { setAgentId(id); setMode("development"); setSidebarOpen(false); }} />
          </div>
        }
        header={
          <GroupHeader
            roomName={snapshot?.room.name || "Negus 项目群"}
            connected={group.connected}
            deviceName={device?.name}
            members={members}
            agents={agents}
            member={group.member}
            onEditMember={() => setEditingMember(true)}
            onOpenSidebar={() => setSidebarOpen(true)}
            onViewChange={onViewChange}
          />
        }
        conversation={snapshot ? (
          <MessageTimeline
            messages={snapshot.messages}
            agents={agents}
            streaming={group.streaming}
            artifacts={artifactState.artifacts}
            artifactLoadErrors={artifactState.loadErrors}
            reviewingArtifactIds={artifactState.reviewingIds}
            reviewerName={group.member?.name || "当前成员"}
            onRetryArtifact={artifactState.loadOne}
            onReviewArtifact={artifactState.review}
          />
        ) : <main className={styles.loading}>{group.error || "正在连接项目群..."}</main>}
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
          onSend={(text, targetAgentId) => group.send(mode, targetAgentId, text)}
        />
        ) : <div className={styles.composerPlaceholder} />}
      />
      <MemberDialog initialName={group.member?.name || ""} open={!group.member || editingMember} onSubmit={join} />
    </>
  );
}
