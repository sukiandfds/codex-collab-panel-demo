import type { ProjectInfo, SessionDetail, SessionSummary } from "../model/types";
import { fetchJson, postJson } from "../../../shared/api/http";

const PAGE_SIZE = 60;
const READ_TIMEOUT_MS = 12000;

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
  sessions: (signal?: AbortSignal) => fetchConversationJson<SessionSummary[]>("/api/sessions?source=all", signal),
  create: (model = "", signal?: AbortSignal) => postJson<SessionSummary>("/api/session", { model }, signal),
  session: (threadId: string, before?: number, signal?: AbortSignal) => {
    const beforeQuery = before === undefined ? "" : `&before=${before}`;
    return fetchConversationJson<SessionDetail>(
      `/api/session?threadId=${encodeURIComponent(threadId)}&limit=${PAGE_SIZE}${beforeQuery}`,
      signal,
    );
  },
};
