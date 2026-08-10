import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createEmployeeProjectRegistry } from "../server/employee-project-registry.mjs";
import { createEmployeeRuntimeService } from "../server/employee-runtime-service.mjs";

const fixture = async (t, { execution = null } = {}) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-employee-runtime-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const registry = await createEmployeeProjectRegistry({
    stateFile: path.join(root, "employee-projects.json"),
    workspaceRoot: "D:\\project",
  });
  let listener = () => {};
  const calls = [];
  const client = {
    subscribe(handler) { listener = handler; return () => {}; },
    close() {},
    async request(method, params) {
      calls.push({ method, params });
      if (method === "thread/start") return { thread: { id: "employee-thread" } };
      if (method === "thread/read") return { thread: { id: params.threadId, turns: [] } };
      if (method === "thread/resume") return { thread: { id: params.threadId } };
      if (method === "turn/start") return { turn: { id: "employee-turn", status: "inProgress" } };
      return {};
    },
  };
  const conversationStore = {
    async bindRuntime(value) {
      return { conversationId: value.conversationId || "employee-conversation", ...value };
    },
    async readMessages() { return []; },
    async recordRuntimeEvent() {},
  };
  const events = [];
  const runtime = createEmployeeRuntimeService({
    registry,
    conversationStore,
    projectRoot: "D:\\project",
    client,
    broadcast: (event) => events.push(event),
    execution,
  });
  t.after(async () => {
    runtime.close();
    await registry.close();
  });
  return { registry, client, conversationStore, runtime, events, calls, get listener() { return listener; } };
};

test("employee registry keeps identity state private from API-shaped values", async (t) => {
  const { registry } = await fixture(t);
  const employee = registry.get("developer");
  assert.equal(employee.id, "developer");
  assert.equal("instructions" in employee, false);
  assert.equal(registry.require("developer").instructions.includes("只能讨论"), true);
});

test("employee runtime binds one main thread and gates workspace writes", async (t) => {
  const { registry, runtime, events, calls, listener } = await fixture(t);
  const opened = await runtime.open("developer");
  assert.equal(opened.employee.modificationConfirmed, false);
  assert.equal(calls.find((call) => call.method === "thread/start").params.sandbox, "read-only");
  await runtime.sendMessage({ employeeId: "developer", text: "先讨论方案", requestId: "request-1" });
  assert.equal((events.find((event) => event.type === "employee_status")?.modificationConfirmed), false);
  listener({ method: "turn/completed", params: { threadId: "employee-thread", turn: { status: "completed" } } });
  await runtime.confirmModification("developer");
  assert.equal(calls.at(-1).method, "thread/resume");
  assert.equal(calls.at(-1).params.sandbox, "workspace-write");
  assert.equal(registry.get("developer").modificationConfirmed, true);
  assert.equal((await runtime.getStatus("developer")).modificationConfirmed, true);
});

test("employee runtime mirrors status and message progress to the shared conversation UI", async (t) => {
  const statuses = [];
  const threadEvents = [];
  const execution = {
    publishStatus: (threadId, status) => statuses.push({ threadId, ...status }),
    publishThreadEvent: (threadId, event) => threadEvents.push({ threadId, event }),
  };
  const { runtime, listener } = await fixture(t, { execution });

  await runtime.open("developer");
  await runtime.sendMessage({ employeeId: "developer", text: "inspect the project", requestId: "request-bridge" });
  listener({
    method: "item/agentMessage/delta",
    params: { threadId: "employee-thread", turnId: "employee-turn", itemId: "assistant-item", delta: "done" },
  });
  listener({
    method: "item/completed",
    params: {
      threadId: "employee-thread",
      turnId: "employee-turn",
      item: { id: "assistant-item", type: "agentMessage", phase: "final_answer", text: "done" },
    },
  });
  listener({ method: "turn/completed", params: { threadId: "employee-thread", turn: { id: "employee-turn", status: "completed" } } });

  assert.equal(statuses.some((event) => event.threadId === "employee-thread" && event.phase === "working" && event.active), true);
  assert.equal(statuses.at(-1).phase, "idle");
  assert.deepEqual(threadEvents[0], {
    threadId: "employee-thread",
    event: {
      type: "assistant_delta",
      threadId: "employee-thread",
      turnId: "employee-turn",
      itemId: "assistant-item",
      delta: "done",
    },
  });
  assert.deepEqual(threadEvents.at(-1), {
    threadId: "employee-thread",
    event: { type: "sessions_changed", threadId: "employee-thread" },
  });
});
