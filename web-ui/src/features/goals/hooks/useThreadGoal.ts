import { useCallback, useEffect, useState } from "react";
import { goalApi } from "../data/goalApi";
import type { ProjectEvent } from "../../execution/model/types";
import type { GoalStatus, ThreadGoal } from "../model/types";

export function useThreadGoal(threadId: string) {
  const [goal, setGoal] = useState<ThreadGoal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!threadId) {
      setGoal(null);
      return null;
    }
    try {
      const result = await goalApi.get(threadId, signal);
      setGoal(result.goal || null);
      setError("");
      return result.goal || null;
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    }
  }, [threadId]);

  useEffect(() => {
    setGoal(null);
    setError("");
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const update = useCallback(async (patch: { objective?: string; status?: GoalStatus; tokenBudget?: number }) => {
    if (!threadId) return null;
    setBusy(true);
    setError("");
    try {
      const result = await goalApi.set(threadId, patch);
      setGoal(result.goal || null);
      return result.goal || null;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setBusy(false);
    }
  }, [threadId]);

  const clear = useCallback(async () => {
    if (!threadId) return false;
    setBusy(true);
    setError("");
    try {
      await goalApi.clear(threadId);
      setGoal(null);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }, [threadId]);

  const handleEvent = useCallback((event: ProjectEvent) => {
    if (event.type === "goal_status" && event.threadId === threadId) setGoal(event.goal);
  }, [threadId]);

  return { goal, busy, error, refresh, update, clear, handleEvent };
}
