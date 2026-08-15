import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAgentConversationStore } from "../server/agent-conversation-store.mjs";
import { createAgentPublicationService } from "../server/agent-publication-service.mjs";
import { createGroupRoomStore } from "../server/group-room-store.mjs";
import { createPublicationStore } from "../server/publication-store.mjs";
import { createGroupRoomDirectory } from "../server/group-room-directory.mjs";

const fixture = async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-agent-publication-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, "group-room.json"), JSON.stringify({
    version: 3,
    agents: [{ id: "manager", threadId: "thread-manager" }],
    messages: [],
  }), "utf8");
  const events = [];
  const groupRoom = await createGroupRoomStore({
    stateFile: path.join(directory, "group-room.json"),
    project: "negus",
    broadcast: (event) => events.push(event),
  });
  const conversationStateFile = path.join(directory, "agent-conversations.json");
  const conversationStore = await createAgentConversationStore({
    stateFile: conversationStateFile,
    groupRoom,
    roomDirectory: createGroupRoomDirectory({ rooms: [groupRoom] }),
  });
  const publicationStore = await createPublicationStore({
    stateFile: path.join(directory, "agent-publications.json"),
  });
  const conversations = {
    findSession: async () => ({
      messages: [{ id: "answer-1", role: "assistant", text: "\n**原文 Markdown**\n", turnId: "turn-1" }],
    }),
  };
  const roomDirectory = createGroupRoomDirectory({ rooms: [groupRoom] });
  const service = createAgentPublicationService({
    conversationStore, conversations, groupRoom, roomDirectory, publicationStore,
  });
  t.after(async () => {
    await conversationStore.close();
    await publicationStore.close();
    await groupRoom.close();
  });
  return { service, conversationStore, conversationStateFile, groupRoom, roomDirectory, publicationStore, events };
};

test("publishes one Agent message without starting a discussion", async (t) => {
  const { service, conversationStore, groupRoom, events } = await fixture(t);
  const targets = await conversationStore.getShareTargets({ threadId: "thread-manager" });
  assert.equal(targets.agent.id, "manager");
  assert.equal(targets.rooms.length, 1);

  const request = {
    requestId: "share-1",
    conversationId: targets.conversationId,
    messageId: "answer-1",
    roomId: targets.rooms[0].id,
  };
  const first = await service.publish(request);
  const second = await service.publish(request);

  assert.equal(first.message.authorId, "manager");
  assert.equal(first.message.text, "\n**原文 Markdown**\n");
  assert.deepEqual(first.message.attachments, []);
  assert.deepEqual(first.message.artifactIds, []);
  assert.deepEqual(first.message.targetAgentIds, []);
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(groupRoom.snapshot().messages.length, 1);
  assert.equal(events.filter((event) => event.type === "group_message_created").length, 1);
});

test("reuses one stable group conversation binding", async (t) => {
  const { conversationStore, conversationStateFile } = await fixture(t);

  const first = await conversationStore.openGroupForAgent({
    agentId: "manager",
    roomId: "current-project",
    projectId: "project:employee:employee-manager",
    targetProjectId: "project:personal:negus",
    executionRoot: "D:\\projects\\negus",
    threadId: "thread-manager",
    title: "negus 项目群 · 运营管理",
  });
  const second = await conversationStore.openGroupForAgent({
    agentId: "manager",
    roomId: "current-project",
    projectId: "project:employee:employee-manager",
    targetProjectId: "project:personal:negus",
    executionRoot: "D:\\projects\\negus",
    threadId: "thread-manager",
    title: "negus 项目群 · 运营管理",
  });

  assert.equal(first.conversationId, "group:current-project:manager");
  assert.equal(second.conversationId, first.conversationId);
  assert.equal(second.projectId, "project:employee:employee-manager");
  assert.equal(second.targetProjectId, "project:personal:negus");
  assert.equal(second.executionRoot, "D:\\projects\\negus");
  await conversationStore.appendMessage({
    conversationId: first.conversationId,
    message: {
      id: "group:current-project:message-1",
      role: "user",
      text: "检查当前问题",
      authorId: "member-1",
      authorName: "Hans",
      sequence: 1,
      createdAt: "2026-08-15T00:00:00.000Z",
      source: "group",
      roomId: "current-project",
      groupMessageId: "message-1",
    },
  });
  const delivered = await conversationStore.readMessages(first.conversationId);
  assert.equal(delivered[0].authorName, "Hans");
  assert.equal(delivered[0].sequence, 1);
  assert.equal(delivered[0].groupMessageId, "message-1");
  const stored = JSON.parse(await fs.readFile(conversationStateFile, "utf8"));
  assert.equal(stored.bindings.length, 1);
});

