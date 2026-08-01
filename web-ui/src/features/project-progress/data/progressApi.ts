import { fetchJson } from "../../../shared/api/http";

export interface ProjectProgressDocument {
  markdown: string;
  updatedAt: string;
}

export const fetchProjectProgress = (signal?: AbortSignal) => fetchJson<ProjectProgressDocument>("/api/project-progress", signal);
