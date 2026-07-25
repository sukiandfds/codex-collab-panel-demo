import { Folder, PanelLeft } from "lucide-react";
import { DeviceStatus } from "../../features/device/components/DeviceStatus";
import type { ProjectInfo, SessionDetail } from "../../features/conversations/model/types";
import { ViewSwitcher } from "../ViewSwitcher/ViewSwitcher";
import styles from "./Topbar.module.css";

interface TopbarProps {
  project: ProjectInfo | null;
  session: SessionDetail | null;
  deviceName?: string;
  connected: boolean;
  onOpenSidebar: () => void;
}

export function Topbar({ project, session, deviceName, connected, onOpenSidebar }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <button className={`${styles.iconButton} ${styles.mobileOnly}`} type="button" aria-label="打开侧栏" title="打开侧栏" onClick={onOpenSidebar}>
        <PanelLeft aria-hidden="true" />
      </button>
      <Folder className={styles.titleIcon} aria-hidden="true" />
      <div className={styles.heading}>
        <h1 className={styles.title}>{session?.title || project?.name || "正在读取会话"}</h1>
        <div className={styles.metaRow}>
          {session ? <span className={styles.meta}>{session.source === "happy" ? "Happy Coder" : "Codex Desktop"}{session.messageCount === null ? "" : ` · ${session.messageCount} 条消息`}</span> : null}
          <DeviceStatus name={deviceName} connected={connected} />
        </div>
      </div>
      <span className={styles.spacer} />
      <ViewSwitcher current="conversation" />
    </header>
  );
}
