import assert from "node:assert/strict";
import test from "node:test";
import { createAppServerConversationStore } from "../server/app-server-conversation-store.mjs";

test("creates a persisted project thread and exposes the real model catalog", async () => {
  const calls = [];
  const client = {
    subscribe: () => () => {},
    close: () => {},
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") return {
        thread: {
          id: "thread-new",
          cwd: "D:\\project",
          source: "appServer",
          name: "",
          updatedAt: 100,
        },
      };
      if (method === "model/list" && !params.cursor) return {
        data: [{
          id: "gpt-5.6-sol",
          model: "gpt-5.6-sol",
          displayName: "GPT-5.6 Sol",
          description: "Frontier",
          isDefault: true,
          supportedReasoningEfforts: [],
        }],
        nextCursor: "page-2",
      };
      if (method === "model/list") return {
        data: [{
          id: "gpt-5.6-terra",
          model: "gpt-5.6-terra",
          displayName: "GPT-5.6 Terra",
          description: "Balanced",
          isDefault: false,
          supportedReasoningEfforts: [],
        }],
        nextCursor: null,
      };
      throw new Error(`Unexpected request: ${method}`);
    },
  };
  const store = createAppServerConversationStore({
    projectRoot: "D:\\project",
    registerMedia: () => null,
    client,
  });

  const session = await store.createSession("gpt-5.6-sol");
  const models = await store.listModels();

  assert.equal(session.threadId, "thread-new");
  assert.deepEqual(models.map((entry) => entry.model), ["gpt-5.6-sol", "gpt-5.6-terra"]);
  assert.deepEqual(calls[0], {
    method: "thread/start",
    params: { cwd: "D:\\project", model: "gpt-5.6-sol" },
  });
  assert.equal(calls.filter((call) => call.method === "model/list").length, 2);
});

test("updates a fresh thread before its first turn without trying to resume it", async () => {
  const calls = [];
  const thread = {
    id: "thread-new",
    cwd: "D:\\project",
    source: "appServer",
    name: "",
    updatedAt: 100,
  };
  const client = {
    subscribe: () => () => {},
    close: () => {},
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/start") return {
        thread,
        model: "gpt-5.6-sol",
        modelProvider: "openai",
        reasoningEffort: "medium",
      };
      if (method === "thread/settings/update") return {};
      throw new Error(`Unexpected request: ${method}`);
    },
  };
  const store = createAppServerConversationStore({
    projectRoot: "D:\\project",
    registerMedia: () => null,
    client,
  });

  await store.createSession("gpt-5.6-sol");
  const modelResult = await store.updateModel("thread-new", "gpt-5.6-terra");
  const effortResult = await store.updateReasoningEffort("thread-new", "high");

  assert.equal(modelResult.model, "gpt-5.6-terra");
  assert.equal(modelResult.reasoningEffort, "medium");
  assert.equal(effortResult.model, "gpt-5.6-terra");
  assert.equal(effortResult.reasoningEffort, "high");
  assert.deepEqual(calls.map((call) => call.method), [
    "thread/start",
    "thread/settings/update",
    "thread/settings/update",
  ]);
});

test("updates the model only after resuming the selected project thread", async () => {
  const calls = [];
  let currentModel = "gpt-5.6-sol";
  let currentReasoningEffort = "medium";
  const thread = {
    id: "thread-1",
    cwd: "D:\\project",
    source: "appServer",
    name: "Test",
    updatedAt: 100,
  };
  const client = {
    subscribe: () => () => {},
    close: () => {},
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/read") return { thread };
      if (method === "thread/resume") return {
        thread,
        model: currentModel,
        modelProvider: "openai",
        reasoningEffort: currentReasoningEffort,
      };
      if (method === "thread/settings/update") {
        if (params.model) currentModel = params.model;
        if (params.effort) currentReasoningEffort = params.effort;
        return {};
      }
      throw new Error(`Unexpected request: ${method}`);
    },
  };
  const store = createAppServerConversationStore({
    projectRoot: "D:\\project",
    registerMedia: () => null,
    client,
  });

  const result = await store.updateModel("thread-1", "gpt-5.6-terra");

  assert.equal(result.model, "gpt-5.6-terra");
  assert.equal(result.reasoningEffort, "medium");
  assert.deepEqual(calls.map((call) => call.method), [
    "thread/read",
    "thread/resume",
    "thread/settings/update",
    "thread/resume",
  ]);

  const effortResult = await store.updateReasoningEffort("thread-1", "high");
  assert.equal(effortResult.reasoningEffort, "high");
  assert.deepEqual(calls.at(-2), {
    method: "thread/settings/update",
    params: { threadId: "thread-1", effort: "high" },
  });
});

