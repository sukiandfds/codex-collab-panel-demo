import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { ArtifactReviewDecision } from "../model/types";
import styles from "./ArtifactCard.module.css";

export function ArtifactReviewActions({ artifactId, decision, disabled, onReview }: {
  artifactId: string;
  decision: ArtifactReviewDecision | null;
  disabled: boolean;
  onReview: (artifactId: string, decision: ArtifactReviewDecision, note: string) => Promise<void>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const submit = async (nextDecision: ArtifactReviewDecision) => {
    setError("");
    try {
      await onReview(artifactId, nextDecision, nextDecision === "reject" ? note : "");
      if (nextDecision === "reject") setRejecting(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <div className={styles.reviewArea}>
      {rejecting ? (
        <div className={styles.rejectForm}>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="打回原因（可选）" maxLength={2000} />
          <button type="button" disabled={disabled} onClick={() => void submit("reject")}>确认打回</button>
          <button type="button" disabled={disabled} onClick={() => setRejecting(false)}>取消</button>
        </div>
      ) : (
        <div className={styles.reviewButtons}>
          <button type="button" disabled={disabled || decision === "approve"} onClick={() => void submit("approve")} title="批准当前版本"><Check aria-hidden="true" />批准</button>
          <button type="button" disabled={disabled} onClick={() => setRejecting(true)} title="打回当前版本"><RotateCcw aria-hidden="true" />打回</button>
        </div>
      )}
      {error ? <p className={styles.reviewError}>{error}</p> : null}
    </div>
  );
}