test("publishes a locally persisted Agent reply when Runtime is unavailable", async (t) => {
  const { conversationStore, groupRoom, roomDirectory, publicationStore } = await fixture(t);
  const targets = await conversationStore.getShareTargets({ threadId: "thread-manager" });
  const localMessage = {
    id: "answer-local",
    role: "assistant",
    text: "\n**Local Markdown**\n",
    turnId: "turn-local",
    createdAt: new Date().toISOString(),
  };
  await conversationStore.appendMessage({
    conversationId: targets.conversationId,
    message: localMessage,
  });
  assert.equal((await conversationStore.readMessage(targets.conversationId, localMessage.id)).text, localMessage.text);

  const service = createAgentPublicationService({
    conversationStore,
    conversations: {
      findSession: async () => {
        throw new Error("Runtime unavailable");
      },
    },
    groupRoom,
    roomDirectory,
    publicationStore,
  });
  const result = await service.publish({
    requestId: "share-local",
    conversationId: targets.conversationId,
    messageId: localMessage.id,
    roomId: targets.rooms[0].id,
  });

  assert.equal(result.message.authorId, "manager");
  assert.equal(result.message.text, localMessage.text);
});

test("rejects a user message as a publication source", async (t) => {
  const { conversationStore, groupRoom, roomDirectory } = await fixture(t);
  const targets = await conversationStore.getShareTargets({ threadId: "thread-manager" });
  const conversations = {
    findSession: async () => ({ messages: [{ id: "user-1", role: "user", text: "用户消息", turnId: "turn-1" }] }),
  };
  const publication = createAgentPublicationService({
    conversationStore,
    conversations,
    groupRoom,
    roomDirectory,
    publicationStore: { get: () => null, set: async () => {} },
  });
  await assert.rejects(
    publication.publish({
      requestId: "share-user",
      conversationId: targets.conversationId,
      messageId: "user-1",
      roomId: targets.rooms[0].id,
    }),
    (error) => error.statusCode === 409,
  );
});

test("allows a later deliberate publication while rejecting request id reuse", async (t) => {
  const { service, conversationStore, groupRoom } = await fixture(t);
  const targets = await conversationStore.getShareTargets({ threadId: "thread-manager" });
  const base = {
    conversationId: targets.conversationId,
    messageId: "answer-1",
    roomId: targets.rooms[0].id,
  };

  await service.publish({ ...base, requestId: "share-first" });
  await service.publish({ ...base, requestId: "share-second" });
  assert.equal(groupRoom.snapshot().messages.length, 2);
  await assert.rejects(
    service.publish({ ...base, requestId: "share-first", messageId: "answer-other" }),
    (error) => error.statusCode === 409,
  );
});

test("rejects unfinished and oversized replies without truncating them", async (t) => {
  const { conversationStore, groupRoom, roomDirectory } = await fixture(t);
  const targets = await conversationStore.getShareTargets({ threadId: "thread-manager" });
  const publishFrom = (message, requestId) => createAgentPublicationService({
    conversationStore,
    conversations: { findSession: async () => ({ messages: [message] }) },
    groupRoom,
    roomDirectory,
    publicationStore: { get: () => null, set: async () => {} },
  }).publish({
    requestId,
    conversationId: targets.conversationId,
    messageId: message.id,
    roomId: targets.rooms[0].id,
  });

  await assert.rejects(
    publishFrom({ id: "unfinished", role: "assistant", text: "仍在生成" }, "share-unfinished"),
    (error) => error.statusCode === 409,
  );
  await assert.rejects(
    publishFrom({ id: "oversized", role: "assistant", text: "x".repeat(12001), turnId: "turn-long" }, "share-long"),
    (error) => error.statusCode === 413,
  );
  assert.equal(groupRoom.snapshot().messages.length, 0);
});

