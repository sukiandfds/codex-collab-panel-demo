export type ArtifactPreviewType = "markdown" | "image" | "audio" | "video" | "pdf" | "none";
export type ArtifactStatus = "ready" | "rejected" | "superseded";
export type ArtifactReviewDecision = "approve" | "reject";

export interface ArtifactVersion {
  version: number;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  status: ArtifactStatus;
  sourceMediaId: string;
  sourceUrl: string;
  previewType: ArtifactPreviewType;
  previewMediaId: string | null;
  previewUrl: string | null;
  reviewDecision: ArtifactReviewDecision | null;
  reviewNote: string;
  reviewedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Artifact extends ArtifactVersion {
  id: string;
  projectId: string;
  taskId: string | null;
  messageId: string | null;
  createdByAgent: string;
  createdByName: string;
  currentVersion: number;
  versions: ArtifactVersion[];
}

export type ArtifactRealtimeEvent = {
  type: "artifact.ready" | "artifact.reviewed";
  artifactId: string;
  messageId: string | null;
  status: ArtifactStatus;
  version: number;
  decision?: ArtifactReviewDecision;
  updatedAt: string;
};
