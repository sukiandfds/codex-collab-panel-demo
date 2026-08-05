import { fetchJson, postJson } from "../../../shared/api/http";
import type { FollowUpQueueItem } from "../model/followUpQueue";

interface FollowUpQueueResponse {
  threadId: string;
  item?: FollowUpQueueItem;
  items: FollowUpQueueItem[];
}

export const followUpQueueApi = {
  list: (threadId: string, signal?: AbortSignal) => fetchJson<FollowUpQueueResponse>(
    `/api/session/queue?threadId=${encodeURIComponent(threadId)}`,
    signal,
  ),
  enqueue: (threadId: string, text: string, attachmentIds: string[], submissionId: string) => postJson<FollowUpQueueResponse>(
    "/api/session/queue",
    { threadId, text, attachmentIds, submissionId },
  ),
  action: (threadId: string, action: string, itemId: string, extra: Record<string, unknown> = {}) => postJson<FollowUpQueueResponse>(
    "/api/session/queue",
    { threadId, action, itemId, ...extra },
  ),
};
