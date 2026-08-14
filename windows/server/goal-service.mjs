import { GOAL_STATUSES, RUN_STATUSES, TASK_STATUSES } from "./goal-store.mjs";

const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CREATE_REQUESTS = 1000;
const terminalGoalStatuses = new Set(["completed", "cleared", "expired", "failed"]);
const terminalTaskStatuses = new Set(["completed", "failed", "canceled", "expired"]);
const terminalRunStatuses = new Set(["completed", "failed", "canceled", "expired", "interrupted"]);
const taskPatchFields = ["title", "objective", "assigneeId", "assigneeName", "status", "detail", "result", "evidence", "completedAt", "error"];
const runPatchFields = ["status", "source", "externalRef", "detail", "startedAt", "endedAt", "error"];
const protectedTaskFields = ["id", "goalId", "parentTaskId", "childTaskIds", "runIds", "version"];
const protectedRunFields = ["id", "goalId", "taskId", "attempt"];

const clean = (value, limit = 240) => String(value || "").trim().slice(0, limit);
const statusError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const pickDefined = (source, fields) => Object.fromEntries(
  fields.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]),
);
const clampTimeout = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.round(parsed), MAX_TIMEOUT_MS);
};

export const createGoalService = ({ store, broadcast = () => {}, runtimeAdapter = {} } = {}) => {
  if (!store) throw new Error("Goal store is required");
  const timers = new Map();
  const createRequests = new Map();
  const pendingActions = new Map();
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

  const runtimeState = (goal, nextStatus, result = {}, fallbackDetail = "") => ({
    status: nextStatus === "active" ? clean(result?.status, 80) || "running" : nextStatus,
    externalRef: clean(result?.externalRef || result?.jobId || result?.turnId, 240) || goal.runtime?.externalRef || "",
    detail: result?.detail !== undefined
      ? clean(result.detail, 2000)
      : clean(fallbackDetail || goal.runtime?.detail, 2000),
    updatedAt: new Date().toISOString(),
  });

  const activeRun = (goal, externalRef = "") => {
    const reference = clean(externalRef || goal.runtime?.externalRef, 240);
    return [...goal.runs].reverse().find((run) => reference && run.externalRef === reference)
      || [...goal.runs].reverse().find((run) => !terminalRunStatuses.has(run.status))
      || null;
  };

  const updateCurrentRecords = (goalId, nextStatus, { externalRef = "", detail = "", error = "" } = {}) => {
    const goal = store.get(goalId);
    if (!goal) return;
    const run = activeRun(goal, externalRef);
    const runStatus = {
      paused: "interrupted",
      waiting: "waiting",
      completed: "completed",
      cleared: "canceled",
      expired: "expired",
      failed: "failed",
    }[nextStatus];
    const taskStatus = {
      paused: "paused",
      waiting: "waiting",
      completed: "completed",
      cleared: "canceled",
      expired: "expired",
      failed: "failed",
    }[nextStatus];
    const endedAt = terminalGoalStatuses.has(nextStatus) || nextStatus === "paused"
      ? new Date().toISOString()
      : "";
    if (run && runStatus) {
      store.updateRun(goalId, run.id, {
        status: runStatus,
        detail: clean(detail, 2000),
        error: clean(error, 2000),
        endedAt,
      });
    }
    const taskId = run?.taskId || goal.tasks.find((task) => !terminalTaskStatuses.has(task.status))?.id;
    const task = goal.tasks.find((item) => item.id === taskId);
    if (task && taskStatus) {
      store.updateTask(goalId, task.id, {
        status: taskStatus,
        detail: clean(detail || task.detail, 2000),
        error: clean(error, 2000),
        completedAt: terminalGoalStatuses.has(nextStatus) ? endedAt : "",
      });
    }
  };

  const startResumeRun = (goalId, runtime = {}) => {
    const goal = store.get(goalId);
    if (!goal) return null;
    const task = goal.tasks.find((item) => !terminalTaskStatuses.has(item.status)) || goal.tasks[0];
    if (!task) return null;
    store.updateTask(goalId, task.id, { status: "running", completedAt: "", error: "" });
    return store.createRun(goalId, task.id, {
      status: "running",
      source: "goal-resume",
      externalRef: clean(runtime?.externalRef || runtime?.jobId || runtime?.turnId, 240),
      detail: clean(runtime?.detail, 2000),
      startedAt: new Date().toISOString(),
    });
  };

  const finalizeRuntimeEvent = (goal, { status = "completed", turnId = "", error = "" } = {}) => {
    const nextStatus = status === "failed" ? "failed" : status === "interrupted" ? "paused" : "completed";
    const detail = error || (nextStatus === "completed" ? "Goal 对应运行已完成" : "Goal 对应运行已结束");
    clearTimer(goal.id);
    updateCurrentRecords(goal.id, nextStatus, { externalRef: turnId, detail, error });
    const current = store.get(goal.id);
    const next = store.updateGoal(goal.id, {
      status: nextStatus,
      endedAt: terminalGoalStatuses.has(nextStatus) ? new Date().toISOString() : "",
      runtime: runtimeState(current, nextStatus, { externalRef: turnId, detail }, detail),
    }, { expectedVersion: current.version });
    event(goal.id, `runtime_${nextStatus}`, { turnId, status, error });
    publish("goal_updated", next);
    return next;
  };

  const expire = async (goalId) => {
    const goal = store.get(goalId);
    if (!goal || terminalGoalStatuses.has(goal.status) || goal.status === "paused" || pendingActions.has(goalId)) return goal;
    clearTimer(goalId);
    pendingActions.set(goalId, "expired");
    try {
      if (goal.status !== "waiting") await runtimeAdapter.stop?.({ goal, reason: "timeout" });
      updateCurrentRecords(goalId, "expired", { detail: "Goal 已超时" });
      const current = store.get(goalId);
      const next = store.updateGoal(goalId, {
        status: "expired",
        endedAt: new Date().toISOString(),
        runtime: runtimeState(current, "expired", {}, "Goal 已超时"),
      }, { expectedVersion: current.version });
      event(goalId, "expired", { reason: "timeout" });
      publish("goal_updated", next);
      return next;
    } catch (error) {
      const message = `Goal 已超时，但停止运行失败：${String(error?.message || error)}`;
      updateCurrentRecords(goalId, "failed", { detail: message, error: message });
      const current = store.get(goalId);
      const failed = store.updateGoal(goalId, {
        status: "failed",
        endedAt: new Date().toISOString(),
        runtime: runtimeState(current, "failed", {}, message),
      }, { expectedVersion: current.version });
      event(goalId, "expiration_stop_failed", { reason: "timeout", error: message });
      publish("goal_updated", failed);
      return failed;
    } finally {
      pendingActions.delete(goalId);
    }
  };

  const scheduleTimeout = (goal) => {
    clearTimer(goal.id);
    if (!goal.timeoutAt || terminalGoalStatuses.has(goal.status) || goal.status === "paused") return;
    const delay = new Date(goal.timeoutAt).getTime() - Date.now();
    if (delay <= 0) {
      void expire(goal.id).catch((error) => console.warn(`[goal-service] expiration failed: ${error.message}`));
      return;
    }
    const timer = setTimeout(() => {
      void expire(goal.id).catch((error) => console.warn(`[goal-service] expiration failed: ${error.message}`));
    }, delay);
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
    if (requestId && createRequests.has(requestId)) {
      const existing = store.get(createRequests.get(requestId));
      if (existing) return existing;
      createRequests.delete(requestId);
    }
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
    if (requestId) {
      createRequests.set(requestId, goal.id);
      while (createRequests.size > MAX_CREATE_REQUESTS) createRequests.delete(createRequests.keys().next().value);
    }
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
    if (pendingActions.has(goalId)) throw statusError("Goal 正在处理上一项操作，请稍后重试", 409);

    clearTimer(goalId);
    pendingActions.set(goalId, nextStatus);
    try {
      let runtime = {};
      if (nextStatus === "paused" && current.status !== "waiting") {
        runtime = await runtimeAdapter.pause?.({ goal: current, reason: "user" }) || {};
      } else if (nextStatus === "active") {
        runtime = await runtimeAdapter.resume?.({ goal: current }) || {};
      } else if (nextStatus === "waiting" && current.status !== "paused") {
        runtime = await runtimeAdapter.pause?.({ goal: current, reason: "waiting" }) || {};
      } else if (terminalGoalStatuses.has(nextStatus)
        && !terminalGoalStatuses.has(current.status)
        && !["paused", "waiting"].includes(current.status)) {
        runtime = await runtimeAdapter.stop?.({ goal: current, reason: nextStatus }) || {};
      }

      if (nextStatus === "active") {
        startResumeRun(goalId, runtime);
      } else {
        updateCurrentRecords(goalId, nextStatus, {
          externalRef: current.runtime?.externalRef,
          detail: clean(runtime?.detail, 2000),
        });
      }
      const latest = get(goalId);
      if (latest.status !== current.status) throw statusError("Goal 状态已变化，请刷新后重试", 409);
      const next = store.updateGoal(goalId, {
        status: nextStatus,
        endedAt: terminalGoalStatuses.has(nextStatus) ? new Date().toISOString() : "",
        runtime: runtimeState(latest, nextStatus, runtime),
      }, { expectedVersion: latest.version });
      if (["active", "waiting"].includes(nextStatus)) scheduleTimeout(next);
      event(goalId, `status_${nextStatus}`, { previousStatus: current.status, status: nextStatus }, actor);
      publish("goal_updated", next);
      return next;
    } catch (error) {
      const latest = store.get(goalId);
      if (latest && !terminalGoalStatuses.has(latest.status) && latest.status !== "paused") scheduleTimeout(latest);
      event(goalId, "status_action_failed", {
        previousStatus: current.status,
        requestedStatus: nextStatus,
        error: String(error?.message || error),
      }, actor);
      throw error;
    } finally {
      pendingActions.delete(goalId);
    }
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
    const protectedFields = protectedTaskFields.filter((field) => changes[field] !== undefined);
    if (protectedFields.length) throw statusError(`任务关系字段不能直接修改：${protectedFields.join(", ")}`);
    if (changes.status !== undefined && !TASK_STATUSES.has(changes.status)) throw statusError("任务状态无效");
    const allowed = pickDefined(changes, taskPatchFields);
    const nextTask = store.updateTask(goalId, taskId, allowed, { expectedVersion: changes.expectedVersion });
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
    const protectedFields = protectedRunFields.filter((field) => changes[field] !== undefined);
    if (protectedFields.length) throw statusError(`运行关系字段不能直接修改：${protectedFields.join(", ")}`);
    if (changes.status !== undefined && !RUN_STATUSES.has(changes.status)) throw statusError("运行状态无效");
    const nextRun = store.updateRun(goalId, runId, pickDefined(changes, runPatchFields));
    const next = store.touchGoal(goalId);
    event(goalId, "run_updated", { taskId: nextRun.taskId, runId }, actor);
    publish("goal_run_updated", next, { run: nextRun });
    return { goal: next, run: nextRun };
  };

  const handleRuntimeEvent = async ({ employeeId = "", turnId = "", status = "completed", error = "" } = {}) => {
    const cleanTurnId = clean(turnId, 240);
    if (!cleanTurnId) return [];
    const matches = store.list().filter((goal) => (
      !terminalGoalStatuses.has(goal.status)
      && (!employeeId || goal.ownerId === clean(employeeId, 160))
      && goal.runtime?.externalRef === cleanTurnId
      && !pendingActions.has(goal.id)
    ));
    return matches.map((goal) => finalizeRuntimeEvent(goal, {
      status: clean(status, 80) || "completed",
      turnId: cleanTurnId,
      error: clean(error, 2000),
    }));
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
    handleRuntimeEvent,
    close,
  };
};
