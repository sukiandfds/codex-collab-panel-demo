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
        if (params.reasoningEffort) currentReasoningEffort = params.reasoningEffort;
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
    params: { threadId: "thread-1", reasoningEffort: "high" },
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
