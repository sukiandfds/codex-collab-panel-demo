import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGroupRoomStore } from "../server/group-room-store.mjs";
import { createGroupRoutes } from "../server/routes/group-routes.mjs";

test("retries the same group message without enqueueing a second discussion", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-route-"));
  const room = await createGroupRoomStore({
    stateFile: path.join(directory, "group-room.json"),
    project: "negus",
    broadcast: () => {},
  });
  let enqueueCount = 0;
  const route = createGroupRoutes({
    groupRoom: room,
    media: { resolveMany: () => [] },
    multiAgent: {
      enqueueDiscussion: async ({ agentIds }) => {
        enqueueCount += 1;
        return { jobId: "job-1", agentIds, status: "queued" };
      },
    },
    webOutputs: { isRequest: () => false },
  });
  const server = http.createServer(async (request, response) => {
    const handled = await route(request, response, new URL(request.url, "http://127.0.0.1"));
    if (!handled) {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await room.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const { port } = server.address();
  const body = {
    memberId: "member-1",
    authorName: "Hans",
    clientMessageId: "client-message-1",
    agentIds: ["manager"],
    text: "请分析当前问题",
    attachmentIds: [],
  };
  const send = () => fetch(`http://127.0.0.1:${port}/api/group/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const first = await (await send()).json();
  const retried = await (await send()).json();

  assert.equal(first.message.id, retried.message.id);
  assert.equal(retried.deduplicated, true);
  assert.equal(room.snapshot().messages.length, 1);
  assert.equal(enqueueCount, 1);
});

test("an explicit Agent mention is not replaced by the web-output shortcut", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-route-mention-"));
  const room = await createGroupRoomStore({
    stateFile: path.join(directory, "group-room.json"),
    project: "negus",
    broadcast: () => {},
  });
  let execution = null;
  const route = createGroupRoutes({
    groupRoom: room,
    media: { resolveMany: () => [] },
    multiAgent: {
      enqueueDiscussion: async (input) => {
        execution = input;
        return { jobId: "job-mention", agentIds: input.agentIds, status: "queued" };
      },
    },
    webOutputs: { isRequest: () => true },
  });
  const server = http.createServer(async (request, response) => {
    const handled = await route(request, response, new URL(request.url, "http://127.0.0.1"));
    if (!handled) {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await room.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/group/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memberId: "member-1",
      authorName: "Hans",
      clientMessageId: "client-mention-1",
      agentIds: ["manager"],
      text: "@审查 Agent 请生成一个网页并指出风险",
      attachmentIds: [],
    }),
  });

  const result = await response.json();
  assert.equal(response.status, 202);
  assert.deepEqual(result.message.targetAgentIds, ["reviewer"]);
  assert.deepEqual(execution.agentIds, ["reviewer"]);
  assert.deepEqual(execution.explicitAgentIds, ["reviewer"]);
});

test("ordinary file-creation wording does not activate the legacy web-output shortcut", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-route-default-output-"));
  const room = await createGroupRoomStore({ stateFile: path.join(directory, "group-room.json"), project: "negus", broadcast: () => {} });
  let execution = null;
  const route = createGroupRoutes({
    groupRoom: room,
    media: { resolveMany: () => [] },
    multiAgent: { enqueueDiscussion: async (input) => { execution = input; return { jobId: "job-default", agentIds: input.agentIds, status: "queued" }; } },
    webOutputs: { isRequest: () => true },
  });
  const server = http.createServer(async (request, response) => {
    if (!(await route(request, response, new URL(request.url, "http://127.0.0.1")))) { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await room.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/group/message`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId: "member-1", authorName: "Hans", clientMessageId: "client-default-1", text: "在单人聊天页面点击创建对话", attachmentIds: [] }),
  });

  assert.equal(response.status, 202);
  assert.deepEqual(execution.agentIds, ["manager"]);
  assert.equal("outputRequested" in execution, false);
});

test("interrupts only the selected group room", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-route-interrupt-"));
  const room = await createGroupRoomStore({ stateFile: path.join(directory, "group-room.json"), project: "negus", broadcast: () => {} });
  let interrupted = 0;
  const route = createGroupRoutes({
    groupRoom: room,
    media: { resolveMany: () => [] },
    multiAgent: { interruptDiscussion: async () => { interrupted += 1; return { status: "interrupting", interruptedAgentIds: ["manager"], cancelledDiscussionCount: 1 }; } },
    webOutputs: {},
  });
  const server = http.createServer(async (request, response) => {
    if (!(await route(request, response, new URL(request.url, "http://127.0.0.1")))) { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await room.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/group/interrupt`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: room.snapshot().room.id }),
  });
  const result = await response.json();

  assert.equal(response.status, 202);
  assert.equal(result.status, "interrupting");
  assert.equal(interrupted, 1);
});

test("a historical Agent alias routes to the registered employee", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-route-alias-"));
  const room = await createGroupRoomStore({ stateFile: path.join(directory, "group-room.json"), project: "negus", broadcast: () => {} });
  let execution = null;
  const route = createGroupRoutes({
    groupRoom: room,
    media: { resolveMany: () => [] },
    multiAgent: { enqueueDiscussion: async (input) => { execution = input; return { jobId: "job-alias", agentIds: input.agentIds, status: "queued" }; } },
    webOutputs: { isRequest: () => false },
  });
  const server = http.createServer(async (request, response) => {
    if (!(await route(request, response, new URL(request.url, "http://127.0.0.1")))) { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await room.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/group/message`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId: "member-1", authorName: "Hans", clientMessageId: "client-alias-1", agentIds: ["manager"], text: "@审查 请检查", attachmentIds: [] }),
  });
  const result = await response.json();
  assert.equal(response.status, 202);
  assert.deepEqual(result.message.targetAgentIds, ["reviewer"]);
  assert.deepEqual(execution.agentIds, ["reviewer"]);
});

test("reads a date page without running a discussion", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-history-route-"));
  const stateFile = path.join(directory, "group-room.json");
  await fs.writeFile(stateFile, JSON.stringify({ messages: [
    { id: "m1", sequence: 1, createdAt: "2026-08-10T01:00:00.000Z", authorId: "member-1", authorName: "Hans", text: "old" },
    { id: "m2", sequence: 2, createdAt: "2026-08-11T01:00:00.000Z", authorId: "member-1", authorName: "Hans", text: "selected" },
  ] }), "utf8");
  const room = await createGroupRoomStore({ stateFile, project: "negus", broadcast: () => {} });
  const route = createGroupRoutes({
    groupRoom: room,
    media: { resolveMany: () => [] },
    multiAgent: { enqueueDiscussion: async () => { throw new Error("should not run"); } },
    webOutputs: { isRequest: () => false },
  });
  const server = http.createServer(async (request, response) => {
    if (!(await route(request, response, new URL(request.url, "http://127.0.0.1")))) { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await room.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/group/messages?date=2026-08-11`);
  const page = await response.json();
  assert.equal(response.status, 200);
  assert.equal(page.found, true);
  assert.deepEqual(page.messages.map((message) => message.text), ["selected"]);
});
