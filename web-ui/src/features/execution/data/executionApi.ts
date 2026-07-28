import { fetchJson, postJson } from "../../../shared/api/http";
import type { ExecutionStatus } from "../model/types";

interface SendMessageResult {
  threadId: string;
  turnId: string;
  status: string;
}

interface InterruptResult {
  threadId: string;
  turnId: string;
  status: string;
}

export const executionApi = {
  status: (threadId: string, signal?: AbortSignal) => fetchJson<ExecutionStatus>(
    `/api/execution-status?threadId=${encodeURIComponent(threadId)}`,
    signal,
  ),
  sendMessage: (threadId: string, text: string, attachmentIds: string[] = [], signal?: AbortSignal) => postJson<SendMessageResult>(
    "/api/session/message",
    { threadId, text, attachmentIds },
    signal,
  ),
  interrupt: (threadId: string, signal?: AbortSignal) => postJson<InterruptResult>(
    "/api/session/interrupt",
    { threadId },
    signal,
  ),
};
