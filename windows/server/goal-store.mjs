import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const GOAL_STORE_VERSION = 1;
export const GOAL_STATUSES = new Set(["active", "paused", "waiting", "completed", "cleared", "expired", "failed"]);
export const TASK_STATUSES = new Set(["pending", "running", "paused", "waiting", "completed", "blocked", "failed", "canceled", "expired"]);
export const RUN_STATUSES = new Set(["pending", "running", "paused", "waiting", "completed", "failed", "canceled", "expired", "interrupted"]);

const MAX_GOALS = 200;
const MAX_TASKS_PER_GOAL = 500;
const MAX_RUNS_PER_GOAL = 1000;
const MAX_EVENTS_PER_GOAL = 1000;
const TERMINAL_GOAL_STATUSES = new Set(["completed", "cleared", "expired", "failed"]);

const clone = (value) => JSON.parse(JSON.stringify(value));
const clean = (value, limit = 240) => String(value || "").trim().slice(0, limit);
const cleanList = (value, limit = 20, itemLimit = 400) => (
  Array.isArray(value)
    ? [...new Set(value.map((item) => clean(item, itemLimit)).filter(Boolean))].slice(0, limit)
    : []
);
const nowIso = () => new Date().toISOString();
const definedOnly = (value) => Object.fromEntries(
  Object.entries(value || {}).filter(([, item]) => item !== undefined),
);

const normalizeContext = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries([
    ["projectId", clean(value.projectId, 160)],
    ["roomId", clean(value.roomId, 160)],
    ["threadId", clean(value.threadId, 160)],
    ["conversationId", clean(value.conversationId, 160)],
    ["source", clean(value.source, 120)],
  ].filter(([, item]) => item));
};

const normalizeTask = (goalId, task = {}, index = 0) => {
  const status = TASK_STATUSES.has(task.status) ? task.status : "pending";
  const createdAt = clean(task.createdAt, 80) || nowIso();
  return {
    id: clean(task.id, 160) || `task-${randomUUID()}`,
    goalId,
    parentTaskId: clean(task.parentTaskId, 160) || null,
    title: clean(task.title, 240) || `任务 ${index + 1}`,
    objective: clean(task.objective, 32000),
    assigneeId: clean(task.assigneeId, 160),
    assigneeName: clean(task.assigneeName, 160),
    status,
    detail: clean(task.detail, 2000),
    result: clean(task.result, 12000),
    evidence: cleanList(task.evidence, 30, 500),
    runIds: cleanList(task.runIds, 100, 160),
    childTaskIds: cleanList(task.childTaskIds, 100, 160),
    version: Number.isSafeInteger(task.version) && task.version > 0 ? task.version : 1,
    createdAt,
    updatedAt: clean(task.updatedAt, 80) || createdAt,
    completedAt: clean(task.completedAt, 80),
    error: clean(task.error, 2000),
  };
};

const normalizeRun = (goalId, run = {}, index = 0) => {
  const status = RUN_STATUSES.has(run.status) ? run.status : "pending";
  const createdAt = clean(run.createdAt, 80) || nowIso();
  return {
    id: clean(run.id, 160) || `run-${randomUUID()}`,
    goalId,
    taskId: clean(run.taskId, 160),
    attempt: Number.isSafeInteger(run.attempt) && run.attempt > 0 ? run.attempt : index + 1,
    status,
    source: clean(run.source, 160),
    externalRef: clean(run.externalRef, 240),
    detail: clean(run.detail, 2000),
    createdAt,
    updatedAt: clean(run.updatedAt, 80) || createdAt,
    startedAt: clean(run.startedAt, 80),
    endedAt: clean(run.endedAt, 80),
    error: clean(run.error, 2000),
  };
};

const normalizeEvent = (goalId, event = {}, index = 0) => ({
  id: clean(event.id, 160) || `goal-event-${randomUUID()}`,
  goalId,
  type: clean(event.type, 120) || "updated",
  goalVersion: Number.isSafeInteger(event.goalVersion) && event.goalVersion > 0 ? event.goalVersion : 1,
  actorId: clean(event.actorId, 160),
  actorName: clean(event.actorName, 160),
  data: event.data && typeof event.data === "object" ? clone(event.data) : {},
  createdAt: clean(event.createdAt, 80) || nowIso(),
  sequence: Number.isSafeInteger(event.sequence) && event.sequence > 0 ? event.sequence : index + 1,
});

