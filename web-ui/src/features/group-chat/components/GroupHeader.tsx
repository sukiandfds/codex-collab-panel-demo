import { Bot, Circle, MessageSquareText } from "lucide-react";
import type { GroupMember, StoredMember } from "../model/types";
import styles from "../GroupChat.module.css";

export function GroupHeader({ roomName, connected, members, member, onEditMember }: {
  roomName: string;
  connected: boolean;
  members: GroupMember[];
  member: StoredMember | null;
  onEditMember: () => void;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.roomTitle}>
        <MessageSquareText aria-hidden="true" />
        <div><strong>{roomName}</strong><span>{members.length} 名成员在线</span></div>
      </div>
      <div className={styles.headerActions}>
        <span className={styles.connection}><Circle className={connected ? styles.online : styles.offline} fill="currentColor" />{connected ? "实时同步" : "正在重连"}</span>
        <a className={styles.iconLink} href={`/${window.location.search}`} title="返回单人 Codex 对话" aria-label="返回单人 Codex 对话"><Bot /></a>
        <button className={styles.memberButton} type="button" onClick={onEditMember}>{member?.name || "设置身份"}</button>
      </div>
    </header>
  );
}
