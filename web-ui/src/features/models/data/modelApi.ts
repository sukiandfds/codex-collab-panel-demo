import { fetchJson, postJson } from "../../../shared/api/http";
import { withConversation } from "../../../shared/api/conversationScope";
import type { CodexModel, ModelUpdateResult } from "../model/types";

export const modelApi = {
  list: (signal?: AbortSignal) => fetchJson<CodexModel[]>("/api/models", signal),
  update: (threadId: string, model: string, signal?: AbortSignal) => postJson<ModelUpdateResult>(
    "/api/session/model",
    withConversation({ threadId, model }),
    signal,
  ),
  updateReasoningEffort: (threadId: string, reasoningEffort: string, signal?: AbortSignal) => postJson<ModelUpdateResult>(
    "/api/session/reasoning-effort",
    withConversation({ threadId, reasoningEffort }),
    signal,
  ),
};
