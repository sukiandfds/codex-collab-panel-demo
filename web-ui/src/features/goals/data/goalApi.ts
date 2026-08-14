import { fetchJson, patchJson, postJson } from "../../../shared/api/http";
import type { Goal, GoalAction, GoalListResponse, GoalResponse, GoalRun, GoalTask } from "../model/types";

export const goalApi = {
  list: (signal?: AbortSignal) => fetchJson<GoalListResponse>("/api/goals", signal),
  get: (goalId: string, signal?: AbortSignal) => fetchJson<GoalResponse>(`/api/goals/${encodeURIComponent(goalId)}`, signal),
  create: (input: Partial<Goal> & { requestId?: string; timeoutMs?: number }, signal?: AbortSignal) => postJson<GoalResponse>("/api/goals", input, signal),
  update: (goalId: string, input: Partial<Goal> & { expectedVersion?: number; timeoutMs?: number }, signal?: AbortSignal) => patchJson<GoalResponse>(`/api/goals/${encodeURIComponent(goalId)}`, input, signal),
  action: (goalId: string, action: GoalAction, expectedVersion?: number, signal?: AbortSignal) => postJson<GoalResponse>(`/api/goals/${encodeURIComponent(goalId)}/action`, { action, expectedVersion }, signal),
  addTask: (goalId: string, input: Partial<GoalTask>, signal?: AbortSignal) => postJson<{ goal: Goal; task: GoalTask }>(`/api/goals/${encodeURIComponent(goalId)}/tasks`, input, signal),
  updateTask: (goalId: string, taskId: string, input: Partial<GoalTask> & { expectedVersion?: number }, signal?: AbortSignal) => patchJson<{ goal: Goal; task: GoalTask }>(`/api/goals/${encodeURIComponent(goalId)}/tasks/${encodeURIComponent(taskId)}`, input, signal),
  addRun: (goalId: string, taskId: string, input: Partial<GoalRun>, signal?: AbortSignal) => postJson<{ goal: Goal; run: GoalRun }>(`/api/goals/${encodeURIComponent(goalId)}/tasks/${encodeURIComponent(taskId)}/runs`, input, signal),
};
