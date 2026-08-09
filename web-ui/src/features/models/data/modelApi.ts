import { fetchJson, postJson } from "../../../shared/api/http";
import type { CodexModel, ModelUpdateResult } from "../model/types";

const currentConversationId = () => new URLSearchParams(window.location.search).get("conversation") || "";
const withConversation = <T extends Record<string, unknown>>(body: T) => {
  const conversationId = currentConversationId();
  return conversationId ? { ...body, conversationId } : body;
};

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
