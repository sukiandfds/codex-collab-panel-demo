import { ChevronRight } from "lucide-react";
import { formatRecordedTimestamp as formatProgressTimestamp } from "../../../shared/format/dateTime";
import type { ProgressEntry } from "../data/progressApi";
import styles from "../ProjectProgressApp.module.css";

interface ProgressEntryRowProps {
  entry: ProgressEntry;
  onOpen: (id: string) => void;
}

export function ProgressEntryRow({ entry, onOpen }: ProgressEntryRowProps) {
  return (
    <button className={styles.entryRow} type="button" onClick={() => onOpen(entry.id)}>
      <span className={styles.entryBody}>
        <span className={styles.entryMeta}>
          <span className={styles.entryId}>{entry.id}</span>
          <span>{entry.type}</span>
        </span>
        <strong className={styles.entryTitle}>{entry.title}</strong>
        <span className={styles.entrySummary}>{entry.summary}</span>
        <span className={styles.entryUpdate}>{entry.updateSummary}</span>
      </span>
      <span className={styles.entryAside}>
        <span className={styles.entryTags}>
          {entry.level ? <span className={styles.levelTag}>{entry.level}</span> : null}
          <span className={`${styles.statusTag} ${styles[`status-${entry.status}`] || ""}`}>{entry.statusLabel}</span>
        </span>
        <time className={styles.entryTime} dateTime={entry.updatedAt}>{formatProgressTimestamp(entry.updatedAt)}</time>
      </span>
      <ChevronRight className={styles.entryArrow} aria-hidden="true" />
    </button>
  );
}
