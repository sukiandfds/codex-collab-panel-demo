import { Bot, Circle, MessageSquareText } from "lucide-react";
import type { GroupAgent, GroupMember, StoredMember } from "../model/types";
import styles from "../GroupChat.module.css";

export function GroupHeader({ roomName, connected, members, agents, member, onEditMember }: {
  roomName: string;
  connected: boolean;
  members: GroupMember[];
  agents: GroupAgent[];
  member: StoredMember | null;
  onEditMember: () => void;
}) {
  const activeAgents = agents.filter((agent) => agent.active);
  const activityText = activeAgents.length === 1
    ? `${activeAgents[0].name} · ${activeAgents[0].label}`
    : activeAgents.length > 1 ? `${activeAgents.length} 个 Agent 正在工作` : `${members.length} 名成员在线`;
  return (
    <header className={styles.header}>
      <div className={styles.roomTitle}>
        <MessageSquareText aria-hidden="true" />
        <div><strong>{roomName}</strong><span>{activityText}</span></div>
      </div>
      <div className={styles.headerActions}>
        <span className={styles.connection} aria-label={connected ? "实时同步" : "正在重连"} title={connected ? "实时同步" : "正在重连"}>
          <Circle className={connected ? styles.online : styles.offline} fill="currentColor" />
          <span>{connected ? "实时同步" : "正在重连"}</span>
        </span>
        <a className={styles.iconLink} href={`/${window.location.search}`} title="返回单人 Codex 对话" aria-label="返回单人 Codex 对话"><Bot /></a>
        <button className={styles.memberButton} type="button" onClick={onEditMember}>{member?.name || "设置身份"}</button>
      </div>
    </header>
  );
}
