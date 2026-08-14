import { GOAL_STATUSES, RUN_STATUSES, TASK_STATUSES } from "./goal-store.mjs";

const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
  const terminalGoalStatuses = new Set(["completed", "cleared", "expired", "failed"]);

const clean = (value, limit = 240) => String(value || "").trim().slice(0, limit);
const statusError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const clampTimeout = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.round(parsed), MAX_TIMEOUT_MS);
};

export const createGoalService = ({ store, broadcast = () => {}, runtimeAdapter = {} } = {}) => {
  if (!store) throw new Error("Goal store is required");
  const timers = new Map();
  const createRequests = new Map();
  let closed = false;

  const publish = (type, goal, extra = {}) => {
    if (!goal) return;
    broadcast({ type, goalId: goal.id, goalVersion: goal.version, goal, ...extra });
  };

  const event = (goalId, type, data = {}, actor = {}) => {
    const recorded = store.appendEvent(goalId, {
      type,
      data,
      actorId: clean(actor.id, 160),
      actorName: clean(actor.name, 160),
    });
    const goal = store.get(goalId);
    publish("goal_event", goal, { event: recorded });
    return recorded;
  };

  const clearTimer = (goalId) => {
    const timer = timers.get(goalId);
    if (timer) clearTimeout(timer);
    timers.delete(goalId);
  };

  const expire = async (goalId) => {
    const goal = store.get(goalId);
    if (!goal || terminalGoalStatuses.has(goal.status) || goal.status === "paused") return goal;
    const next = store.updateGoal(goalId, {
      status: "expired",
      endedAt: new Date().toISOString(),
      runtime: { ...goal.runtime, status: "expired", detail: "Goal 已超时", updatedAt: new Date().toISOString() },
    });
    clearTimer(goalId);
    event(goalId, "expired", { reason: "timeout" });
    publish("goal_updated", next);
    await runtimeAdapter.stop?.({ goal: next, reason: "timeout" });
    return next;
  };

  const scheduleTimeout = (goal) => {
    clearTimer(goal.id);
    if (!goal.timeoutAt || terminalGoalStatuses.has(goal.status) || goal.status === "paused") return;
    const delay = new Date(goal.timeoutAt).getTime() - Date.now();
    if (delay <= 0) {
      void expire(goal.id);
      return;
    }
    const timer = setTimeout(() => void expire(goal.id), delay);
    timer.unref?.();
    timers.set(goal.id, timer);
  };

  const validateGoal = (goal) => {
    if (!goal) throw statusError("Goal 不存在", 404);
    return goal;
  };

  const validateExpectedVersion = (goal, expectedVersion) => {
    if (expectedVersion !== undefined && Number(expectedVersion) !== goal.version) {
      throw statusError("Goal 版本已变化，请刷新后重试", 409);
    }
  };

  const create = async (input = {}, actor = {}) => {
    const objective = clean(input.objective, 32000);
    if (!objective) throw statusError("Goal 目标不能为空");
    const requestId = clean(input.requestId, 160);
    if (requestId && createRequests.has(requestId)) return store.get(createRequests.get(requestId));
    const timeoutMs = clampTimeout(input.timeoutMs);
    const timeoutAt = new Date(Date.now() + timeoutMs).toISOString();
    const goal = store.createGoal({
      ...input,
      title: clean(input.title, 240) || objective.slice(0, 80),
      objective,
      timeoutAt,
      ownerId: clean(input.ownerId, 160) || clean(actor.id, 160) || "manager",
      ownerName: clean(input.ownerName, 160) || clean(actor.name, 160) || "运营管理",
      runtime: { status: "starting", externalRef: "", detail: "正在连接运行适配器", updatedAt: new Date().toISOString() },
    });
    const task = store.createTask(goal.id, {
      title: "Goal 协调",
      objective,
      assigneeId: goal.ownerId,
      assigneeName: goal.ownerName,
      status: "running",
    });
    const run = store.createRun(goal.id, task.id, { status: "running", source: "goal-start", startedAt: new Date().toISOString() });
    const prepared = store.get(goal.id);
    if (requestId) createRequests.set(requestId, goal.id);
    event(goal.id, "created", { taskId: task.id, runId: run.id }, actor);
    publish("goal_created", prepared);
    try {
      const runtime = await runtimeAdapter.start?.({ goal: prepared, task, run });
      const current = store.get(goal.id);
      const next = store.updateGoal(goal.id, {
        runtime: {
          status: clean(runtime?.status, 80) || "running",
          externalRef: clean(runtime?.externalRef || runtime?.jobId, 240),
          detail: clean(runtime?.detail, 2000),
          updatedAt: new Date().toISOString(),
        },
      }, { expectedVersion: current?.version });
      store.updateRun(goal.id, run.id, { status: "running", externalRef: clean(runtime?.externalRef || runtime?.jobId, 240), detail: clean(runtime?.detail, 2000) });
      scheduleTimeout(next || store.get(goal.id));
      event(goal.id, "started", { runId: run.id, runtime: runtime || {} }, actor);
      publish("goal_updated", next || store.get(goal.id));
      return next || store.get(goal.id);
    } catch (error) {
      const current = store.get(goal.id);
      const failed = store.updateGoal(goal.id, {
        status: "failed",
        endedAt: new Date().toISOString(),
        runtime: { status: "failed", externalRef: "", detail: String(error?.message || error), updatedAt: new Date().toISOString() },
      }, { expectedVersion: current?.version });
      store.updateTask(goal.id, task.id, { status: "failed", error: String(error?.message || error) });
      store.updateRun(goal.id, run.id, { status: "failed", endedAt: new Date().toISOString(), error: String(error?.message || error) });
      clearTimer(goal.id);
      event(goal.id, "failed", { runId: run.id, error: String(error?.message || error) }, actor);
      publish("goal_updated", failed || store.get(goal.id));
      throw error;
    }
  };

  const list = (options) => store.list(options);
  const get = (goalId) => validateGoal(store.get(goalId));

  const update = async (goalId, changes = {}, actor = {}) => {
    const current = get(goalId);
    validateExpectedVersion(current, changes.expectedVersion);
    const allowed = {};
    if (changes.title !== undefined) allowed.title = clean(changes.title, 240);
    if (changes.objective !== undefined) {
      allowed.objective = clean(changes.objective, 32000);
      if (!allowed.objective) throw statusError("Goal 目标不能为空");
    }
    if (changes.constraints !== undefined) allowed.constraints = changes.constraints;
    if (changes.successCriteria !== undefined) allowed.successCriteria = changes.successCriteria;
    if (changes.stopConditions !== undefined) allowed.stopConditions = changes.stopConditions;
    if (changes.context !== undefined) allowed.context = changes.context;
    const nextTimeout = changes.timeoutMs === undefined ? current.timeoutAt : new Date(Date.now() + clampTimeout(changes.timeoutMs)).toISOString();
    const next = store.updateGoal(goalId, { ...allowed, timeoutAt: nextTimeout }, { expectedVersion: current.version });
    scheduleTimeout(next);
    event(goalId, "edited", { previousVersion: current.version, version: next.version }, actor);
    publish("goal_updated", next);
    return next;
  };

  const changeStatus = async (goalId, nextStatus, actor = {}, expectedVersion) => {
    const current = get(goalId);
    validateExpectedVersion(current, expectedVersion);
    if (!GOAL_STATUSES.has(nextStatus)) throw statusError("Goal 状态无效");
    if (terminalGoalStatuses.has(current.status) && current.status !== nextStatus && nextStatus !== "cleared") {
      throw statusError("已结束的 Goal 不能继续运行", 409);
    }
    if (current.status === nextStatus) return current;
    const endedAt = terminalGoalStatuses.has(nextStatus) ? new Date().toISOString() : "";
    const next = store.updateGoal(goalId, {
      status: nextStatus,
      endedAt,
      runtime: { ...current.runtime, status: nextStatus, updatedAt: new Date().toISOString() },
    }, { expectedVersion: current.version });
    if (nextStatus === "paused") {
      clearTimer(goalId);
      await runtimeAdapter.pause?.({ goal: next, reason: "user" });
    } else if (nextStatus === "active") {
      scheduleTimeout(next);
      await runtimeAdapter.resume?.({ goal: next });
    } else if (nextStatus === "waiting") {
      scheduleTimeout(next);
      await runtimeAdapter.pause?.({ goal: next, reason: "waiting" });
    } else if (terminalGoalStatuses.has(nextStatus)) {
      clearTimer(goalId);
      await runtimeAdapter.stop?.({ goal: next, reason: nextStatus });
    }
    event(goalId, `status_${nextStatus}`, { previousStatus: current.status, status: nextStatus }, actor);
    publish("goal_updated", next);
    return next;
  };

  const addTask = (goalId, input = {}, actor = {}) => {
    const goal = get(goalId);
    if (terminalGoalStatuses.has(goal.status)) throw statusError("已结束的 Goal 不能新增任务", 409);
    if (input.parentTaskId && !goal.tasks.some((task) => task.id === clean(input.parentTaskId, 160))) {
      throw statusError("父任务不存在", 404);
    }
    const task = store.createTask(goalId, input);
    const next = store.touchGoal(goalId);
    event(goalId, "task_created", { taskId: task.id, parentTaskId: task.parentTaskId }, actor);
    publish("goal_task_updated", next, { task });
    return { goal: next, task };
  };

  const updateTask = (goalId, taskId, changes = {}, actor = {}) => {
    const goal = get(goalId);
    const task = goal.tasks.find((item) => item.id === clean(taskId, 160));
    if (!task) throw statusError("任务不存在", 404);
    if (changes.status !== undefined && !TASK_STATUSES.has(changes.status)) throw statusError("任务状态无效");
    const nextTask = store.updateTask(goalId, taskId, changes, { expectedVersion: changes.expectedVersion });
    const next = store.touchGoal(goalId);
    event(goalId, "task_updated", { taskId, status: nextTask.status }, actor);
    publish("goal_task_updated", next, { task: nextTask });
    return { goal: next, task: nextTask };
  };

  const addRun = (goalId, taskId, input = {}, actor = {}) => {
    const goal = get(goalId);
    if (!goal.tasks.some((task) => task.id === clean(taskId, 160))) throw statusError("任务不存在", 404);
    if (input.status !== undefined && !RUN_STATUSES.has(input.status)) throw statusError("运行状态无效");
    const run = store.createRun(goalId, taskId, input);
    const next = store.touchGoal(goalId);
    event(goalId, "run_created", { taskId, runId: run.id }, actor);
    publish("goal_run_updated", next, { run });
    return { goal: next, run };
  };

  const updateRun = (goalId, runId, changes = {}, actor = {}) => {
    const goal = get(goalId);
    const run = goal.runs.find((item) => item.id === clean(runId, 160));
    if (!run) throw statusError("运行记录不存在", 404);
    if (changes.status !== undefined && !RUN_STATUSES.has(changes.status)) throw statusError("运行状态无效");
    const nextRun = store.updateRun(goalId, runId, changes);
    const next = store.touchGoal(goalId);
    event(goalId, "run_updated", { taskId: nextRun.taskId, runId }, actor);
    publish("goal_run_updated", next, { run: nextRun });
    return { goal: next, run: nextRun };
  };

  const close = async () => {
    closed = true;
    for (const goalId of timers.keys()) clearTimer(goalId);
    await store.close();
  };

  for (const goal of store.list()) {
    if (!closed && ["active", "waiting"].includes(goal.status) && goal.timeoutAt) scheduleTimeout(goal);
  }

  return {
    create,
    list,
    get,
    update,
    pause: (goalId, actor, expectedVersion) => changeStatus(goalId, "paused", actor, expectedVersion),
    resume: (goalId, actor, expectedVersion) => changeStatus(goalId, "active", actor, expectedVersion),
    wait: (goalId, actor, expectedVersion) => changeStatus(goalId, "waiting", actor, expectedVersion),
    complete: (goalId, actor, expectedVersion) => changeStatus(goalId, "completed", actor, expectedVersion),
    clear: (goalId, actor, expectedVersion) => changeStatus(goalId, "cleared", actor, expectedVersion),
    addTask,
    updateTask,
    addRun,
    updateRun,
    close,
  };
};
