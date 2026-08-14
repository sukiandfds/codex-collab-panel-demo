import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createGoalService } from "../server/goal-service.mjs";
import { createGoalStore } from "../server/goal-store.mjs";
import { createRequestHandler } from "../server/request-handler.mjs";

const createFixture = () => {
  const goals = createGoalService({ store: createGoalStore(), runtimeAdapter: { start: async () => ({ status: "running" }) } });
  const handler = createRequestHandler({
    token: "goal-token",
    project: "demo",
    projectRoot: "C:\\demo",
    device: { name: "test-device" },
    observerPort: 1,
    conversations: { listModels: async () => [], listSessions: async () => [] },
    execution: {},
    media: {},
    realtime: { broadcast: () => {} },
    submissions: {},
    contextManagement: {},
    groupRoom: { snapshot: () => ({ room: { id: "room" }, messages: [], agents: [], members: [] }) },
    multiAgent: {},
    artifacts: { list: () => [] },
    webOutputs: {},
    fushengUsage: { read: async () => ({}) },
    readWebVersion: async () => ({ buildId: "test" }),
    serveStatic: async (_url, response) => { response.writeHead(200); response.end("static"); },
    goals,
  });
  return { goals, handler };
};

const json = async (response) => response.json();

test("exposes protected Goal create, read, edit, and action routes", async () => {
  const { goals, handler } = createFixture();
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const request = (pathname, init = {}) => fetch(`${base}${pathname}${pathname.includes("?") ? "&" : "?"}token=goal-token`, init);
    const createdResponse = await request("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objective: "测试 Goal API", requestId: "route-request" }) });
    assert.equal(createdResponse.status, 201);
    const created = (await json(createdResponse)).goal;
    assert.equal(created.objective, "测试 Goal API");

    const list = await request("/api/goals");
    assert.equal(list.status, 200);
    assert.equal((await json(list)).goals.length, 1);

    const editedResponse = await request(`/api/goals/${encodeURIComponent(created.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: { source: "route-test" }, expectedVersion: created.version }) });
    assert.equal(editedResponse.status, 200);
    const edited = (await json(editedResponse)).goal;
    assert.equal(edited.objective, "测试 Goal API");
    assert.deepEqual(edited.context, { source: "route-test" });

    const pausedResponse = await request(`/api/goals/${encodeURIComponent(created.id)}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pause", expectedVersion: edited.version }) });
    assert.equal(pausedResponse.status, 202);
    assert.equal((await json(pausedResponse)).goal.status, "paused");

    const unauthorized = await fetch(`${base}/api/goals`);
    assert.equal(unauthorized.status, 401);
  } finally {
    await goals.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
