import { useCallback, useEffect, useState } from "react";
import { contextApi } from "../data/contextApi";
import type { ContextStatus } from "../model/types";

const emptyStatus = (threadId: string): ContextStatus => ({
  type: "context_status",
  threadId,
  model: "",
  usedTokens: null,
  contextWindow: null,
  percentage: null,
  autoCompactThreshold: 80,
  phase: "idle",
  message: "",
  updatedAt: null,
});

export function useContextManagement(threadId: string) {
  const [status, setStatus] = useState<ContextStatus>(() => emptyStatus(threadId));

  useEffect(() => {
    setStatus(emptyStatus(threadId));
    if (!threadId) return;
    const controller = new AbortController();
    void contextApi.status(threadId, controller.signal).then(setStatus).catch((reason) => {
      if (!controller.signal.aborted) {
        setStatus((current) => ({
          ...current,
          phase: "failed",
          message: reason instanceof Error ? reason.message : String(reason),
        }));
      }
    });
    return () => controller.abort();
  }, [threadId]);

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

  return { status, handleEvent, compact, setThreshold };
}
