import { useState } from "react";
import { AgentRoster } from "./components/AgentRoster";
import { GroupComposer } from "./components/GroupComposer";
import { GroupHeader } from "./components/GroupHeader";
import { MemberDialog } from "./components/MemberDialog";
import { MessageTimeline } from "./components/MessageTimeline";
import { RoomSidebar } from "./components/RoomSidebar";
import { useGroupRoom } from "./hooks/useGroupRoom";
import type { GroupMode } from "./model/types";
import styles from "./GroupChat.module.css";

export function GroupApp() {
  const group = useGroupRoom();
  const [mode, setMode] = useState<GroupMode>("discussion");
  const [agentId, setAgentId] = useState("manager");
  const [editingMember, setEditingMember] = useState(false);
  const snapshot = group.snapshot;
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
        <GroupHeader roomName={snapshot.room.name} connected={group.connected} members={snapshot.members} member={group.member} onEditMember={() => setEditingMember(true)} />
        <MessageTimeline messages={snapshot.messages} agents={snapshot.agents} streaming={group.streaming} />
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
