import assert from "node:assert/strict";
import test from "node:test";
import { createConversationService } from "../server/conversation-service.mjs";

const message = (blocks = [{ id: "text", type: "markdown", text: "Done" }]) => ({
  id: "answer",
  role: "assistant",
  text: "Done",
  blocks,
});

test("returns the primary session without reading the JSONL fallback", async () => {
  let fallbackCalls = 0;
  const primary = {
    findSession: async () => ({ threadId: "thread", messages: [message()] }),
    close: () => {},
  };
  const fallback = {
    findSession: async () => {
      fallbackCalls += 1;
      throw new Error("fallback should not be called");
    },
    close: () => {},
  };
  const service = createConversationService({ primary, fallback });

  const session = await service.findSession("thread");
  assert.equal(session.threadId, "thread");
  assert.equal(fallbackCalls, 0);
  service.close();
});

test("uses the JSONL fallback only when the app-server read fails", async () => {
  let fallbackCalls = 0;
  const primary = {
    findSession: async () => { throw new Error("app-server unavailable"); },
    close: () => {},
  };
  const fallback = {
    findSession: async () => {
      fallbackCalls += 1;
      return { threadId: "thread", messages: [message()] };
    },
    close: () => {},
  };
  const service = createConversationService({ primary, fallback });

  const session = await service.findSession("thread");
  assert.equal(session.threadId, "thread");
  assert.equal(fallbackCalls, 1);
  service.close();
});

test("preserves fallback media when the app-server read fails", async () => {
  const primary = {
    findSession: async () => { throw new Error("app-server unavailable"); },
    close: () => {},
  };
  const fallback = {
    findSession: async () => ({
      threadId: "thread",
      messages: [message([
        { id: "text", type: "markdown", text: "Done" },
        { id: "image", type: "image", source: "data:image/png;base64,AAAA" },
      ])],
    }),
    close: () => {},
  };
  const service = createConversationService({ primary, fallback });

  const session = await service.findSession("thread");
  assert.deepEqual(session.messages[0].blocks.map((block) => block.type), ["markdown", "image"]);
  service.close();
});

test("deduplicates identical in-flight session reads", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let primaryCalls = 0;
  const primary = {
    findSession: async () => {
      primaryCalls += 1;
      await gate;
      return { threadId: "thread", messages: [message()] };
    },
    close: () => {},
  };
  const fallback = {
    findSession: async () => { throw new Error("fallback should not be called"); },
    close: () => {},
  };
  const service = createConversationService({ primary, fallback });

  const first = service.findSession("thread", "all", { limit: 60 });
  const second = service.findSession("thread", "all", { limit: 60 });
  assert.strictEqual(first, second);
  assert.equal(primaryCalls, 1);
  release();
  await first;
  service.close();
});
