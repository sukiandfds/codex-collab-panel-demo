import type { ProgressUpdate } from "../data/progressApi";
import { formatProgressTimestamp } from "../model/format";
import styles from "../ProjectProgressApp.module.css";

interface ProgressLogListProps {
  logs: ProgressUpdate[];
  onOpen: (id: string) => void;
  limit?: number;
}

export function ProgressLogList({ logs, onOpen, limit = 8 }: ProgressLogListProps) {
  const visibleLogs = logs.slice(0, limit);
  if (!visibleLogs.length) return <p className={styles.muted}>暂无更新记录。</p>;
  return (
    <div className={styles.logList}>
      {visibleLogs.map((log, index) => (
        <button className={styles.logRow} type="button" key={`${log.entryId}-${log.at}-${index}`} onClick={() => log.entryId && onOpen(log.entryId)}>
          <span className={styles.logMeta}>
            <time dateTime={log.at}>{formatProgressTimestamp(log.at)}</time>
            <span className={styles.entryId}>{log.entryId}</span>
            {log.level ? <span className={styles.levelTag}>{log.level}</span> : null}
          </span>
          <strong>{log.title}</strong>
          <span className={styles.logChange}>{log.change}</span>
          <span className={`${styles.statusTag} ${styles[`status-${log.status}`] || ""}`}>{log.statusLabel}</span>
        </button>
      ))}
    </div>
  );
}
