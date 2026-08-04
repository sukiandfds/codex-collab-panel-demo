import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createConversationService } from "../server/conversation-service.mjs";
import { createConversationVersionStore } from "../server/conversation-version-store.mjs";

const session = (assistantText = "Done") => ({
  threadId: "thread-1",
  source: "codex",
  title: "Demo",
  updatedAt: "2026-08-04T00:00:00.000Z",
  messageCount: 2,
  latestUser: "Hello",
  latestAssistant: assistantText,
  messages: [
    { id: "user-1", role: "user", text: "Hello" },
    { id: "answer-1", role: "assistant", text: assistantText },
  ],
});

test("persists per-thread versions and returns only changed messages", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-conversation-version-"));
  const stateFile = path.join(root, "conversation-versions.json");
  try {
    const store = createConversationVersionStore({ stateFile });
    const first = await store.sync("thread-1", session());
    assert.equal(first.contentVersion, 1);
    assert.equal(first.messages.length, 2);

    const unchanged = await store.sync("thread-1", session(), {
      requestedVersion: 1,
      incremental: true,
    });
    assert.equal(unchanged.unchanged, true);
    assert.deepEqual(unchanged.upserts, []);
    assert.deepEqual(unchanged.deletes, []);

    const changed = await store.sync("thread-1", session("Updated"), {
      requestedVersion: 1,
      incremental: true,
    });
    assert.equal(changed.contentVersion, 2);
    assert.equal(changed.unchanged, false);
    assert.deepEqual(changed.upserts.map((message) => message.id), ["answer-1"]);
    assert.deepEqual(changed.deletes, []);
    await store.close();

    const restored = createConversationVersionStore({ stateFile });
    const afterRestart = await restored.sync("thread-1", session("Updated"), {
      requestedVersion: 2,
      incremental: true,
    });
    assert.equal(afterRestart.contentVersion, 2);
    assert.equal(afterRestart.unchanged, true);
    await restored.close();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("applies a cached content version through the conversation service", async () => {
  let current = session();
  const primary = {
    findSession: async () => current,
    close: () => {},
  };
  const fallback = {
    findSession: async () => { throw new Error("fallback should not be called"); },
    close: () => {},
  };
  const service = createConversationService({
    primary,
    fallback,
    contentVersionStore: createConversationVersionStore(),
  });

  const first = await service.findSession("thread-1", "all", { limit: 60 });
  const unchanged = await service.findSession("thread-1", "all", {
    limit: 60,
    contentVersion: first.contentVersion,
  });
  assert.equal(unchanged.unchanged, true);

  current = session("New answer");
  const delta = await service.findSession("thread-1", "all", {
    limit: 60,
    contentVersion: first.contentVersion,
  });
  assert.deepEqual(delta.upserts.map((message) => message.text), ["New answer"]);
  service.close();
});

test("returns a full snapshot when message identities reset across a source switch", async () => {
  const store = createConversationVersionStore();
  const first = await store.sync("thread-1", session());
  const switched = await store.sync("thread-1", {
    ...session("New answer"),
    messages: [
      { id: "fallback-user-1", role: "user", text: "Hello" },
      { id: "fallback-answer-1", role: "assistant", text: "New answer" },
    ],
  }, { requestedVersion: first.contentVersion, incremental: true });

  assert.equal(Array.isArray(switched.messages), true);
  assert.equal(switched.upserts, undefined);
  assert.equal(switched.contentVersion, 2);
  await store.close();
});
