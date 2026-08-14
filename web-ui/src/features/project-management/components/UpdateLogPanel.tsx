import { ChevronRight } from "lucide-react";
import { formatRecordedTimestamp as formatProjectManagementTimestamp } from "../../../shared/format/dateTime";
import type { ProjectManagementEntry, ProjectManagementUpdate } from "../model/types";
import styles from "../ProjectManagementApp.module.css";

interface UpdateLogPanelProps {
  updates: ProjectManagementUpdate[];
  entries: Map<string, ProjectManagementEntry>;
  onOpen: (entry: ProjectManagementEntry) => void;
}

export function UpdateLogPanel({ updates, entries, onOpen }: UpdateLogPanelProps) {
  if (!updates.length) return <p className={styles.empty}>暂无更新记录。</p>;
  return (
    <div className={styles.updateList}>
      {updates.slice(0, 8).map((update, index) => {
        const entry = update.entryId ? entries.get(update.entryId) : undefined;
        return (
          <button
            className={styles.updateRow}
            type="button"
            key={`${update.entryId || "update"}-${update.at || "unknown"}-${index}`}
            onClick={() => entry && onOpen(entry)}
            disabled={!entry}
          >
            <span className={styles.updateMeta}>
              <time dateTime={update.at || undefined}>{formatProjectManagementTimestamp(update.at)}</time>
              {update.entryId ? <span className={styles.entryId}>{update.entryId}</span> : null}
              <span className={`${styles.statusTag} ${styles[`status-${update.status}`] || ""}`}>{update.statusLabel}</span>
            </span>
            <strong>{update.change}</strong>
            <span>{update.userImpact}</span>
            {entry ? <ChevronRight className={styles.entryArrow} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}
