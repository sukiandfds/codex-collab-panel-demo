import { Folder, PanelLeft } from "lucide-react";
import { ViewSwitcher } from "../../../components/ViewSwitcher/ViewSwitcher";
import { DeviceStatus } from "../../device/components/DeviceStatus";
import type { ProjectInfo, SessionDetail } from "../model/types";
import styles from "./ConversationHeader.module.css";

interface ConversationHeaderProps {
  project: ProjectInfo | null;
  session: SessionDetail | null;
  deviceName?: string;
  connected: boolean;
  onOpenSidebar: () => void;
}

export function ConversationHeader({ project, session, deviceName, connected, onOpenSidebar }: ConversationHeaderProps) {
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
