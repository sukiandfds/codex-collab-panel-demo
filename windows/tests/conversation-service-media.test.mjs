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

test("merges persistent image generation messages into the recent conversation window", async () => {
  const primary = {
    findSession: async () => ({
      threadId: "thread",
      messages: [{ ...message(), createdAt: "2026-08-04T08:00:00.000Z" }],
      latestAssistant: "Done",
      latestUser: "",
      updatedAt: "2026-08-04T08:00:00.000Z",
      hasMore: false,
    }),
    close: () => {},
  };
  const fallback = { findSession: async () => null, close: () => {} };
  const supplementalMessages = {
    list: async () => [{
      id: "image-assistant",
      role: "assistant",
      text: "Negus Image 已生成 1 张图片。",
      blocks: [{ id: "image", type: "image", source: "/api/media/image" }],
      createdAt: "2026-08-04T09:00:00.000Z",
    }],
  };
  const service = createConversationService({ primary, fallback, supplementalMessages });

  const session = await service.findSession("thread");
  assert.deepEqual(session.messages.map((entry) => entry.id), ["answer", "image-assistant"]);
  assert.equal(session.latestAssistant, "Negus Image 已生成 1 张图片。");
  assert.equal(session.messageCount, 2);
  service.close();
});

test("returns a supplemental-only session before a fresh Codex thread has native messages", async () => {
  const primary = {
    findSession: async () => { throw new Error("fresh thread has no persisted turns"); },
    close: () => {},
  };
  const fallback = { findSession: async () => null, close: () => {} };
  const supplementalMessages = {
    list: async () => [{
      id: "image-user",
      role: "user",
      text: "Generate an image",
      blocks: [{ id: "text", type: "markdown", text: "Generate an image" }],
      createdAt: "2026-08-04T09:00:00.000Z",
    }, {
      id: "image-assistant",
      role: "assistant",
      text: "Negus Image completed",
      blocks: [{ id: "image", type: "image", source: "/api/media/image" }],
      createdAt: "2026-08-04T09:01:00.000Z",
    }],
  };
  const service = createConversationService({ primary, fallback, supplementalMessages });

  const session = await service.findSession("thread", "all", { limit: 60 });
  assert.equal(session.threadId, "thread");
  assert.equal(session.title, "Generate an image");
  assert.deepEqual(session.messages.map((entry) => entry.id), ["image-user", "image-assistant"]);
  assert.equal(session.messageCount, 2);
  assert.equal(session.hasMore, false);
  service.close();
});

test("lists supplemental-only image sessions after the native empty thread disappears", async () => {
  const primary = {
    listSessions: async () => [{
      threadId: "native-thread",
      source: "codex",
      title: "Native thread",
      updatedAt: "2026-08-04T08:00:00.000Z",
      messageCount: null,
      latestUser: "",
      latestAssistant: "",
    }],
    close: () => {},
  };
  const fallback = { listSessions: async () => [], close: () => {} };
  const supplementalMessages = {
    listSessions: async () => [{
      threadId: "image-thread",
      source: "codex",
      title: "Generate an image",
      updatedAt: "2026-08-04T09:00:00.000Z",
      messageCount: 2,
      latestUser: "Generate an image",
      latestAssistant: "Negus Image completed",
      archived: false,
      forkedFromId: null,
    }],
  };
  const service = createConversationService({ primary, fallback, supplementalMessages });

  const sessions = await service.listSessions("all", false);
  assert.deepEqual(sessions.map((session) => session.threadId), ["image-thread", "native-thread"]);
  assert.equal(sessions[0].messageCount, 2);
  service.close();
});
