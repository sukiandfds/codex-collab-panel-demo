import { fetchJson, postJson } from "../../conversations/data/http";
import type { CodexModel, ModelUpdateResult } from "../model/types";

export const modelApi = {
  list: (signal?: AbortSignal) => fetchJson<CodexModel[]>("/api/models", signal),
  update: (threadId: string, model: string, signal?: AbortSignal) => postJson<ModelUpdateResult>(
    "/api/session/model",
    { threadId, model },
    signal,
  ),
};
