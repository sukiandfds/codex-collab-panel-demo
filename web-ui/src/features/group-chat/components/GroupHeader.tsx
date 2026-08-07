import { useState } from "react";
import { MessageSquareText, PanelLeft, Share2 } from "lucide-react";
import { ViewSwitcher, type ViewSurface } from "../../../components/ViewSwitcher/ViewSwitcher";
import { ShareConversationDialog } from "../../conversation-sharing/components/ShareConversationDialog";
import { DeviceStatus } from "../../device/components/DeviceStatus";
import type { GroupAgent, GroupMember } from "../model/types";
import styles from "./GroupHeader.module.css";

export function GroupHeader({ roomName, connected, deviceName, members, agents, onOpenSidebar, onViewChange }: {
  roomName: string;
  connected: boolean;
  deviceName?: string;
  members: GroupMember[];
  agents: GroupAgent[];
  onOpenSidebar: () => void;
  onViewChange?: (surface: Exclude<ViewSurface, "progress">) => void;
}) {
  const [sharing, setSharing] = useState(false);
  const activeAgents = agents.filter((agent) => agent.active);
  const activityText = activeAgents.length === 1
    ? `${activeAgents[0].name} · ${activeAgents[0].label}`
    : activeAgents.length > 1 ? `${activeAgents.length} 个 Agent 正在工作` : `${members.length} 名成员在线`;
  return (
    <>
      <header className={styles.header}>
      <div className={styles.topbar}>
        <button className={`${styles.iconButton} ${styles.mobileOnly}`} type="button" aria-label="打开侧栏" title="打开侧栏" onClick={onOpenSidebar}>
          <PanelLeft aria-hidden="true" />
        </button>
        <MessageSquareText className={styles.titleIcon} aria-hidden="true" />
        <div className={styles.heading}>
          <div className={styles.titleRow}><h1 className={styles.title}>{roomName}</h1></div>
          <span className={styles.memberCount}>{members.length} 位用户，{agents.length} 位 Agent</span>
        </div>
        <span className={styles.spacer} />
        <button className={styles.iconButton} type="button" aria-label="分享项目群聊" title="分享" onClick={() => setSharing(true)}>
          <Share2 aria-hidden="true" />
        </button>
        <ViewSwitcher current="group" onViewChange={onViewChange} />
      </div>
      <div className={styles.statusbar}>
        <DeviceStatus name={deviceName} connected={connected} />
        <span className={styles.statusDivider} aria-hidden="true">·</span>
        <span className={styles.activity}>{activityText}</span>
      </div>
      </header>
      <ShareConversationDialog open={sharing} title={roomName} heading="分享项目群聊" onClose={() => setSharing(false)} />
    </>
  );
}
