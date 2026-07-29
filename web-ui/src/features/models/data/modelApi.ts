import { fetchJson, postJson } from "../../../shared/api/http";
import type { CodexModel, ModelUpdateResult } from "../model/types";

export const modelApi = {
  list: (signal?: AbortSignal) => fetchJson<CodexModel[]>("/api/models", signal),
  update: (threadId: string, model: string, signal?: AbortSignal) => postJson<ModelUpdateResult>(
    "/api/session/model",
    { threadId, model },
    signal,
  ),
  updateReasoningEffort: (threadId: string, reasoningEffort: string, signal?: AbortSignal) => postJson<ModelUpdateResult>(
    "/api/session/reasoning-effort",
    { threadId, reasoningEffort },
    signal,
  ),
};
