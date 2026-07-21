import type { ProjectInfo, SessionDetail, SessionSummary } from "../model/types";
import { fetchJson } from "./http";

const PAGE_SIZE = 60;

export const conversationApi = {
  project: (signal?: AbortSignal) => fetchJson<ProjectInfo>("/api/project", signal),
  sessions: (signal?: AbortSignal) => fetchJson<SessionSummary[]>("/api/sessions?source=all", signal),
  session: (threadId: string, before?: number, signal?: AbortSignal) => {
    const beforeQuery = before === undefined ? "" : `&before=${before}`;
    return fetchJson<SessionDetail>(
      `/api/session?threadId=${encodeURIComponent(threadId)}&limit=${PAGE_SIZE}${beforeQuery}`,
      signal,
    );
  },
};
