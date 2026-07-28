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
      if (method === "thread/resume") return { thread, model: currentModel, modelProvider: "openai" };
      if (method === "thread/settings/update") {
        currentModel = params.model;
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
  assert.deepEqual(calls.map((call) => call.method), [
    "thread/read",
    "thread/resume",
    "thread/settings/update",
    "thread/resume",
  ]);
});
