import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGroupRoomStore } from "../server/group-room-store.mjs";

test("deduplicates retried client messages and preserves message order", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-room-"));
  const stateFile = path.join(directory, "group-room.json");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const events = [];
  const room = await createGroupRoomStore({ stateFile, project: "negus", broadcast: (event) => events.push(event) });
  const first = await room.addMessageWithStatus({
    authorId: "member-1",
    authorName: "Hans",
    clientMessageId: "client-message-1",
    text: "第一条消息",
  });
  const retried = await room.addMessageWithStatus({
    authorId: "member-1",
    authorName: "Hans",
    clientMessageId: "client-message-1",
    text: "第一条消息",
  });
  const second = await room.addMessageWithStatus({
    authorId: "member-1",
    authorName: "Hans",
    clientMessageId: "client-message-2",
    text: "第二条消息",
  });

  assert.equal(first.created, true);
  assert.equal(retried.created, false);
  assert.equal(retried.message.id, first.message.id);
  assert.equal(second.message.sequence, first.message.sequence + 1);
  assert.equal(room.snapshot().messages.length, 2);
  assert.equal(events.filter((event) => event.type === "group_message_created").length, 2);
  await room.close();

  const restored = await createGroupRoomStore({ stateFile, project: "negus", broadcast: () => {} });
  assert.deepEqual(restored.snapshot().messages.map((message) => message.text), ["第一条消息", "第二条消息"]);
  assert.deepEqual(restored.snapshot().messages.map((message) => message.sequence), [1, 2]);
  await restored.close();
});

test("restores attachment-only group messages", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-attachment-"));
  const stateFile = path.join(directory, "group-room.json");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const room = await createGroupRoomStore({ stateFile, project: "negus", broadcast: () => {} });
  await room.addMessage({
    authorId: "member-1",
    authorName: "Hans",
    text: "",
    attachments: [{ id: "media-1", name: "example.png", mimeType: "image/png", url: "/api/media/media-1" }],
  });
  await room.close();

  const restored = await createGroupRoomStore({ stateFile, project: "negus", broadcast: () => {} });
  assert.equal(restored.snapshot().messages.length, 1);
  assert.equal(restored.snapshot().messages[0].attachments[0].id, "media-1");
  await restored.close();
});

test("deduplicates repeated agent completions by work id", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-work-"));
  const stateFile = path.join(directory, "group-room.json");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const events = [];
  const room = await createGroupRoomStore({ stateFile, project: "negus", broadcast: (event) => events.push(event) });
  const first = await room.addMessage({
    type: "agent",
    authorId: "developer",
    authorName: "Developer Agent",
    agentId: "developer",
    workId: "work-1",
    text: "最终结果",
  });
  const repeated = await room.addMessageWithStatus({
    type: "agent",
    authorId: "developer",
    authorName: "Developer Agent",
    agentId: "developer",
    workId: "work-1",
    text: "最终结果",
  });

  assert.equal(repeated.message.id, first.id);
  assert.equal(repeated.created, false);
  assert.equal(room.snapshot().messages.length, 1);
  assert.equal(events.filter((event) => event.type === "group_message_created").length, 1);
  await room.close();
});
