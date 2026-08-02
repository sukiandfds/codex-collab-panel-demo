import { ExternalLink, X } from "lucide-react";
import type { ReactNode } from "react";
import type { ProgressEntry } from "../data/progressApi";
import { formatProgressTimestamp, splitDetailParagraphs } from "../model/format";
import styles from "../ProjectProgressApp.module.css";

interface ProgressEntryDetailProps {
  entry: ProgressEntry;
  relatedEntries: Map<string, ProgressEntry>;
  onOpenRelated: (id: string) => void;
  onClose: () => void;
}

const DetailSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className={styles.detailSection}>
    <h3>{title}</h3>
    {children}
  </section>
);

const DetailText = ({ value }: { value: string }) => (
  <div className={styles.detailText}>
    {splitDetailParagraphs(value).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
  </div>
);

export function ProgressEntryDetail({ entry, relatedEntries, onOpenRelated, onClose }: ProgressEntryDetailProps) {
  return (
    <div className={styles.detailOverlay} role="presentation" onMouseDown={onClose}>
      <aside className={styles.detailPanel} role="dialog" aria-modal="true" aria-labelledby="progress-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.detailHeader}>
          <div>
            <div className={styles.entryMeta}>
              <span className={styles.entryId}>{entry.id}</span>
              <span>{entry.type}</span>
            </div>
            <h2 id="progress-detail-title">{entry.title}</h2>
            <div className={styles.detailHeaderMeta}>
              {entry.level ? <span className={styles.levelTag}>{entry.level}</span> : null}
              <span className={`${styles.statusTag} ${styles[`status-${entry.status}`] || ""}`}>{entry.statusLabel}</span>
              <span>更新于 {formatProgressTimestamp(entry.updatedAt)}</span>
            </div>
          </div>
          <button className={styles.iconButton} type="button" aria-label="关闭条目详情" title="关闭" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.detailScroll}>
          <DetailSection title="摘要"><p className={styles.detailLead}>{entry.summary}</p></DetailSection>
          <DetailSection title="用户原话"><blockquote>{entry.userQuote}</blockquote></DetailSection>
          <DetailSection title="助手初步理解"><DetailText value={entry.initialAnalysis} /></DetailSection>
          <DetailSection title="具体内容"><DetailText value={entry.concreteContent} /></DetailSection>
          <DetailSection title="预计效果"><DetailText value={entry.expectedEffect} /></DetailSection>

          <DetailSection title="关联条目">
            {entry.relatedItems.length ? (
              <div className={styles.relatedList}>
                {entry.relatedItems.map((id) => {
                  const related = relatedEntries.get(id);
                  return related ? (
                    <button key={id} className={styles.relatedItem} type="button" onClick={() => onOpenRelated(id)}>
                      <span>{id}</span><span>{related.title}</span>
                    </button>
                  ) : <span key={id} className={styles.relatedItemStatic}>{id}</span>;
                })}
              </div>
            ) : <p className={styles.muted}>暂无已记录的关联条目。</p>}
          </DetailSection>

          <DetailSection title="更新历史">
            <ol className={styles.timeline}>
              {[...entry.updates].reverse().map((update, index) => (
                <li key={`${update.at}-${index}`}>
                  <time dateTime={update.at}>{formatProgressTimestamp(update.at)}</time>
                  <strong>{update.statusLabel}</strong>
                  <p>{update.change}</p>
                </li>
              ))}
            </ol>
          </DetailSection>

          <DetailSection title="文件与证据">
            <div className={styles.evidenceList}>
              {entry.evidence.map((path) => <span key={path}><ExternalLink aria-hidden="true" />{path}</span>)}
            </div>
          </DetailSection>
        </div>
      </aside>
    </div>
  );
}
