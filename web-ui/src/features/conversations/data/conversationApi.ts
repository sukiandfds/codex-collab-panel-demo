import type { ProjectInfo, SessionResponse, SessionSummary } from "../model/types";
import { fetchJson, postJson } from "../../../shared/api/http";

const PAGE_SIZE = 60;
const READ_TIMEOUT_MS = 10000;

const currentConversationId = () => new URLSearchParams(window.location.search).get("conversation") || "";
const conversationQuery = () => {
  const conversationId = currentConversationId();
  return conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : "";
};

const fetchConversationJson = async <T,>(pathname: string, signal?: AbortSignal): Promise<T> => {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, READ_TIMEOUT_MS);
  try {
    return await fetchJson<T>(pathname, controller.signal);
  } catch (error) {
    if (timedOut) throw new Error("同步超时，正在保留当前内容");
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
};

export const conversationApi = {
  project: (signal?: AbortSignal) => fetchConversationJson<ProjectInfo>("/api/project", signal),
  sessions: (archived = false, signal?: AbortSignal) => fetchConversationJson<SessionSummary[]>(`/api/sessions?source=all${archived ? "&archived=1" : ""}${conversationQuery()}`, signal),
  create: (model = "", signal?: AbortSignal) => postJson<SessionSummary>("/api/session", { model }, signal),
  rename: (threadId: string, name: string, signal?: AbortSignal) => postJson<SessionSummary>("/api/session/name", { threadId, name, ...(currentConversationId() ? { conversationId: currentConversationId() } : {}) }, signal),
  fork: (threadId: string, lastTurnId: string, signal?: AbortSignal) => postJson<{
    session: SessionSummary;
    sourceThreadId: string;
    forkedFromTurnId: string;
  }>("/api/session/fork", { threadId, lastTurnId, ...(currentConversationId() ? { conversationId: currentConversationId() } : {}) }, signal),
  archive: (threadId: string, signal?: AbortSignal) => postJson<{ threadId: string; archived: boolean }>("/api/session/archive", { threadId, ...(currentConversationId() ? { conversationId: currentConversationId() } : {}) }, signal),
  unarchive: (threadId: string, signal?: AbortSignal) => postJson<SessionSummary>("/api/session/unarchive", { threadId, ...(currentConversationId() ? { conversationId: currentConversationId() } : {}) }, signal),
  session: (threadId: string, { before, cursor, contentVersion }: {
    before?: number;
    cursor?: string;
    contentVersion?: number;
  } = {}, signal?: AbortSignal) => {
    const beforeQuery = before === undefined ? "" : `&before=${before}`;
    const cursorQuery = cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`;
    const contentVersionQuery = contentVersion === undefined ? "" : `&contentVersion=${contentVersion}`;
    return fetchConversationJson<SessionResponse>(
      `/api/session?threadId=${encodeURIComponent(threadId)}&limit=${PAGE_SIZE}${conversationQuery()}${beforeQuery}${cursorQuery}${contentVersionQuery}`,
      signal,
    );
  },
};