test("reads the authoritative status from the service-owned app-server", async () => {
  const client = {
    subscribe: () => () => {},
    close: () => {},
    request: async (method, params) => {
      assert.equal(method, "thread/read");
      assert.deepEqual(params, { threadId: "thread-1", includeTurns: false });
      return { thread: { id: "thread-1", status: { type: "idle" } } };
    },
  };
  const store = createAppServerConversationStore({
    projectRoot: "D:\\project",
    registerMedia: () => null,
    client,
  });

  assert.deepEqual(await store.getThreadStatus("thread-1"), { type: "idle" });
});

test("maps turn timestamps onto user and assistant messages", async () => {
  const client = {
    subscribe: () => () => {},
    close: () => {},
    request: async (method) => {
      assert.equal(method, "thread/read");
      return {
        thread: {
          id: "thread-1",
          cwd: "D:\\project",
          source: "appServer",
          name: "Timestamp test",
          updatedAt: 130,
          turns: [{
            id: "turn-1",
            startedAt: 100,
            completedAt: 130,
            items: [
              { type: "userMessage", id: "user-1", content: [{ type: "text", text: "Hello" }] },
              { type: "agentMessage", id: "answer-1", phase: "final_answer", text: "Done" },
            ],
          }],
        },
      };
    },
  };
  const store = createAppServerConversationStore({
    projectRoot: "D:\\project",
    registerMedia: () => null,
    client,
  });

  const session = await store.findSession("thread-1");
  assert.deepEqual(session.messages.map((message) => message.createdAt), [
    "1970-01-01T00:01:40.000Z",
    "1970-01-01T00:02:10.000Z",
  ]);
  assert.deepEqual(session.messages.map((message) => message.turnId), ["turn-1", "turn-1"]);
});

test("forks, archives, and restores a project thread through app-server actions", async () => {
  const calls = [];
  const sourceThread = {
    id: "thread-source",
    cwd: "D:\\project",
    source: "appServer",
    name: "Source",
    updatedAt: 100,
    path: "D:\\codex\\sessions\\source.jsonl",
  };
  const forkedThread = {
    ...sourceThread,
    id: "thread-forked",
    name: "Source fork",
    forkedFromId: sourceThread.id,
    updatedAt: 110,
  };
  const client = {
    subscribe: () => () => {},
    close: () => {},
    request: async (method, params) => {
      calls.push({ method, params });
      if (method === "thread/read") return { thread: sourceThread };
      if (method === "thread/fork") return { thread: forkedThread };
      if (method === "thread/archive") return {};
      if (method === "thread/unarchive") return { thread: sourceThread };
      throw new Error(`Unexpected request: ${method}`);
    },
  };
  const store = createAppServerConversationStore({
    projectRoot: "D:\\project",
    registerMedia: () => null,
    client,
  });

  const forked = await store.forkSession("thread-source", "turn-1");
  assert.equal(forked.threadId, "thread-forked");
  assert.equal(forked.forkedFromId, "thread-source");
  assert.deepEqual(calls[1], {
    method: "thread/fork",
    params: { threadId: "thread-source", lastTurnId: "turn-1", cwd: "D:\\project" },
  });

  assert.deepEqual(await store.archiveSession("thread-source"), { threadId: "thread-source", archived: true });
  assert.deepEqual(await store.unarchiveSession("thread-source"), {
    threadId: "thread-source",
    source: "codex",
    title: "Source",
    updatedAt: "1970-01-01T00:01:40.000Z",
    messageCount: null,
    latestUser: "",
    latestAssistant: "",
    archived: false,
    forkedFromId: null,
  });
  assert.deepEqual(calls.slice(-2).map((call) => call.method), ["thread/archive", "thread/unarchive"]);
  store.close();
});

test("supervises an active turn without depending on a browser request", async () => {
  let protocolListener = () => {};
  const healthEvents = [];
  const probeCalls = [];
  const client = {
    subscribe: (listener) => {
      protocolListener = listener;
      return () => {};
    },
    subscribeHealth: () => () => {},
    close: () => {},
    probe: async (method, params, options) => {
      probeCalls.push({ method, params, options });
      return { thread: { id: "thread-1", status: { type: "idle" } } };
    },
    request: async () => { throw new Error("Unexpected request"); },
  };
  const store = createAppServerConversationStore({
    projectRoot: "D:\\project",
    registerMedia: () => null,
    client,
    onHealthState: (event) => healthEvents.push(event),
    supervision: {
      intervalMs: 5,
      staleAfterMs: 20,
      finalizingAfterMs: 5,
      retryAfterMs: 5,
    },
  });

  protocolListener({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  });
  protocolListener({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      item: { id: "answer-1", type: "agentMessage", phase: "final_answer", text: "Done" },
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  store.close();

  assert.equal(probeCalls.length, 1);
  assert.deepEqual(probeCalls[0], {
    method: "thread/read",
    params: { threadId: "thread-1", includeTurns: false },
    options: { timeoutMs: 5000, threadId: "thread-1" },
  });
  assert.equal(healthEvents.some((event) => event.phase === "authoritative" && event.status.type === "idle"), true);
});