const normalizeGoal = (goal = {}) => {
  const createdAt = clean(goal.createdAt, 80) || nowIso();
  const id = clean(goal.id, 160) || `goal-${randomUUID()}`;
  const tasks = Array.isArray(goal.tasks)
    ? goal.tasks.slice(-MAX_TASKS_PER_GOAL).map((task, index) => normalizeTask(id, task, index))
    : [];
  const runs = Array.isArray(goal.runs)
    ? goal.runs.slice(-MAX_RUNS_PER_GOAL).map((run, index) => normalizeRun(id, run, index))
    : [];
  const events = Array.isArray(goal.events)
    ? goal.events.slice(-MAX_EVENTS_PER_GOAL).map((event, index) => normalizeEvent(id, event, index))
    : [];
  return {
    id,
    title: clean(goal.title, 240) || "未命名 Goal",
    objective: clean(goal.objective, 32000),
    constraints: cleanList(goal.constraints, 30, 1000),
    successCriteria: cleanList(goal.successCriteria, 30, 1000),
    stopConditions: cleanList(goal.stopConditions, 30, 1000),
    ownerId: clean(goal.ownerId, 160) || "manager",
    ownerName: clean(goal.ownerName, 160) || "运营管理",
    status: GOAL_STATUSES.has(goal.status) ? goal.status : "active",
    version: Number.isSafeInteger(goal.version) && goal.version > 0 ? goal.version : 1,
    context: normalizeContext(goal.context),
    timeoutAt: clean(goal.timeoutAt, 80),
    createdAt,
    updatedAt: clean(goal.updatedAt, 80) || createdAt,
    startedAt: clean(goal.startedAt, 80) || createdAt,
    endedAt: clean(goal.endedAt, 80),
    tasks,
    runs,
    events,
    runtime: goal.runtime && typeof goal.runtime === "object" ? {
      status: clean(goal.runtime.status, 80),
      externalRef: clean(goal.runtime.externalRef, 240),
      detail: clean(goal.runtime.detail, 2000),
      updatedAt: clean(goal.runtime.updatedAt, 80),
    } : {
      status: "pending",
      externalRef: "",
      detail: "",
      updatedAt: "",
    },
  };
};

