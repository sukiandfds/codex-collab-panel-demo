import { ChevronRight } from "lucide-react";
import type { ProjectManagementEntry } from "../model/types";
import { formatProjectManagementTimestamp } from "../model/format";
import styles from "../ProjectManagementApp.module.css";

interface EntrySummaryRowProps {
  entry: ProjectManagementEntry;
  onOpen: (entry: ProjectManagementEntry) => void;
}

export function EntrySummaryRow({ entry, onOpen }: EntrySummaryRowProps) {
  return (
    <button className={styles.entryRow} type="button" onClick={() => onOpen(entry)}>
      <span className={styles.entryMain}>
        <span className={styles.entryMeta}>
          <span className={styles.entryId}>{entry.id}</span>
          <span>{entry.typeLabel}</span>
        </span>
        <strong className={styles.entryTitle}>{entry.title}</strong>
        <span className={styles.entrySummary}>{entry.summary}</span>
      </span>
      <span className={styles.entryAside}>
        <span className={styles.entryTags}>
          {entry.priority ? <span className={styles.priorityTag}>{entry.priority}</span> : null}
          <span className={`${styles.statusTag} ${styles[`status-${entry.status}`] || ""}`}>{entry.statusLabel}</span>
        </span>
        <time className={styles.entryTime} dateTime={entry.updatedAt || undefined}>
          {formatProjectManagementTimestamp(entry.updatedAt)}
        </time>
      </span>
      <ChevronRight className={styles.entryArrow} aria-hidden="true" />
    </button>
  );
}
