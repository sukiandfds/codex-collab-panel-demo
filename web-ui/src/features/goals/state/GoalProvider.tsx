import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { hasAccessToken, withAccessToken } from "../../../shared/api/http";
import { goalApi } from "../data/goalApi";
import type { Goal, GoalAction, GoalEventPayload } from "../model/types";

interface GoalContextValue {
  goals: Goal[];
  selectedGoal: Goal | null;
  selectedGoalId: string;
  loading: boolean;
  busy: boolean;
  connected: boolean;
  error: string;
  setSelectedGoalId: (goalId: string) => void;
  refresh: () => Promise<void>;
  create: (objective: string) => Promise<Goal>;
  update: (goalId: string, objective: string) => Promise<Goal>;
  action: (goalId: string, nextAction: GoalAction) => Promise<Goal>;
}

const GoalContext = createContext<GoalContextValue | null>(null);
const visibleStatuses = new Set<Goal["status"]>(["active", "paused", "waiting", "completed", "expired", "failed"]);
const actionableStatuses = new Set<Goal["status"]>(["active", "paused", "waiting"]);

const sortGoals = (items: Goal[]) => [...items]
  .filter((goal) => visibleStatuses.has(goal.status))
  .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const mergeGoal = (current: Goal[], incoming: Goal) => {
  const existing = current.find((goal) => goal.id === incoming.id);
  if (existing && incoming.version < existing.version) return current;
  if (existing && incoming.version === existing.version && incoming.updatedAt < existing.updatedAt) return current;
  return sortGoals(existing
    ? current.map((goal) => goal.id === incoming.id ? incoming : goal)
    : [...current, incoming]);
};

export function GoalProvider({ children }: PropsWithChildren) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState("");
  const selectedGoalIdRef = useRef(selectedGoalId);
  useEffect(() => { selectedGoalIdRef.current = selectedGoalId; }, [selectedGoalId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await goalApi.list();
      const sorted = sortGoals(response.goals);
      setGoals(sorted);
      const selectedStillExists = selectedGoalIdRef.current
        && sorted.some((goal) => goal.id === selectedGoalIdRef.current);
      if (!selectedStillExists) {
        const actionable = sorted.filter((goal) => actionableStatuses.has(goal.status));
        setSelectedGoalId(actionable.length === 1 ? actionable[0].id : "");
      }
      setConnected(true);
      setError("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const unavailable = /项目会话不存在|数据服务暂不可用|Failed to fetch|NetworkError/iu.test(message);
      setConnected(!unavailable);
      setError(unavailable ? "" : message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!hasAccessToken) return;
    const source = new EventSource(withAccessToken("/events"));
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as GoalEventPayload;
        if (payload.goal && ["goal_created", "goal_updated", "goal_event", "goal_task_updated", "goal_run_updated"].includes(payload.type || "")) {
          setGoals((current) => mergeGoal(current, payload.goal as Goal));
        }
      } catch {
        // Other realtime domains share this stream.
      }
    };
    return () => source.close();
  }, []);

  const run = useCallback(async (operation: () => Promise<GoalResponseLike>) => {
    setBusy(true);
    try {
      const response = await operation();
      const goal = response.goal;
      setGoals((current) => mergeGoal(current, goal));
      setSelectedGoalId(goal.id);
      setError("");
      return goal;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      throw cause instanceof Error ? cause : new Error(message);
    } finally {
      setBusy(false);
    }
  }, []);

  const create = useCallback((objective: string) => run(() => goalApi.create({
    objective,
    title: objective.trim().slice(0, 80),
    requestId: `ui:${Date.now()}:${Math.random().toString(16).slice(2)}`,
  })), [run]);
  const update = useCallback((goalId: string, objective: string) => {
    const current = goals.find((goal) => goal.id === goalId);
    return run(() => goalApi.update(goalId, { objective, expectedVersion: current?.version }));
  }, [goals, run]);
  const action = useCallback((goalId: string, nextAction: GoalAction) => {
    const current = goals.find((goal) => goal.id === goalId);
    return run(() => goalApi.action(goalId, nextAction, current?.version));
  }, [goals, run]);

  const selectedGoal = useMemo(() => goals.find((goal) => goal.id === selectedGoalId) || null, [goals, selectedGoalId]);

  const value = useMemo<GoalContextValue>(() => ({
    goals,
    selectedGoal,
    selectedGoalId: selectedGoal?.id || "",
    loading,
    busy,
    connected,
    error,
    setSelectedGoalId,
    refresh,
    create,
    update,
    action,
  }), [action, busy, connected, create, error, goals, loading, refresh, selectedGoal, update]);

  return <GoalContext.Provider value={value}>{children}</GoalContext.Provider>;
}

interface GoalResponseLike { goal: Goal; }

export const useGoals = () => {
  const context = useContext(GoalContext);
  if (!context) throw new Error("useGoals must be used inside GoalProvider");
  return context;
};
