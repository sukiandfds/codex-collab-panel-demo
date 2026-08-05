import { fetchJson, postJson } from "../../../shared/api/http";
import type { ExecutionStatus } from "../model/types";

export interface SendMessageResult {
  threadId: string;
  turnId: string;
  status: string;
  migratedFromThreadId?: string;
}

interface InterruptResult {
  threadId: string;
  turnId: string;
  status: string;
}

export const executionApi = {
  status: (threadId: string, signal?: AbortSignal, reconcile = false) => fetchJson<ExecutionStatus>(
    `/api/execution-status?threadId=${encodeURIComponent(threadId)}${reconcile ? "&reconcile=1" : ""}`,
    signal,
  ),
  sendMessage: (threadId: string, text: string, attachmentIds: string[] = [], submissionId = "", signal?: AbortSignal) => postJson<SendMessageResult>(
    "/api/session/message",
    { threadId, text, attachmentIds, submissionId },
    signal,
  ),
  interrupt: (threadId: string, signal?: AbortSignal) => postJson<InterruptResult>(
    "/api/session/interrupt",
    { threadId },
    signal,
  ),
};
