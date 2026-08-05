import { fetchJson } from "../../../shared/api/http";
import type { ProjectManagementDocument, ProjectManagementEntryDetail } from "../model/types";

const CACHE_MAX_AGE_MS = 30_000;
const SUMMARY_CACHE_KEY = "negus:project-management:summary";
const DETAIL_CACHE_PREFIX = "negus:project-management:entry:";
const LEGACY_SUMMARY_CACHE_KEY = "codex-collab:project-management:summary";
const LEGACY_DETAIL_CACHE_PREFIX = "codex-collab:project-management:entry:";

interface CacheEnvelope<T> {
  savedAt: number;
  value: T;
}

const readCache = <T,>(key: string, legacyKey?: string) => {
  try {
    const raw = window.sessionStorage.getItem(key)
      || (legacyKey ? window.sessionStorage.getItem(legacyKey) : null);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    return envelope.savedAt && envelope.value ? envelope : null;
  } catch {
    return null;
  }
};

const writeCache = <T,>(key: string, value: T) => {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value } satisfies CacheEnvelope<T>));
  } catch {
    // Storage may be unavailable in private browsing; the network path remains valid.
  }
};

export const readProjectManagementCache = () => readCache<ProjectManagementDocument>(
  SUMMARY_CACHE_KEY,
  LEGACY_SUMMARY_CACHE_KEY,
)?.value || null;

export const fetchProjectManagement = async (signal?: AbortSignal, options: { force?: boolean } = {}) => {
  const cached = options.force ? null : readCache<ProjectManagementDocument>(
    SUMMARY_CACHE_KEY,
    LEGACY_SUMMARY_CACHE_KEY,
  );
  if (cached && Date.now() - cached.savedAt < CACHE_MAX_AGE_MS) return cached.value;
  const value = await fetchJson<ProjectManagementDocument>("/api/project-management", signal);
  writeCache(SUMMARY_CACHE_KEY, value);
  return value;
};

export const fetchProjectManagementEntry = async (entryId: string, signal?: AbortSignal, options: { force?: boolean } = {}) => {
  const key = `${DETAIL_CACHE_PREFIX}${entryId}`;
  const legacyKey = `${LEGACY_DETAIL_CACHE_PREFIX}${entryId}`;
  const cached = options.force ? null : readCache<ProjectManagementEntryDetail>(key, legacyKey);
  if (cached && Date.now() - cached.savedAt < CACHE_MAX_AGE_MS) return cached.value;
  const value = await fetchJson<ProjectManagementEntryDetail>(
    `/api/project-management/entries/${encodeURIComponent(entryId)}`,
    signal,
  );
  writeCache(key, value);
  return value;
};
