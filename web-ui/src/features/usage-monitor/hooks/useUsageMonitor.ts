import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutionStatus } from "../../execution/model/types";
import { usageApi } from "../data/usageApi";
import type { FushengUsageSnapshot } from "../model/types";

const CACHE_KEY = "codex-collab:fusheng-usage";
const COMPLETION_REFRESH_DELAY_MS = 2_000;

const readCachedSnapshot = (): FushengUsageSnapshot | null => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FushengUsageSnapshot>;
    if (value.provider !== "fusheng"
      || !value.updatedAt
      || !value.queryDate
      || !value.today
      || !value.account
      || !value.featuredGroup
      || !value.groupRatios) return null;
    return value as FushengUsageSnapshot;
  } catch {
    return null;
  }
};

export function useUsageMonitor(executionStatus: ExecutionStatus) {
  const [snapshot, setSnapshot] = useState<FushengUsageSnapshot | null>(readCachedSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeTurnId = useRef("");
  const lastCompletedTurnId = useRef("");
  const completionTimer = useRef(0);
  const requestController = useRef<AbortController | null>(null);

  const refresh = useCallback(async (force = false, turnId = "") => {
    if (requestController.current) return false;
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError("");
    try {
      const next = await usageApi.read(force, turnId, controller.signal);
      setSnapshot(next);
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        // The live snapshot remains usable when browser storage is unavailable.
      }
      return true;
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      return false;
    } finally {
      if (requestController.current === controller) requestController.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (executionStatus.active && executionStatus.turnId) {
      activeTurnId.current = executionStatus.turnId;
      return;
    }
    const completedTurnId = executionStatus.turnId;
    if (executionStatus.phase !== "completed"
      || !completedTurnId
      || activeTurnId.current !== completedTurnId
      || lastCompletedTurnId.current === completedTurnId) return;

    lastCompletedTurnId.current = completedTurnId;
    activeTurnId.current = "";
    window.clearTimeout(completionTimer.current);
    completionTimer.current = window.setTimeout(() => {
      completionTimer.current = 0;
      void refresh(false, completedTurnId);
    }, COMPLETION_REFRESH_DELAY_MS);
  }, [executionStatus.active, executionStatus.phase, executionStatus.turnId, refresh]);

  useEffect(() => () => {
    window.clearTimeout(completionTimer.current);
    requestController.current?.abort();
  }, []);

  return { snapshot, loading, error, refresh };
}
