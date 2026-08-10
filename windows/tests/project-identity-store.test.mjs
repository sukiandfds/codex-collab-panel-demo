import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProjectIdentityStore } from "../server/project-identity-store.mjs";
import { createEmployeeProjectDirectory } from "../server/employee-project-directory.mjs";

const employee = (root, patch = {}) => ({
  id: "developer",
  name: "Developer Director Agent",
  projectKey: "employee-developer",
  runtimeKind: "codex",
  projectRoot: root,
  contextRoot: path.join(root, "runtime", "employee-contexts", "developer"),
  mainThreadId: "thread-old",
  conversationId: "conversation-old",
  ...patch,
});

test("maps legacy employee records to stable project identities without changing legacy state", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-project-identity-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const legacyFile = path.join(root, "employee-projects.json");
  const legacyText = JSON.stringify({ version: 1, employees: [employee(root)] }, null, 2);
  await fs.writeFile(legacyFile, legacyText, "utf8");
  const registry = { list: () => [employee(root)] };
  const store = await createProjectIdentityStore({
    stateFile: path.join(root, "project-identities.json"),
    project: "negus",
    projectRoot: root,
    registry,
  });
  t.after(() => store.close());

  const records = store.list();
  assert.equal(records.length, 2);
  const worker = store.getForEmployee("developer");
  assert.equal(worker.projectId, "project:employee:employee-developer");
  assert.notEqual(worker.projectId, worker.conversation.runtimeSessionId);
  assert.deepEqual(worker.memberEmployeeIds, ["developer"]);
  assert.deepEqual(worker.agentIds, ["developer"]);
  assert.equal(worker.roots.context.endsWith("developer"), true);
  assert.equal(worker.capabilities.growth.source, "employee-growth-store");
  assert.equal(worker.capabilities.localHistory.enabled, true);
  assert.equal(await fs.readFile(legacyFile, "utf8"), legacyText);
});

test("keeps project extensions and main binding across restart", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-project-identity-reload-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateFile = path.join(root, "project-identities.json");
  const registry = { list: () => [employee(root)] };
  const first = await createProjectIdentityStore({ stateFile, project: "negus", projectRoot: root, registry });
  const bound = await first.bindMainConversation({
    employeeId: "developer",
    conversationId: "conversation-new",
    runtimeKind: "openclaw",
    runtimeSessionId: "runtime-session-new",
  });
  await first.close();
  const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
  const saved = state.projects.find((item) => item.projectId === bound.projectId);
  saved.memberEmployeeIds.push("another-agent");
  saved.agentIds.push("another-agent");
  saved.capabilities.customTool = { enabled: true, source: "future-runtime" };
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  const second = await createProjectIdentityStore({
    stateFile,
    project: "negus",
    projectRoot: root,
    registry: { list: () => [employee(root, { name: "Renamed Developer", mainThreadId: null, conversationId: null })] },
  });
  t.after(() => second.close());
  const restored = second.getForEmployee("developer");
  assert.equal(restored.projectId, bound.projectId);
  assert.equal(restored.name, "Renamed Developer");
  assert.deepEqual(restored.memberEmployeeIds, ["developer", "another-agent"]);
  assert.equal(restored.capabilities.customTool.source, "future-runtime");
  assert.equal(restored.conversation.runtimeKind, "openclaw");
  assert.equal(restored.conversation.role, "main");
});

test("directory exposes project identity metadata and conversation role", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-project-directory-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const registry = { list: () => [employee(root)] };
  const identity = await createProjectIdentityStore({
    stateFile: path.join(root, "project-identities.json"),
    project: "negus",
    projectRoot: root,
    registry,
  });
  t.after(() => identity.close());
  const directory = createEmployeeProjectDirectory({
    project: "negus",
    projectRoot: root,
    registry,
    projectIdentity: identity,
    employeeRuntime: { getStatus: async () => ({ status: { phase: "idle", active: false } }) },
    conversations: {
      findSession: async () => ({ updatedAt: "2026-08-10T10:00:00.000Z" }),
    },
  });
  const listing = await directory.list();
  const worker = listing.projects.find((item) => item.kind === "employee");
  assert.equal(worker.projectId, "project:employee:employee-developer");
  assert.equal(worker.provider, "codex");
  assert.equal(worker.capabilities.growth.source, "employee-growth-store");
  assert.equal(worker.conversations[0].role, "main");
  assert.equal(worker.conversations[0].projectId, worker.projectId);
  assert.equal(worker.lastActivityAt, "2026-08-10T10:00:00.000Z");
  assert.equal(listing.projects.find((item) => item.kind === "personal").projectId, "project:personal:negus");
});
