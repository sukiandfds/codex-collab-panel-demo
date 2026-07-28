import { fetchJson } from "../../../shared/api/http";

export interface WebVersion {
  buildId: string;
  builtAt: string;
}

export const fetchWebVersion = (signal?: AbortSignal) => fetchJson<WebVersion>("/api/version", signal);
