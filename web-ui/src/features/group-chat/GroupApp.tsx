import { useMemo, useState } from "react";
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
import styles from "./GroupChat.module.css";

export function GroupApp() {
  const group = useGroupRoom();
  const device = useDeviceInfo(group.connected);
  const [mode, setMode] = useState<GroupMode>("discussion");
  const [agentId, setAgentId] = useState("manager");
  const [editingMember, setEditingMember] = useState(false);
  const snapshot = group.snapshot;
  const artifactIds = useMemo(() => snapshot?.messages.flatMap((message) => message.artifactIds || []) || [], [snapshot?.messages]);
  const artifactState = useArtifacts(artifactIds, group.artifactEvent);
  const join = async (name: string) => {
    await group.join(name);
    setEditingMember(false);
  };

  if (group.loading && !snapshot) return <main className={styles.loading}>正在连接项目群...</main>;
  if (!snapshot) return <main className={styles.loading}>{group.error || "项目群暂不可用"}</main>;

  return (
    <div className={styles.shell}>
      <RoomSidebar project={snapshot.project} members={snapshot.members} />
      <main className={styles.main}>
        <GroupHeader roomName={snapshot.room.name} connected={group.connected} deviceName={device?.name} members={snapshot.members} agents={snapshot.agents} member={group.member} onEditMember={() => setEditingMember(true)} />
        <MessageTimeline
          messages={snapshot.messages}
          agents={snapshot.agents}
          streaming={group.streaming}
          artifacts={artifactState.artifacts}
          artifactLoadErrors={artifactState.loadErrors}
          reviewingArtifactIds={artifactState.reviewingIds}
          reviewerName={group.member?.name || "当前成员"}
          onRetryArtifact={artifactState.loadOne}
          onReviewArtifact={artifactState.review}
        />
        <GroupComposer
          mode={mode}
          agentId={agentId}
          agents={snapshot.agents}
          members={snapshot.members}
          disabled={!group.member || group.sending}
          error={group.error}
          onModeChange={setMode}
          onAgentChange={setAgentId}
          onSend={(text, targetAgentId) => group.send(mode, targetAgentId, text)}
        />
      </main>
      <AgentRoster agents={snapshot.agents} selectedId={agentId} onSelect={(id) => { setAgentId(id); setMode("development"); }} />
      <MemberDialog initialName={group.member?.name || ""} open={!group.member || editingMember} onSubmit={join} />
    </div>
  );
}
