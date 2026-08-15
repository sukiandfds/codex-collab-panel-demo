import { conversationQuery, withConversation } from "../../../shared/api/conversationScope";
import { deleteJson, fetchJson, postJson } from "../../../shared/api/http";
import type { GoalResponse, GoalStatus } from "../model/types";

export const goalApi = {
  get: (threadId: string, signal?: AbortSignal) => fetchJson<GoalResponse>(
    `/api/session/goal?threadId=${encodeURIComponent(threadId)}${conversationQuery()}`,
    signal,
  ),
  set: (threadId: string, patch: {
    objective?: string;
    status?: GoalStatus;
    tokenBudget?: number;
  }, signal?: AbortSignal) => postJson<GoalResponse>(
    "/api/session/goal",
    withConversation({ threadId, ...patch }),
    signal,
  ),
  clear: (threadId: string, signal?: AbortSignal) => deleteJson<GoalResponse>(
    "/api/session/goal",
    withConversation({ threadId }),
    signal,
  ),
};
