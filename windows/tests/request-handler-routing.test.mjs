import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createRequestHandler } from "../server/request-handler.mjs";

const createFixture = () => {
  const serveStatic = async (_url, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("static");
  };
  return createRequestHandler({
    token: "test-token",
    project: "demo",
    projectRoot: "C:\\demo",
    device: { name: "test-device" },
    observerPort: 1,
    conversations: {
      listModels: async () => [{ id: "model" }],
      listSessions: async () => [],
    },
    execution: {},
    media: {},
    realtime: {},
    contextManagement: {},
    groupRoom: { snapshot: () => ({ room: { id: "room" }, messages: [], agents: [], members: [] }) },
    multiAgent: {},
    artifacts: { list: () => [{ id: "artifact" }] },
    webOutputs: {},
    readWebVersion: async () => ({ buildId: "web-test", builtAt: "2026-07-28T00:00:00.000Z" }),
    serveStatic,
  });
};

const withServer = async (run) => {
  const server = http.createServer(createFixture());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("dispatches feature routes and preserves static fallback", async () => {
  await withServer(async (baseUrl) => {
    const request = (pathname) => fetch(`${baseUrl}${pathname}${pathname.includes("?") ? "&" : "?"}token=test-token`);
    assert.deepEqual(await (await request("/api/project")).json(), { name: "demo", root: "C:\\demo", mode: "interactive" });
    assert.deepEqual(await (await request("/api/models")).json(), [{ id: "model" }]);
    assert.equal((await (await request("/api/group/snapshot")).json()).room.id, "room");
    assert.deepEqual(await (await request("/api/artifacts")).json(), [{ id: "artifact" }]);
    assert.deepEqual(await (await request("/api/version")).json(), {
      buildId: "web-test",
      builtAt: "2026-07-28T00:00:00.000Z",
    });
    assert.equal(await (await request("/page")).text(), "static");
  });
});

test("keeps API routes protected after route extraction", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/project`);
    assert.equal(response.status, 401);
    assert.equal(await response.text(), "Unauthorized");
  });
});
