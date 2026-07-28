import { fetchJson, postJson } from "../../../shared/api/http";
import type { Artifact, ArtifactReviewDecision } from "../model/types";

export const artifactApi = {
  get: (artifactId: string, signal?: AbortSignal) => fetchJson<Artifact>(`/api/artifacts/${encodeURIComponent(artifactId)}`, signal),
  review: (artifactId: string, decision: ArtifactReviewDecision, note: string, reviewedBy: string, signal?: AbortSignal) => postJson<Artifact>(
    `/api/artifacts/${encodeURIComponent(artifactId)}/review`,
    { decision, note, reviewedBy },
    signal,
  ),
};
