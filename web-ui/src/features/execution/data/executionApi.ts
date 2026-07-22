import { fetchJson, postJson } from "../../conversations/data/http";
import type { ExecutionStatus } from "../model/types";

interface SendMessageResult {
  threadId: string;
  turnId: string;
  status: string;
}

export const executionApi = {
  status: (threadId: string, signal?: AbortSignal) => fetchJson<ExecutionStatus>(
    `/api/execution-status?threadId=${encodeURIComponent(threadId)}`,
    signal,
  ),
  sendMessage: (threadId: string, text: string, signal?: AbortSignal) => postJson<SendMessageResult>(
    "/api/session/message",
    { threadId, text },
    signal,
  ),
};
