import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createEmployeeProjectDirectory } from "../server/employee-project-directory.mjs";
import { createEmployeeGrowthReviewer } from "../server/employee-growth-reviewer.mjs";
import { createEmployeeGrowthService } from "../server/employee-growth-service.mjs";
import { createEmployeeGrowthStore } from "../server/employee-growth-store.mjs";
import { createEmployeeProjectRegistry } from "../server/employee-project-registry.mjs";

const fixture = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-growth-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const registry = await createEmployeeProjectRegistry({
    stateFile: path.join(root, "employee-projects.json"),
    workspaceRoot: root,
  });
  const store = await createEmployeeGrowthStore({
    stateFile: path.join(root, "growth.json"),
    registry,
  });
  const growth = createEmployeeGrowthService({
    registry,
    store,
    reviewer: createEmployeeGrowthReviewer({
      review: async () => ({
        facts: [{ text: "fact" }],
        rules: [{ text: "rule" }],
        skills: [{ name: "safe skill", text: "skill" }],
      }),
    }),
    broadcast: () => {},
  });
  t.after(async () => {
    await store.close();
    await registry.close();
  });
  return { root, registry, store, growth };
};

test("registry provisions isolated context roots and keeps legacy developer bindings", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-registry-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateFile = path.join(root, "employee-projects.json");
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify({ employees: [{ id: "developer", mainThreadId: "old-thread", conversationId: "old-conversation" }] }));
  const registry = await createEmployeeProjectRegistry({ stateFile, workspaceRoot: root });
  t.after(() => registry.close());
  assert.deepEqual(registry.list().map((item) => item.id), ["manager", "researcher", "developer"]);
  assert.equal(registry.get("developer").mainThreadId, "old-thread");
  assert.equal(registry.get("developer").conversationId, "old-conversation");
  assert.notEqual(registry.get("manager").contextRoot, registry.get("developer").contextRoot);
});

test("growth stores facts immediately and keeps rules/skills pending until approval", async (t) => {
  const { root, registry, store, growth } = await fixture(t);
  const ready = await growth.reviewTask({ employeeId: "developer", turnId: "turn-1", taskText: "task", replyText: "reply" });
  assert.equal(ready.facts.length, 1);
  assert.equal(ready.proposals.length, 2);
  assert.equal(store.get("developer").proposals.every((item) => item.status === "pending"), true);
  const rule = ready.proposals.find((item) => item.kind === "rule");
  const first = await growth.decide("developer", rule.id, "approved", { requestId: "approve-1" });
  const second = await growth.decide("developer", rule.id, "approved", { requestId: "approve-1" });
  assert.equal(first.writeStatus, "written");
  assert.equal(second.status, "approved");
  const agents = await fs.readFile(path.join(registry.get("developer").contextRoot, "AGENTS.md"), "utf8");
  assert.match(agents, /NEGUS-MANAGED-EMPLOYEE-RULES:BEGIN/);
  const directory = createEmployeeProjectDirectory({
    project: "negus",
    projectRoot: root,
    registry,
    employeeRuntime: { getStatus: async () => ({ status: { phase: "idle", active: false } }) },
  });
  const listing = await directory.list();
  assert.equal(listing.projects.length, 4);
  assert.equal(listing.projects.filter((item) => item.kind === "employee").length, 3);
});

test("reviewer failures return a failed result without throwing", async (t) => {
  const { registry, store } = await fixture(t);
  const events = [];
  const growth = createEmployeeGrowthService({
    registry,
    store,
    reviewer: createEmployeeGrowthReviewer({ review: async () => { throw new Error("review unavailable"); } }),
    broadcast: (event) => events.push(event),
  });
  const result = await growth.reviewTask({ employeeId: "developer", turnId: "turn-failed" });
  assert.match(result.error, /review unavailable/);
  assert.equal(events.at(-1).type, "employee_growth_failed");
});
