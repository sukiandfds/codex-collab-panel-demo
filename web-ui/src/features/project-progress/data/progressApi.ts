import { fetchJson } from "../../../shared/api/http";

export interface ProgressUpdate {
  at: string;
  status: string;
  statusLabel: string;
  change: string;
  entryId?: string;
  title?: string;
  category?: string;
  level?: string | null;
}

export interface ProgressEntry {
  id: string;
  type: string;
  category: string;
  title: string;
  summary: string;
  level: string | null;
  status: string;
  statusLabel: string;
  updatedAt: string;
  updateSummary: string;
  userQuote: string;
  initialAnalysis: string;
  concreteContent: string;
  expectedEffect: string;
  relatedItems: string[];
  sourcePath: string;
  updates: ProgressUpdate[];
  evidence: string[];
  sourceStatus: string;
}

export interface ProgressCategory {
  name: string;
  entries: ProgressEntry[];
}

export interface ProjectProgressDocument {
  project: string;
  markdown: string;
  updatedAt: string;
  source: string;
  plan: ProgressEntry[];
  inProgress: ProgressEntry[];
  categories: ProgressCategory[];
  entries: ProgressEntry[];
  logs: ProgressUpdate[];
}

export const fetchProjectProgress = (signal?: AbortSignal) => fetchJson<ProjectProgressDocument>("/api/project-progress", signal);
