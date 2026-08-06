import { useCallback, useEffect, useState } from "react";
import { contextApi } from "../data/contextApi";
import type { ContextStatus } from "../model/types";

const MAX_CACHED_STATUSES = 100;
const statusCache = new Map<string, ContextStatus>();

const emptyStatus = (threadId: string): ContextStatus => ({
  type: "context_status",
  threadId,
  model: "",
  reasoningEffort: "",
  usedTokens: null,
  contextWindow: null,
  percentage: null,
  autoCompactThreshold: 80,
  phase: "idle",
  message: "",
  updatedAt: null,
});

const rememberStatus = (status: ContextStatus) => {
  if (!status.threadId) return status;
  statusCache.delete(status.threadId);
  statusCache.set(status.threadId, status);
  while (statusCache.size > MAX_CACHED_STATUSES) {
    const oldest = statusCache.keys().next().value;
    if (!oldest) break;
    statusCache.delete(oldest);
  }
  return status;
};

export function useContextManagement(threadId: string) {
  const [storedStatus, setStoredStatus] = useState<ContextStatus>(() => statusCache.get(threadId) ?? emptyStatus(threadId));
  const status = storedStatus.threadId === threadId
    ? storedStatus
    : statusCache.get(threadId) ?? emptyStatus(threadId);
  const setStatus = useCallback((value: ContextStatus | ((current: ContextStatus) => ContextStatus)) => {
    setStoredStatus((current) => rememberStatus(typeof value === "function" ? value(current) : value));
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!threadId) return null;
    try {
      const next = await contextApi.status(threadId, signal);
      setStatus(next);
      return next;
    } catch (reason) {
      if (!signal?.aborted) {
        setStatus((current) => ({
          ...current,
          phase: "failed",
          message: reason instanceof Error ? reason.message : String(reason),
        }));
      }
      return null;
    }
  }, [threadId]);

  useEffect(() => {
    setStatus(statusCache.get(threadId) ?? emptyStatus(threadId));
    if (!threadId) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh, threadId]);

  const handleEvent = useCallback((event: ContextStatus) => {
    if (event.type === "context_status" && event.threadId === threadId) setStatus(event);
  }, [threadId]);

  const compact = useCallback(async () => {
    if (!threadId || status.phase === "compacting") return false;
    try {
      setStatus(await contextApi.compact(threadId));
      return true;
    } catch (reason) {
      setStatus((current) => ({
        ...current,
        phase: "failed",
        message: reason instanceof Error ? reason.message : String(reason),
      }));
      return false;
    }
  }, [status.phase, threadId]);

  const setThreshold = useCallback(async (threshold: number | null) => {
    if (!threadId) return false;
    try {
      setStatus(await contextApi.setThreshold(threadId, threshold));
      return true;
    } catch (reason) {
      setStatus((current) => ({
        ...current,
        phase: "failed",
        message: reason instanceof Error ? reason.message : String(reason),
      }));
      return false;
    }
  }, [threadId]);

  return { status, handleEvent, compact, setThreshold, refresh };
}
