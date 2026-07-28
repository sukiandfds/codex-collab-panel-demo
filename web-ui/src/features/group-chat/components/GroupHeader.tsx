import { MessageSquareText } from "lucide-react";
import { ViewSwitcher } from "../../../components/ViewSwitcher/ViewSwitcher";
import { DeviceStatus } from "../../device/components/DeviceStatus";
import type { GroupAgent, GroupMember, StoredMember } from "../model/types";
import styles from "./GroupHeader.module.css";

export function GroupHeader({ roomName, connected, deviceName, members, agents, member, onEditMember }: {
  roomName: string;
  connected: boolean;
  deviceName?: string;
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
        <div><strong>{roomName}</strong><span className={styles.activity}>{activityText}</span></div>
      </div>
      <div className={styles.headerActions}>
        <DeviceStatus name={deviceName} connected={connected} />
        <ViewSwitcher current="group" />
        <button className={styles.memberButton} type="button" onClick={onEditMember}>{member?.name || "设置身份"}</button>
      </div>
    </header>
  );
}
