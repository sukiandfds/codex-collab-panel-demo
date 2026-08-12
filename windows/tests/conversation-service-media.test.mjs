import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createConversationService } from "../server/conversation-service.mjs";
import { createImageGenerationRunStore } from "../server/image-generation/image-generation-run-store.mjs";

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

test("merges JSONL-only project sessions into a successful app-server list", async () => {
  const primary = {
    listSessions: async () => [{
      threadId: "native-thread",
      title: "Native",
      updatedAt: "2026-08-12T10:00:00.000Z",
      cwd: "D:\\main",
    }],
    close: () => {},
  };
  const fallback = {
    listSessions: async () => [{
      threadId: "native-thread",
      title: "Native from JSONL",
      updatedAt: "2026-08-12T09:00:00.000Z",
      cwd: "D:\\main",
    }, {
      threadId: "finance-thread",
      title: "完善税务报表",
      updatedAt: "2026-08-12T08:00:00.000Z",
      cwd: "D:\\finance",
    }],
    close: () => {},
  };
  const service = createConversationService({ primary, fallback });

  const sessions = await service.listSessions("all", false);
  assert.deepEqual(sessions.map((session) => session.threadId), ["native-thread", "finance-thread"]);
  assert.equal(sessions[0].title, "Native");
  assert.equal(sessions[1].cwd, "D:\\finance");
  service.close();
});

test("migrates a supplemental-only image conversation before sending its next message", async () => {
  const sends = [];
  const primary = {
    sendMessage: async (threadId, text, attachments) => {
      sends.push({ threadId, text, attachments });
      if (threadId === "legacy-thread") throw new Error("Thread not found: legacy-thread");
      return { turn: { id: "turn-new", status: "inProgress" } };
    },
    createSession: async () => ({ threadId: "real-thread" }),
    close: () => {},
  };
  const fallback = { close: () => {} };
  const migrated = [];
  const supplementalMessages = {
    migrationContext: async () => ({
      text: "Create the original image",
      attachments: [{ path: "C:\\images\\original.png", name: "original.png", mimeType: "image/png" }],
    }),
    markMigrated: async (...args) => { migrated.push(args); },
  };
  const service = createConversationService({ primary, fallback, supplementalMessages });

  const result = await service.sendMessage("legacy-thread", "Make it a night scene", []);

  assert.equal(result.threadId, "real-thread");
  assert.equal(result.migratedFromThreadId, "legacy-thread");
  assert.deepEqual(sends.map((entry) => entry.threadId), ["legacy-thread", "real-thread"]);
  assert.deepEqual(sends[1].attachments.map((attachment) => attachment.path), ["C:\\images\\original.png"]);
  assert.deepEqual(migrated, [["legacy-thread", "real-thread"]]);
  service.close();
});

test("keeps migrated legacy records readable but removes them from the active session list", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-legacy-image-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const output = path.join(root, "original.png");
  await fs.writeFile(output, Buffer.from([1, 2, 3]));
  const runStore = createImageGenerationRunStore({
    stateFile: path.join(root, "runs.json"),
    media: { register: () => ({ id: "media", name: "original.png", mimeType: "image/png", url: "/api/media/media" }) },
  });
  await runStore.create({
    runId: "legacy-run",
    turnId: "legacy-turn",
    threadId: "legacy-thread",
    submissionId: "legacy-submission",
    text: "Create the original image",
    attachments: [],
    intent: { operation: "generate", resolution: "1K", size: "1:1", n: 1 },
  });
  await runStore.complete("legacy-run", {
    outputs: [{ path: output, mimeType: "image/png", width: 1, height: 1 }],
  });

  const context = await runStore.migrationContext("legacy-thread");
  assert.deepEqual(context.attachments.map((attachment) => attachment.path), [output]);
  assert.equal((await runStore.listSessions()).length, 1);
  await runStore.markMigrated("legacy-thread", "real-thread");
  assert.equal((await runStore.listSessions()).length, 0);
  assert.equal((await runStore.list("legacy-thread")).length, 2);
  await runStore.close();
});
