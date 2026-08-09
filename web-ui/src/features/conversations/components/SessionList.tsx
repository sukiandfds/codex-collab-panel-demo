import { Archive, ArchiveRestore } from "lucide-react";
import type { SessionSummary } from "../model/types";
import type { ExecutionStatus } from "../../execution/model/types";
import { ProjectStatusBadge } from "../../project-directory/components/ProjectStatusBadge";
import styles from "./SessionList.module.css";

interface SessionListProps {
  sessions: SessionSummary[];
  selectedId: string;
  loading: boolean;
  error: string;
  archivedView: boolean;
  archiveBusyId: string;
  onSelect: (threadId: string) => void;
  onArchive: (threadId: string) => Promise<boolean>;
  onUnarchive: (threadId: string) => Promise<boolean>;
  currentStatus?: ExecutionStatus;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
});

export function SessionList({
  sessions,
  selectedId,
  loading,
  error,
  archivedView,
  archiveBusyId,
  onSelect,
  onArchive,
  onUnarchive,
  currentStatus,
}: SessionListProps) {
  return (
    <div className={styles.root}>
      <h2>{archivedView ? "已归档对话" : "项目会话"}</h2>
      {loading ? <div className={styles.loading}><span /><span /><span /></div> : null}
      {!loading && error ? <p className={styles.error}>{error}</p> : null}
      {!loading && !sessions.length && !error ? <p className={styles.empty}>当前项目暂无可显示会话</p> : null}
      {sessions.map((session) => (
        <div className={`${styles.itemRow} ${session.threadId === selectedId ? styles.activeRow : ""}`} key={session.threadId}>
          <button
            className={styles.item}
            type="button"
            onClick={() => onSelect(session.threadId)}
          >
            <span className={styles.content}>
              {session.threadId === currentStatus?.threadId ? <ProjectStatusBadge status={currentStatus} compact /> : null}
              <span className={styles.title}>{session.title}</span>
              <span className={styles.meta}>
                {session.source === "happy" ? "Happy · " : ""}{timeFormatter.format(new Date(session.updatedAt))}
                {session.messageCount === null ? "" : ` · ${session.messageCount} 条`}
              </span>
            </span>
          </button>
          <button
            className={styles.itemAction}
            type="button"
            aria-label={archivedView ? `恢复 ${session.title}` : `归档 ${session.title}`}
            title={archivedView ? "恢复对话" : "归档对话"}
            disabled={archiveBusyId === session.threadId}
            onClick={() => void (archivedView ? onUnarchive(session.threadId) : onArchive(session.threadId))}
          >
            {archivedView ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
          </button>
        </div>
      ))}
    </div>
  );
}
