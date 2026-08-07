import { MessageSquareText, PanelLeft, UserRound } from "lucide-react";
import { ViewSwitcher, type ViewSurface } from "../../../components/ViewSwitcher/ViewSwitcher";
import { DeviceStatus } from "../../device/components/DeviceStatus";
import type { GroupAgent, GroupMember, StoredMember } from "../model/types";
import styles from "./GroupHeader.module.css";

export function GroupHeader({ roomName, connected, deviceName, members, agents, member, onEditMember, onOpenSidebar, onViewChange }: {
  roomName: string;
  connected: boolean;
  deviceName?: string;
  members: GroupMember[];
  agents: GroupAgent[];
  member: StoredMember | null;
  onEditMember: () => void;
  onOpenSidebar: () => void;
  onViewChange?: (surface: Exclude<ViewSurface, "progress">) => void;
}) {
  const activeAgents = agents.filter((agent) => agent.active);
  const activityText = activeAgents.length === 1
    ? `${activeAgents[0].name} · ${activeAgents[0].label}`
    : activeAgents.length > 1 ? `${activeAgents.length} 个 Agent 正在工作` : `${members.length} 名成员在线`;
  return (
    <header className={styles.header}>
      <div className={styles.topbar}>
        <button className={`${styles.iconButton} ${styles.mobileOnly}`} type="button" aria-label="打开侧栏" title="打开侧栏" onClick={onOpenSidebar}>
          <PanelLeft aria-hidden="true" />
        </button>
        <MessageSquareText className={styles.titleIcon} aria-hidden="true" />
        <div className={styles.heading}>
          <div className={styles.titleRow}><h1 className={styles.title}>{roomName}</h1></div>
          <span className={styles.meta}>{activityText}</span>
        </div>
        <span className={styles.spacer} />
        <ViewSwitcher current="group" onViewChange={onViewChange} />
        <button className={styles.iconButton} type="button" aria-label="设置群聊身份" title={member?.name || "设置身份"} onClick={onEditMember}>
          <UserRound aria-hidden="true" />
        </button>
      </div>
      <div className={styles.statusbar}>
        <DeviceStatus name={deviceName} connected={connected} />
        <span className={styles.statusDivider} aria-hidden="true">·</span>
        <span className={styles.activity}>{activityText}</span>
      </div>
    </header>
  );
}
