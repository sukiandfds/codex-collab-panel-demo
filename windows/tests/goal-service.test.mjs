import assert from "node:assert/strict";
import test from "node:test";
import { createGoalService } from "../server/goal-service.mjs";
import { createGoalStore } from "../server/goal-store.mjs";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("runs the desktop-like lifecycle with idempotent creation", async () => {
  const store = createGoalStore();
  const calls = [];
  const service = createGoalService({
    store,
    runtimeAdapter: {
      start: async () => { calls.push("start"); return { status: "running", externalRef: "run-1" }; },
      pause: async () => { calls.push("pause"); },
      resume: async () => { calls.push("resume"); },
      stop: async ({ reason }) => { calls.push(`stop:${reason}`); },
    },
  });
  try {
    const first = await service.create({ objective: "持续完成一项系统任务", requestId: "request-1" }, { id: "manager", name: "运营管理" });
    const duplicate = await service.create({ objective: "不应重复创建", requestId: "request-1" });
    assert.equal(first.id, duplicate.id);
    assert.equal(service.get(first.id).status, "active");
    assert.deepEqual(calls, ["start"]);

    const paused = await service.pause(first.id, { id: "manager" }, first.version);
    assert.equal(paused.status, "paused");
    const resumed = await service.resume(first.id, { id: "manager" }, paused.version);
    assert.equal(resumed.status, "active");
    const cleared = await service.clear(first.id, { id: "manager" }, resumed.version);
    assert.equal(cleared.status, "cleared");
    assert.ok(calls.includes("pause"));
    assert.ok(calls.includes("resume"));
    assert.ok(calls.includes("stop:cleared"));
  } finally {
    await service.close();
  }
});

test("expires an active goal without a periodic checker", async () => {
  const store = createGoalStore();
  const service = createGoalService({ store, runtimeAdapter: { stop: async () => {} } });
  try {
    const goal = await service.create({ objective: "短时 Goal", timeoutMs: 20 });
    await wait(60);
    assert.equal(service.get(goal.id).status, "expired");
  } finally {
    await service.close();
  }
});

test("keeps the persisted status unchanged when a runtime action fails", async () => {
  const store = createGoalStore();
  const service = createGoalService({
    store,
    runtimeAdapter: {
      start: async () => ({ status: "running", externalRef: "turn-action" }),
      pause: async () => { throw new Error("runtime pause failed"); },
    },
  });
  try {
    const goal = await service.create({ objective: "verify runtime-first status changes" });
    await assert.rejects(() => service.pause(goal.id, {}, goal.version), /runtime pause failed/u);
    const unchanged = service.get(goal.id);
    assert.equal(unchanged.status, "active");
    assert.equal(unchanged.tasks[0].status, "running");
    assert.equal(unchanged.runs[0].status, "running");
  } finally {
    await service.close();
  }
});

test("writes an exact runtime completion back to the Goal, Task, and Run", async () => {
  const store = createGoalStore();
  const service = createGoalService({
    store,
    runtimeAdapter: { start: async () => ({ status: "running", externalRef: "turn-goal" }) },
  });
  try {
    const goal = await service.create({ objective: "verify completion writeback", ownerId: "manager" });
    assert.deepEqual(await service.handleRuntimeEvent({ employeeId: "manager", turnId: "other-turn", status: "completed" }), []);
    assert.equal(service.get(goal.id).status, "active");

    const [completed] = await service.handleRuntimeEvent({ employeeId: "manager", turnId: "turn-goal", status: "completed" });
    assert.equal(completed.status, "completed");
    assert.equal(completed.tasks[0].status, "completed");
    assert.equal(completed.runs[0].status, "completed");
    assert.equal(completed.runtime.externalRef, "turn-goal");
  } finally {
    await service.close();
  }
});

test("rejects direct patches to Task and Run relationship fields", async () => {
  const store = createGoalStore();
  const service = createGoalService({ store, runtimeAdapter: { start: async () => ({ externalRef: "turn-relations" }) } });
  try {
    const goal = await service.create({ objective: "protect Goal relationships" });
    assert.throws(
      () => service.updateTask(goal.id, goal.tasks[0].id, { parentTaskId: "missing", runIds: ["forged"] }),
      /relationship|关系/u,
    );
    assert.throws(
      () => service.updateRun(goal.id, goal.runs[0].id, { taskId: "missing" }),
      /relationship|关系/u,
    );
    const unchanged = service.get(goal.id);
    assert.equal(unchanged.tasks[0].parentTaskId, null);
    assert.deepEqual(unchanged.tasks[0].runIds, [goal.runs[0].id]);
    assert.equal(unchanged.runs[0].taskId, goal.tasks[0].id);
  } finally {
    await service.close();
  }
});

test("recovers stale idempotency mappings after terminal Goal eviction", async () => {
  const store = createGoalStore();
  const service = createGoalService({ store, runtimeAdapter: { start: async () => ({ status: "running" }), stop: async () => ({}) } });
  try {
    const first = await service.create({ objective: "first", requestId: "request-0" });
    await service.complete(first.id, {}, first.version);
    const second = await service.create({ objective: "second", requestId: "request-1" });
    await service.complete(second.id, {}, second.version);
    for (let index = 2; index <= 200; index += 1) {
      await service.create({ objective: `goal ${index}`, requestId: `request-${index}` });
    }
    assert.equal(store.get(first.id), null);
    const retried = await service.create({ objective: "first retried", requestId: "request-0" });
    assert.ok(retried?.id);
    assert.notEqual(retried.id, first.id);
    assert.equal(service.list().length, 200);
  } finally {
    await service.close();
  }
});

test("records a failed timeout when the runtime cannot be stopped", async () => {
  const store = createGoalStore();
  const service = createGoalService({
    store,
    runtimeAdapter: { stop: async () => { throw new Error("stop failed"); } },
  });
  try {
    const goal = await service.create({ objective: "timeout stop failure", timeoutMs: 20 });
    await wait(60);
    const failed = service.get(goal.id);
    assert.equal(failed.status, "failed");
    assert.match(failed.runtime.detail, /stop failed/u);
  } finally {
    await service.close();
  }
});
