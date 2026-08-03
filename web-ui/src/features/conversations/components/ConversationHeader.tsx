import { useCallback, useState, type ReactNode } from "react";
import { Folder, PanelLeft, Share2 } from "lucide-react";
import { ViewSwitcher } from "../../../components/ViewSwitcher/ViewSwitcher";
import { ShareConversationDialog } from "../../conversation-sharing/components/ShareConversationDialog";
import { DeviceStatus } from "../../device/components/DeviceStatus";
import type { ProjectInfo, SessionDetail } from "../model/types";
import styles from "./ConversationHeader.module.css";

interface ConversationHeaderProps {
  project: ProjectInfo | null;
  session: SessionDetail | null;
  deviceName?: string;
  connected: boolean;
  onOpenSidebar: () => void;
  usage?: ReactNode;
}

export function ConversationHeader({ project, session, deviceName, connected, onOpenSidebar, usage }: ConversationHeaderProps) {
  const [sharing, setSharing] = useState(false);
  const closeSharing = useCallback(() => setSharing(false), []);
  const title = session?.title || project?.name || "当前对话";

  return (
    <>
      <header className={styles.header}>
        <div className={styles.topbar}>
          <button className={`${styles.iconButton} ${styles.mobileOnly}`} type="button" aria-label="打开侧栏" title="打开侧栏" onClick={onOpenSidebar}>
            <PanelLeft aria-hidden="true" />
          </button>
          <Folder className={styles.titleIcon} aria-hidden="true" />
          <div className={styles.heading}>
            <h1 className={styles.title}>{session?.title || project?.name || "正在读取会话"}</h1>
            {session ? <span className={styles.meta}>{session.source === "happy" ? "Happy Coder" : "Codex Desktop"}{session.messageCount === null ? "" : ` · ${session.messageCount} 条消息`}</span> : null}
          </div>
          <span className={styles.spacer} />
          <button className={styles.iconButton} type="button" aria-label="分享当前对话" title="分享" onClick={() => setSharing(true)}>
            <Share2 aria-hidden="true" />
          </button>
          <ViewSwitcher current="conversation" />
        </div>
        <div className={styles.statusbar}>
          <DeviceStatus name={deviceName} connected={connected} />
          <span className={styles.statusDivider} aria-hidden="true">·</span>
          {usage}
        </div>
      </header>
      <ShareConversationDialog open={sharing} title={title} onClose={closeSharing} />
    </>
  );
}
