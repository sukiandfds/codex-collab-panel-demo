import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAgentPublicationRoutes } from "../server/routes/agent-publication-routes.mjs";
import { createStaticFileServer } from "../server/static-files.mjs";

const withServer = async (handler, run) => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("routes Agent conversation opening, target selection, and pure publication separately", async () => {
  const calls = [];
  const route = createAgentPublicationRoutes({
    conversationStore: {
      getShareTargets: async (query) => {
        calls.push({ type: "targets", query });
        return {
          conversationId: "conversation-1",
          agent: { id: "manager", name: "项目经理 Agent" },
          rooms: [{ id: "current-project", name: "negus 项目群" }],
        };
      },
    },
    publicationService: {
      publish: async (request) => {
        calls.push({ type: "publish", request });
        return { message: { id: "group-message-1", type: "agent" }, deduplicated: false };
      },
    },
    employeeRuntime: {
      open: async (agentId) => ({
        conversation: {
          id: "conversation-1",
          runtimeKind: "codex",
          threadId: agentId === "manager" ? "thread-1" : null,
        },
      }),
    },
  });

  await withServer(async (request, response) => {
    if (!await route(request, response, new URL(request.url, "http://127.0.0.1"))) {
      response.writeHead(404);
      response.end();
    }
  }, async (baseUrl) => {
    const targetsResponse = await fetch(`${baseUrl}/api/agent-share/targets?threadId=thread-1`);
    const targets = await targetsResponse.json();
    assert.equal(targetsResponse.status, 200);
    assert.equal(targets.rooms.length, 1);

    const openResponse = await fetch(`${baseUrl}/api/agent-conversations/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "manager" }),
    });
    const opened = await openResponse.json();
    assert.equal(openResponse.status, 201);
    assert.equal(opened.threadId, "thread-1");

    const publishResponse = await fetch(`${baseUrl}/api/agent-share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "share-1",
        conversationId: "conversation-1",
        messageId: "answer-1",
        roomId: "current-project",
      }),
    });
    assert.equal(publishResponse.status, 201);
    assert.equal((await publishResponse.json()).message.type, "agent");
  });

  assert.deepEqual(calls, [
    { type: "targets", query: { conversationId: "", threadId: "thread-1" } },
    {
      type: "publish",
      request: {
        requestId: "share-1",
        conversationId: "conversation-1",
        messageId: "answer-1",
        roomId: "current-project",
      },
    },
  ]);
});

test("serves Negus entrypoints without injecting a second share implementation", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-share-sidecar-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "index.html"), "<html><body><main>Negus</main></body></html>", "utf8");
  await fs.writeFile(path.join(root, "group.html"), "<html><body><main>Group</main></body></html>", "utf8");
  const serveStatic = createStaticFileServer(root);

  await withServer((request, response) => serveStatic(new URL(request.url, "http://127.0.0.1"), response), async (baseUrl) => {
    const main = await fetch(`${baseUrl}/`);
    const group = await fetch(`${baseUrl}/group.html`);
    assert.doesNotMatch(await main.text(), /negus-agent-share-bridge\.js/u);
    assert.doesNotMatch(await group.text(), /negus-agent-share-bridge\.js/u);
  });
});

test("returns an existing employee conversation without reopening its Runtime", async () => {
  let openCalls = 0;
  const route = createAgentPublicationRoutes({
    conversationStore: {},
    publicationService: {},
    employeeRuntime: {
      getStatus: async (agentId) => ({
        employee: { id: agentId },
        threadId: "employee-thread",
        conversationId: "employee-conversation",
      }),
      open: async () => {
        openCalls += 1;
        throw new Error("existing Runtime must not be reopened");
      },
    },
  });
  await withServer(async (request, response) => {
    await route(request, response, new URL(request.url, "http://127.0.0.1"));
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/agent-conversations/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "manager" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      conversationId: "employee-conversation",
      runtimeKind: "codex",
      threadId: "employee-thread",
    });
  });
  assert.equal(openCalls, 0);
});
