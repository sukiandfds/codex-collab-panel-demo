import { RefreshCw } from "lucide-react";
import type { Artifact, ArtifactReviewDecision } from "../model/types";
import { ArtifactCard } from "./ArtifactCard";
import styles from "./ArtifactCard.module.css";

export function ArtifactCollection({ artifactIds, artifacts, loadErrors, reviewingIds, reviewerName, onRetry, onReview }: {
  artifactIds: string[];
  artifacts: Record<string, Artifact>;
  loadErrors: Record<string, boolean>;
  reviewingIds: Set<string>;
  reviewerName: string;
  onRetry: (artifactId: string) => Promise<void>;
  onReview: (artifactId: string, decision: ArtifactReviewDecision, note: string, reviewedBy: string) => Promise<void>;
}) {
  if (!artifactIds.length) return null;
  return (
    <div className={styles.collection}>
      {artifactIds.map((id) => artifacts[id]
        ? <ArtifactCard artifact={artifacts[id]} reviewing={reviewingIds.has(id)} reviewerName={reviewerName} onReview={onReview} key={id} />
        : loadErrors[id]
          ? (
            <div className={styles.errorCard} key={id}>
              <span>交付物暂时无法读取</span>
              <button type="button" onClick={() => void onRetry(id).catch(() => {})}><RefreshCw aria-hidden="true" />重试</button>
            </div>
          )
          : <div className={styles.loadingCard} key={id}>正在读取交付物...</div>)}
    </div>
  );
}
