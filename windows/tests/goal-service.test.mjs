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