test("does not write legacy group Runtime events into Agent history", async (t) => {
  const { conversationStore } = await fixture(t);
  const legacy = await conversationStore.resolve({ threadId: "thread-manager" });
  const ignored = await conversationStore.recordRuntimeMessage("codex", "thread-manager", {
    id: "legacy-event",
    role: "assistant",
    text: "group context",
    turnId: "turn-group",
  });
  assert.equal(ignored, null);
  assert.deepEqual(await conversationStore.readMessages(legacy.conversationId), []);

  const direct = await conversationStore.bindRuntime({
    agentId: "manager",
    runtimeKind: "codex",
    runtimeSessionId: "thread-direct",
    conversationKind: "direct",
  });
  const recorded = await conversationStore.recordRuntimeMessage("codex", direct.runtimeSessionId, {
    id: "direct-event",
    role: "assistant",
    text: "direct response",
    turnId: "turn-direct",
  });
  assert.equal(recorded.id, "direct-event");
  assert.equal((await conversationStore.readMessage(direct.conversationId, "direct-event")).text, "direct response");
});

test("keeps prior Runtime session references when an Agent changes Runtime", async (t) => {
  const { conversationStore, conversationStateFile, groupRoom, roomDirectory } = await fixture(t);
  const original = await conversationStore.resolve({ threadId: "thread-manager" });
  const switched = await conversationStore.bindRuntime({
    conversationId: original.conversationId,
    agentId: "manager",
    runtimeKind: "hermes",
    runtimeSessionId: "hermes-session-1",
  });

  assert.equal(switched.conversationId, original.conversationId);
  assert.equal(switched.agentId, "manager");
  assert.equal(switched.runtimeKind, "hermes");
  assert.deepEqual(switched.runtimeSessions.map(({ runtimeKind, runtimeSessionId }) => ({ runtimeKind, runtimeSessionId })), [
    { runtimeKind: "codex", runtimeSessionId: "thread-manager" },
    { runtimeKind: "hermes", runtimeSessionId: "hermes-session-1" },
  ]);
  const restored = await conversationStore.bindRuntime({
    conversationId: original.conversationId,
    agentId: "manager",
    runtimeKind: "codex",
    runtimeSessionId: "thread-manager",
  });
  assert.equal(restored.runtimeKind, "codex");
  assert.equal(restored.runtimeSessions.length, 2);

  await conversationStore.close();
  const reopened = await createAgentConversationStore({
    stateFile: conversationStateFile,
    groupRoom,
    roomDirectory,
  });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.findByAgent("manager").runtimeSessions, restored.runtimeSessions);
});

test("publishes only to the explicitly selected room", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-agent-publication-rooms-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const makeRoom = async (name) => {
    const stateFile = path.join(directory, `${name}.json`);
    await fs.writeFile(stateFile, JSON.stringify({
      version: 3,
      agents: [{ id: "manager", threadId: "thread-manager" }],
      messages: [],
    }), "utf8");
    return createGroupRoomStore({ stateFile, project: name, broadcast: () => {} });
  };
  const roomA = await makeRoom("room-a");
  const roomB = await makeRoom("room-b");
  const roomDirectory = createGroupRoomDirectory({ rooms: [roomA, roomB] });
  const conversationStore = await createAgentConversationStore({
    stateFile: path.join(directory, "agent-conversations.json"),
    groupRoom: roomA,
    roomDirectory,
  });
  const publicationStore = await createPublicationStore({
    stateFile: path.join(directory, "agent-publications.json"),
  });
  const service = createAgentPublicationService({
    conversationStore,
    conversations: {
      findSession: async () => ({
        messages: [{ id: "answer-1", role: "assistant", text: "原文", turnId: "turn-1" }],
      }),
    },
    groupRoom: roomA,
    roomDirectory,
    publicationStore,
  });
  t.after(async () => {
    await conversationStore.close();
    await publicationStore.close();
    await roomA.close();
    await roomB.close();
  });

  const targets = await conversationStore.getShareTargets({ threadId: "thread-manager" });
  const roomBTarget = targets.rooms.find((room) => room.name === "room-b 项目群");
  assert.ok(roomBTarget);
  await service.publish({
    requestId: "share-room-b",
    conversationId: targets.conversationId,
    messageId: "answer-1",
    roomId: roomBTarget.id,
  });

  assert.equal(roomA.snapshot().messages.length, 0);
  assert.equal(roomB.snapshot().messages.length, 1);
  assert.equal(roomB.snapshot().messages[0].authorId, "manager");
});
