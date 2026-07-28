import { Download, ExternalLink, FileText } from "lucide-react";
import { withAccessToken } from "../../conversations/data/http";
import type { Artifact, ArtifactReviewDecision } from "../model/types";
import { ArtifactPreview } from "./ArtifactPreview";
import { ArtifactReviewActions } from "./ArtifactReviewActions";
import styles from "./ArtifactCard.module.css";

const sizeText = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const statusText = (artifact: Artifact) => {
  if (artifact.reviewDecision === "approve") return "已批准";
  if (artifact.status === "rejected") return "已打回";
  return "待审核";
};

const downloadUrl = (source: string) => withAccessToken(`${source}${source.includes("?") ? "&" : "?"}download=1`);
const htmlOpenUrl = (artifactId: string) => withAccessToken(`/api/artifacts/${encodeURIComponent(artifactId)}/open-html`);

export function ArtifactCard({ artifact, reviewing, reviewerName, onReview }: {
  artifact: Artifact;
  reviewing: boolean;
  reviewerName: string;
  onReview: (artifactId: string, decision: ArtifactReviewDecision, note: string, reviewedBy: string) => Promise<void>;
}) {
  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <span className={styles.fileIcon}><FileText aria-hidden="true" /></span>
        <div className={styles.title}>
          <strong>{artifact.name}</strong>
          <span>{artifact.mimeType} · v{artifact.version} · {sizeText(artifact.size)}</span>
        </div>
        <span className={styles.status}>{statusText(artifact)}</span>
      </header>
      <div className={styles.creator}>由 {artifact.createdByName} 创建</div>
      <ArtifactPreview artifact={artifact} />
      {artifact.reviewNote ? <p className={styles.reviewNote}>打回原因：{artifact.reviewNote}</p> : null}
      {artifact.versions.length > 1 ? (
        <details className={styles.history}>
          <summary>历史版本（{artifact.versions.length}）</summary>
          {artifact.versions.slice().reverse().map((version) => (
            <a href={downloadUrl(version.sourceUrl)} key={version.version}>v{version.version} · {version.name} · {sizeText(version.size)}</a>
          ))}
        </details>
      ) : null}
      <footer className={styles.footer}>
        {artifact.mimeType.startsWith("text/html") ? (
          <a className={styles.download} href={htmlOpenUrl(artifact.id)} target="_blank" rel="noreferrer" title={`打开 ${artifact.name}`}>
            <ExternalLink aria-hidden="true" />打开网页
          </a>
        ) : null}
        <a className={styles.download} href={downloadUrl(artifact.sourceUrl)} title={`下载 ${artifact.name}`}><Download aria-hidden="true" />下载</a>
        <ArtifactReviewActions
          artifactId={artifact.id}
          decision={artifact.reviewDecision}
          disabled={reviewing}
          onReview={(artifactId, decision, note) => onReview(artifactId, decision, note, reviewerName)}
        />
      </footer>
    </section>
  );
}
