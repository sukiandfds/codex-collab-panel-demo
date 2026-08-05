import type { MediaFile } from "../../../shared/model/media";

export type FollowUpQueueState = "pending" | "dispatching" | "failed";

export interface FollowUpQueueItem {
  id: string;
  threadId: string;
  submissionId: string;
  text: string;
  attachmentIds: string[];
  attachments: MediaFile[];
  state: FollowUpQueueState;
  error: string;
  createdAt: string;
  updatedAt: string;
  position: number;
}