export const createGoalStore = ({ stateFile = "" } = {}) => {
  const goals = new Map();
  let persistTimer;
  let persistChain = Promise.resolve();

  try {
    if (stateFile && fs.existsSync(stateFile)) {
      const stored = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      const entries = Array.isArray(stored?.goals) ? stored.goals : [];
      entries.slice(-MAX_GOALS).forEach((goal) => {
        const normalized = normalizeGoal(goal);
        goals.set(normalized.id, normalized);
      });
    }
  } catch {
    // A malformed Goal snapshot must not prevent the service from starting.
  }

  const snapshot = () => ({
    version: GOAL_STORE_VERSION,
    goals: [...goals.values()].slice(-MAX_GOALS),
  });

  const persist = () => {
    if (!stateFile) return Promise.resolve();
    const payload = `${JSON.stringify(snapshot(), null, 2)}\n`;
    persistChain = persistChain.catch(() => {}).then(async () => {
      await fsp.mkdir(path.dirname(stateFile), { recursive: true });
      const temporary = `${stateFile}.${process.pid}.tmp`;
      await fsp.writeFile(temporary, payload, "utf8");
      await fsp.rename(temporary, stateFile);
    }).catch((error) => console.warn(`[goal-store] state persistence failed: ${error.message}`));
    return persistChain;
  };

  const schedulePersist = () => {
    if (!stateFile) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void persist(), 100);
    persistTimer.unref?.();
  };

  const getMutable = (goalId) => goals.get(clean(goalId, 160)) || null;
  const get = (goalId) => {
    const goal = getMutable(goalId);
    return goal ? clone(goal) : null;
  };
  const list = ({ status = "" } = {}) => [...goals.values()]
    .filter((goal) => !status || goal.status === status)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(clone);

  const updateGoal = (goalId, changes = {}, { expectedVersion } = {}) => {
    const current = getMutable(goalId);
    if (!current) return null;
    if (expectedVersion !== undefined && Number(expectedVersion) !== current.version) {
      throw Object.assign(new Error("Goal 版本已变化，请刷新后重试"), { statusCode: 409 });
    }
    const next = normalizeGoal({
      ...current,
      ...definedOnly(changes),
      id: current.id,
      version: current.version + 1,
      updatedAt: nowIso(),
    });
    goals.set(current.id, next);
    schedulePersist();
    return clone(next);
  };

  const touchGoal = (goalId) => {
    const current = getMutable(goalId);
    if (!current) return null;
    current.updatedAt = nowIso();
    goals.set(current.id, current);
    schedulePersist();
    return clone(current);
  };

  const createGoal = (input = {}) => {
    while (goals.size >= MAX_GOALS) {
      const removable = [...goals.values()]
        .filter((goal) => TERMINAL_GOAL_STATUSES.has(goal.status))
        .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))[0];
      if (!removable) {
        throw Object.assign(new Error("运行中的 Goal 数量已达到上限，请先结束现有 Goal"), { statusCode: 413 });
      }
      goals.delete(removable.id);
    }
    const createdAt = nowIso();
    const goal = normalizeGoal({
      ...input,
      id: `goal-${randomUUID()}`,
      status: "active",
      version: 1,
      createdAt,
      startedAt: createdAt,
      updatedAt: createdAt,
      endedAt: "",
      tasks: [],
      runs: [],
      events: [],
    });
    goals.set(goal.id, goal);
    schedulePersist();
    return clone(goal);
  };

  const appendEvent = (goalId, event = {}) => {
    const goal = getMutable(goalId);
    if (!goal) return null;
    const nextEvent = normalizeEvent(goal.id, {
      ...event,
      id: `goal-event-${randomUUID()}`,
      goalVersion: goal.version,
      sequence: goal.events.length + 1,
      createdAt: nowIso(),
    }, goal.events.length);
    goal.events = [...goal.events, nextEvent].slice(-MAX_EVENTS_PER_GOAL);
    goal.updatedAt = nextEvent.createdAt;
    schedulePersist();
    return clone(nextEvent);
  };

  const createTask = (goalId, input = {}) => {
    const goal = getMutable(goalId);
    if (!goal) return null;
    if (goal.tasks.length >= MAX_TASKS_PER_GOAL) {
      throw Object.assign(new Error("Goal 任务数量已达到上限"), { statusCode: 413 });
    }
    const task = normalizeTask(goal.id, { ...input, id: `task-${randomUUID()}` }, goal.tasks.length);
    goal.tasks.push(task);
    if (task.parentTaskId) {
      const parent = goal.tasks.find((item) => item.id === task.parentTaskId);
      if (parent && !parent.childTaskIds.includes(task.id)) parent.childTaskIds.push(task.id);
    }
    goal.updatedAt = nowIso();
    schedulePersist();
    return clone(task);
  };

  const updateTask = (goalId, taskId, changes = {}, { expectedVersion } = {}) => {
    const goal = getMutable(goalId);
    const task = goal?.tasks.find((item) => item.id === clean(taskId, 160));
    if (!task) return null;
    if (expectedVersion !== undefined && Number(expectedVersion) !== task.version) {
      throw Object.assign(new Error("任务版本已变化，请刷新后重试"), { statusCode: 409 });
    }
    const next = normalizeTask(goal.id, {
      ...task,
      ...definedOnly(changes),
      id: task.id,
      version: task.version + 1,
      updatedAt: nowIso(),
    }, goal.tasks.indexOf(task));
    goal.tasks = goal.tasks.map((item) => item.id === task.id ? next : item);
    goal.updatedAt = next.updatedAt;
    schedulePersist();
    return clone(next);
  };

  const createRun = (goalId, taskId, input = {}) => {
    const goal = getMutable(goalId);
    const task = goal?.tasks.find((item) => item.id === clean(taskId, 160));
    if (!goal || !task) return null;
    if (goal.runs.length >= MAX_RUNS_PER_GOAL) {
      throw Object.assign(new Error("Goal 执行次数已达到上限"), { statusCode: 413 });
    }
    const run = normalizeRun(goal.id, {
      ...input,
      id: `run-${randomUUID()}`,
      taskId: task.id,
      attempt: task.runIds.length + 1,
    }, goal.runs.length);
    goal.runs.push(run);
    task.runIds.push(run.id);
    task.updatedAt = run.createdAt;
    goal.updatedAt = run.createdAt;
    schedulePersist();
    return clone(run);
  };

  const updateRun = (goalId, runId, changes = {}) => {
    const goal = getMutable(goalId);
    const run = goal?.runs.find((item) => item.id === clean(runId, 160));
    if (!run) return null;
    const next = normalizeRun(goal.id, {
      ...run,
      ...definedOnly(changes),
      id: run.id,
      updatedAt: nowIso(),
    }, goal.runs.indexOf(run));
    goal.runs = goal.runs.map((item) => item.id === run.id ? next : item);
    goal.updatedAt = next.updatedAt;
    schedulePersist();
    return clone(next);
  };

  const close = async () => {
    clearTimeout(persistTimer);
    await persist();
  };

  return {
    get,
    list,
    createGoal,
    updateGoal,
    touchGoal,
    appendEvent,
    createTask,
    updateTask,
    createRun,
    updateRun,
    snapshot: () => clone(snapshot()),
    flush: persist,
    close,
  };
};
