import { Folder, MessageSquareText, PanelLeft } from "lucide-react";
import type { ProjectInfo, SessionDetail } from "../../features/conversations/model/types";
import styles from "./Topbar.module.css";

interface TopbarProps {
  project: ProjectInfo | null;
  session: SessionDetail | null;
  onOpenSidebar: () => void;
}

export function Topbar({ project, session, onOpenSidebar }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <button className={`${styles.iconButton} ${styles.mobileOnly}`} type="button" aria-label="打开侧栏" title="打开侧栏" onClick={onOpenSidebar}>
        <PanelLeft aria-hidden="true" />
      </button>
      <Folder className={styles.titleIcon} aria-hidden="true" />
      <div className={styles.heading}>
        <h1 className={styles.title}>{session?.title || project?.name || "正在读取会话"}</h1>
        {session ? (
          <span className={styles.meta}>
            {session.source === "happy" ? "Happy Coder" : "Codex Desktop"}{session.messageCount === null ? "" : ` · ${session.messageCount} 条消息`}
          </span>
        ) : null}
      </div>
      <span className={styles.spacer} />
      <a className={styles.iconButton} href={`/group.html${window.location.search}`} aria-label="进入项目群" title="进入项目群">
        <MessageSquareText aria-hidden="true" />
      </a>
    </header>
  );
}
