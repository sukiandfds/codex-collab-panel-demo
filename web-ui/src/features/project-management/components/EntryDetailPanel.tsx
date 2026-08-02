import { ExternalLink, X } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectManagementEntry } from "../model/types";
import { formatProjectManagementTimestamp, splitProjectText } from "../model/format";
import styles from "../ProjectManagementApp.module.css";

interface EntryDetailPanelProps {
  entry: ProjectManagementEntry;
  entries: Map<string, ProjectManagementEntry>;
  onOpenRelated: (entry: ProjectManagementEntry) => void;
  onClose: () => void;
  loading: boolean;
  error: string;
}

const DetailSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className={styles.detailSection}>
    <h3>{title}</h3>
    {children}
  </section>
);

const DetailText = ({ value }: { value: string }) => (
  <div className={styles.detailText}>
    {splitProjectText(value).map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)}
  </div>
);

export function EntryDetailPanel({ entry, entries, onOpenRelated, onClose, loading, error }: EntryDetailPanelProps) {
  return (
    <div className={styles.detailOverlay} role="presentation" onMouseDown={onClose}>
      <aside
        className={styles.detailPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-management-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.detailHeader}>
          <div>
            <div className={styles.entryMeta}>
              <span className={styles.entryId}>{entry.id}</span>
              <span>{entry.typeLabel}</span>
            </div>
            <h2 id="project-management-detail-title">{entry.title}</h2>
            <div className={styles.detailHeaderMeta}>
              {entry.priority ? <span className={styles.priorityTag}>{entry.priority}</span> : null}
              <span className={`${styles.statusTag} ${styles[`status-${entry.status}`] || ""}`}>{entry.statusLabel}</span>
              <span>更新于 {formatProjectManagementTimestamp(entry.updatedAt)}</span>
            </div>
          </div>
          <button className={styles.iconButton} type="button" aria-label="关闭条目详情" title="关闭" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.detailScroll}>
          <DetailSection title="摘要"><p className={styles.detailLead}>{entry.summary}</p></DetailSection>
          {loading ? <p className={styles.detailState}>正在读取条目详情...</p> : null}
          {error ? <p className={styles.detailError} role="alert">{error}</p> : null}
          {!loading && !error ? <>
          <DetailSection title="用户原话"><blockquote>{entry.userQuote || "当前条目未记录原始用户原话。"}</blockquote></DetailSection>
          <DetailSection title="助手初步理解"><DetailText value={entry.initialAnalysis || "当前条目未记录助手对用户字面意思的初步理解。"} /></DetailSection>
          <DetailSection title="具体内容"><DetailText value={entry.concreteContent || "当前条目未记录具体内容。"} /></DetailSection>
          <DetailSection title="预计效果"><DetailText value={entry.expectedEffect || "当前条目未记录预计效果。"} /></DetailSection>

          <DetailSection title="关联条目">
            {entry.relatedItems?.length ? (
              <div className={styles.relatedList}>
                {entry.relatedItems.map((id) => {
                  const related = entries.get(id);
                  return related ? (
                    <button key={id} className={styles.relatedItem} type="button" onClick={() => onOpenRelated(related)}>
                      <span>{id}</span><span>{related.title}</span>
                    </button>
                  ) : <span key={id} className={styles.relatedItemStatic}>{id}</span>;
                })}
              </div>
            ) : <p className={styles.muted}>暂无已记录的关联条目。</p>}
          </DetailSection>

          <DetailSection title="更新历史">
            <ol className={styles.timeline}>
              {[...(entry.updates || [])].reverse().map((update, index) => (
                <li key={`${update.at}-${index}`}>
                  <time dateTime={update.at || undefined}>{formatProjectManagementTimestamp(update.at)}</time>
                  <strong>{update.statusLabel}</strong>
                  <p>{update.change}</p>
                  <span>{update.userImpact}</span>
                </li>
              ))}
            </ol>
          </DetailSection>

          <DetailSection title="文件与证据">
            <div className={styles.evidenceList}>
              {[entry.sourcePath, entry.updatesPath, ...(entry.evidence || [])]
                .filter((value, index, values) => value && values.indexOf(value) === index)
                .map((value) => <span key={value}><ExternalLink aria-hidden="true" />{value}</span>)}
            </div>
          </DetailSection>
          </> : null}
        </div>
      </aside>
    </div>
  );
}
