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

test("keeps full history and returns date and cursor pages", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-history-"));
  const stateFile = path.join(directory, "group-room.json");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(stateFile, JSON.stringify({
    messages: [
      { id: "m1", sequence: 1, createdAt: "2026-08-10T01:00:00.000Z", authorId: "member-1", authorName: "Hans", text: "first" },
      { id: "m2", sequence: 2, createdAt: "2026-08-11T01:00:00.000Z", authorId: "member-1", authorName: "Hans", text: "second" },
      { id: "m3", sequence: 3, createdAt: "2026-08-11T02:00:00.000Z", authorId: "member-1", authorName: "Hans", text: "third" },
      { id: "m4", sequence: 4, createdAt: "2026-08-12T01:00:00.000Z", authorId: "member-1", authorName: "Hans", text: "fourth" },
    ],
  }), "utf8");
  const restored = await createGroupRoomStore({ stateFile, project: "negus", broadcast: () => {} });
  const datePage = restored.getMessagePage({ date: "2026-08-11", limit: 2 });
  assert.equal(restored.snapshot().messages.length, 4);
  assert.deepEqual(datePage.messages.map((message) => message.text), ["second", "third"]);
  assert.equal(datePage.hasOlder, true);
  assert.equal(datePage.hasNewer, true);
  const olderPage = restored.getMessagePage({ beforeSequence: datePage.oldestSequence, limit: 2 });
  assert.deepEqual(olderPage.messages.map((message) => message.text), ["first"]);
  const newerPage = restored.getMessagePage({ afterSequence: datePage.newestSequence, limit: 2 });
  assert.deepEqual(newerPage.messages.map((message) => message.text), ["fourth"]);
  assert.equal(restored.getMessagePage({ date: "2026-08-13" }).found, false);
  await restored.addMessage({ authorId: "member-1", authorName: "Hans", text: "latest" });
  await restored.close();
  const reloaded = await createGroupRoomStore({ stateFile, project: "negus", broadcast: () => {} });
  assert.equal(reloaded.getMessagePage({ date: "2026-08-10" }).messages[0].text, "first");
  assert.equal(reloaded.snapshot().messages.at(-1).text, "latest");
  await reloaded.close();
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

test("exposes active Agent work in snapshots without persisting it across restart", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-active-work-"));
  const stateFile = path.join(directory, "group-room.json");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const room = await createGroupRoomStore({ stateFile, project: "negus", broadcast: () => {} });
  room.beginAgentWork({
    workId: "work-active-1",
    agentId: "developer",
    agentName: "开发 Agent",
    startedAt: "2026-08-10T01:02:03.000Z",
  });

  assert.deepEqual(room.snapshot().activeWorks, [{
    workId: "work-active-1",
    agentId: "developer",
    agentName: "开发 Agent",
    startedAt: "2026-08-10T01:02:03.000Z",
    phase: "working",
  }]);
  assert.equal(room.finishAgentWork("work-active-1"), true);
  assert.deepEqual(room.snapshot().activeWorks, []);

  room.beginAgentWork({ workId: "work-not-persisted", agentId: "developer" });
  await room.close();
  const restored = await createGroupRoomStore({ stateFile, project: "negus", broadcast: () => {} });
  assert.deepEqual(restored.snapshot().activeWorks, []);
  await restored.close();
});

test("adds a configured Grok employee to an existing group without changing saved agents", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-grok-"));
  const stateFile = path.join(directory, "group-room.json");
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(stateFile, JSON.stringify({
    agents: [{ id: "developer", modelProviderId: "current", model: "gpt-existing", threadId: "existing-thread" }],
  }), "utf8");

  const room = await createGroupRoomStore({
    stateFile,
    project: "negus",
    agentDefinitions: [
      { id: "developer", name: "Developer", modelProviderId: "current", model: "gpt-default" },
      { id: "grok", name: "Grok Assistant", modelProviderId: "fusheng-grok", model: "grok-4.6" },
    ],
  });

  assert.equal(room.getAgent("developer").threadId, "existing-thread");
  assert.equal(room.getAgent("developer").model, "gpt-existing");
  assert.equal(room.getAgent("grok").modelProviderId, "fusheng-grok");
  assert.equal(room.getAgent("grok").model, "grok-4.6");
  assert.equal(room.getAgent("grok").threadId, null);
  await room.close();
});
