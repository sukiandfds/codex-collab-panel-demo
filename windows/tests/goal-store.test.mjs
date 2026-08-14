import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGoalStore } from "../server/goal-store.mjs";

test("persists goals and preserves omitted fields during partial updates", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-goal-store-"));
  const stateFile = path.join(root, "goals.json");
  try {
    const store = createGoalStore({ stateFile });
    const goal = store.createGoal({
      title: "系统级 Goal",
      objective: "验证持续目标",
      constraints: ["不改旧入口"],
    });
    const updated = store.updateGoal(goal.id, { context: { source: "test" } }, { expectedVersion: 1 });
    assert.equal(updated.title, "系统级 Goal");
    assert.equal(updated.objective, "验证持续目标");
    assert.deepEqual(updated.constraints, ["不改旧入口"]);
    assert.deepEqual(updated.context, { source: "test" });
    await store.flush();
    await store.close();

    const restored = createGoalStore({ stateFile });
    assert.equal(restored.get(goal.id).title, "系统级 Goal");
    assert.equal(restored.get(goal.id).version, 2);
    assert.throws(() => restored.updateGoal(goal.id, { title: "冲突" }, { expectedVersion: 1 }), /版本已变化/u);
    await restored.close();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("keeps task and run records linked to the platform goal", () => {
  const store = createGoalStore();
  const goal = store.createGoal({ objective: "建立任务树" });
  const parent = store.createTask(goal.id, { title: "协调" });
  const child = store.createTask(goal.id, { title: "调研", parentTaskId: parent.id });
  const run = store.createRun(goal.id, child.id, { source: "test" });
  const snapshot = store.get(goal.id);
  assert.deepEqual(snapshot.tasks.find((task) => task.id === parent.id).childTaskIds, [child.id]);
  assert.deepEqual(snapshot.tasks.find((task) => task.id === child.id).runIds, [run.id]);
});
