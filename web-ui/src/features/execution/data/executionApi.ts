import { fetchJson, postJson } from "../../../shared/api/http";
import type { ExecutionStatus } from "../model/types";

const currentConversationId = () => new URLSearchParams(window.location.search).get("conversation") || "";
const conversationQuery = () => {
  const conversationId = currentConversationId();
  return conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : "";
};
const withConversation = <T extends Record<string, unknown>>(body: T) => {
  const conversationId = currentConversationId();
  return conversationId ? { ...body, conversationId } : body;
};

export interface SendMessageResult {
  threadId: string;
  turnId: string;
  status: string;
  migratedFromThreadId?: string;
}

export interface SubmissionStatusResult {
  threadId: string;
  submissionId: string;
  status: "accepted" | "pending" | "failed" | "unknown";
  turnId?: string;
  messageId?: string;
  error?: string;
}

export type SendMessageAttempt =
  | { outcome: "accepted"; result: SendMessageResult }
  | { outcome: "uncertain"; result: null }
  | { outcome: "failed"; result: null };

interface InterruptResult {
  threadId: string;
  turnId: string;
  status: string;
}

export const executionApi = {
  status: (threadId: string, signal?: AbortSignal, reconcile = false) => fetchJson<ExecutionStatus>(
    `/api/execution-status?threadId=${encodeURIComponent(threadId)}${conversationQuery()}${reconcile ? "&reconcile=1" : ""}`,
    signal,
  ),
  sendMessage: (threadId: string, text: string, attachmentIds: string[] = [], submissionId = "", signal?: AbortSignal) => postJson<SendMessageResult>(
    "/api/session/message",
    withConversation({ threadId, text, attachmentIds, submissionId }),
    signal,
  ),
  submissionStatus: (threadId: string, submissionId: string, signal?: AbortSignal) => fetchJson<SubmissionStatusResult>(
    `/api/session/submission?threadId=${encodeURIComponent(threadId)}&submissionId=${encodeURIComponent(submissionId)}${conversationQuery()}`,
    signal,
  ),
  interrupt: (threadId: string, signal?: AbortSignal) => postJson<InterruptResult>(
    "/api/session/interrupt",
    withConversation({ threadId }),
    signal,
  ),
  review: (threadId: string, signal?: AbortSignal) => postJson<{ threadId: string; status: string }>(
    "/api/session/review",
    withConversation({ threadId }),
    signal,
  ),
};
