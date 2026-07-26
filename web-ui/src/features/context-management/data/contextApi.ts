import { fetchJson, postJson } from "../../conversations/data/http";
import type { ContextStatus } from "../model/types";

export const contextApi = {
  status: (threadId: string, signal?: AbortSignal) => fetchJson<ContextStatus>(
    `/api/session/context?threadId=${encodeURIComponent(threadId)}`,
    signal,
  ),
  compact: (threadId: string, signal?: AbortSignal) => postJson<ContextStatus>(
    "/api/session/context/compact",
    { threadId },
    signal,
  ),
  setThreshold: (threadId: string, autoCompactThreshold: number | null, signal?: AbortSignal) => postJson<ContextStatus>(
    "/api/session/context/settings",
    { threadId, autoCompactThreshold },
    signal,
  ),
};
