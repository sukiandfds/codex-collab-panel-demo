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
import { createRuntimeAdapterRegistry } from "../server/runtime-adapter-registry.mjs";
import { createConversationRoutes } from "../server/routes/conversation-routes.mjs";

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

test("opens an Agent conversation through the registered Runtime without changing Agent identity", async (t) => {
  const { conversationStore, groupRoom } = await fixture(t);
  await groupRoom.updateAgent("manager", { threadId: null });
  let ensureCount = 0;
  const runtimeRegistry = createRuntimeAdapterRegistry({
    adapters: [{
      kind: "codex",
      readConversation: async () => null,
      ensureConversation: async (agent) => {
        ensureCount += 1;
        await groupRoom.updateAgent(agent.id, { threadId: "thread-created" });
        return "thread-created";
      },
    }],
  });

  const first = await conversationStore.openForAgent({ agentId: "manager", runtimeRegistry });
  const second = await conversationStore.openForAgent({ agentId: "manager", runtimeRegistry });
  assert.equal(first.conversationId, second.conversationId);
  assert.equal(first.agentId, "manager");
  assert.equal(first.runtimeKind, "codex");
  assert.equal(first.runtimeSessionId, "thread-created");
  assert.equal(ensureCount, 1);
});

test("keeps an Agent direct conversation Thread separate from the group Thread", async (t) => {
  const { conversationStore, groupRoom } = await fixture(t);
  const groupThreadId = groupRoom.getAgent("manager").threadId;
  let ensureCount = 0;
  const runtimeRegistry = createRuntimeAdapterRegistry({
    adapters: [{
      kind: "codex",
      readConversation: async () => null,
      ensureConversation: async () => {
        ensureCount += 1;
        return "thread-direct";
      },
    }],
  });

  const first = await conversationStore.openForAgent({ agentId: "manager", runtimeRegistry });
  const second = await conversationStore.openForAgent({ agentId: "manager", runtimeRegistry });
  assert.equal(first.conversationKind, "direct");
  assert.equal(first.runtimeSessionId, "thread-direct");
  assert.notEqual(first.runtimeSessionId, groupThreadId);
  assert.equal(groupRoom.getAgent("manager").threadId, groupThreadId);
  assert.equal(second.conversationId, first.conversationId);
  assert.equal(second.runtimeSessionId, first.runtimeSessionId);
  assert.equal(ensureCount, 1);
});

test("isolates a new direct history from legacy group history and authorizes its current Runtime", async (t) => {
  const { service, conversationStore, groupRoom } = await fixture(t);
  const legacy = await conversationStore.resolve({ threadId: "thread-manager" });
  const legacyMessage = {
    id: "legacy-history",
    role: "assistant",
    text: "legacy group context",
    turnId: "turn-legacy",
  };
  await conversationStore.appendMessage({ conversationId: legacy.conversationId, message: legacyMessage });

  const runtimeRegistry = createRuntimeAdapterRegistry({
    adapters: [{
      kind: "codex",
      readConversation: async () => null,
      ensureConversation: async () => "thread-direct",
    }],
  });
  const direct = await conversationStore.openForAgent({ agentId: "manager", runtimeRegistry });
  assert.notEqual(direct.conversationId, legacy.conversationId);
  assert.equal(direct.conversationKind, "direct");
  assert.deepEqual(await conversationStore.readMessages(direct.conversationId), []);
  assert.equal((await conversationStore.readMessage(legacy.conversationId, legacyMessage.id)).text, legacyMessage.text);

  const directMessage = {
    id: "direct-history",
    role: "assistant",
    text: "direct answer **Markdown**",
    turnId: "turn-direct",
  };
  await conversationStore.appendMessage({ conversationId: direct.conversationId, message: directMessage });
  const target = (await conversationStore.getShareTargets({ conversationId: direct.conversationId })).rooms[0];
  const published = await service.publish({
    requestId: "share-direct-history",
    conversationId: direct.conversationId,
    messageId: directMessage.id,
    roomId: target.id,
  });
  assert.equal(published.message.authorId, "manager");
  assert.equal(published.message.text, directMessage.text);

  await conversationStore.bindRuntime({
    conversationId: direct.conversationId,
    agentId: "manager",
    runtimeKind: "codex",
    runtimeSessionId: "thread-direct-old",
  });
  await conversationStore.bindRuntime({
    conversationId: direct.conversationId,
    agentId: "manager",
    runtimeKind: "codex",
    runtimeSessionId: direct.runtimeSessionId,
  });
  const route = createConversationRoutes({
    conversations: {
      findSession: async (threadId) => ({ threadId, messages: [] }),
    },
    execution: { getStatus: () => ({ active: false, turnId: "" }) },
    contextManagement: {},
    media: { resolveMany: () => [] },
    agentConversationStore: conversationStore,
  });
  const invokeSession = (threadId, conversationId) => {
    const request = { method: "GET" };
    const response = {
      status: 0,
      body: "",
      writeHead(status) { this.status = status; },
      end(value) { this.body = value || ""; },
    };
    const url = new URL(`http://127.0.0.1/api/session?threadId=${encodeURIComponent(threadId)}&conversationId=${encodeURIComponent(conversationId)}`);
    return { response, promise: route(request, response, url) };
  };

  await assert.rejects(
    invokeSession(legacy.runtimeSessionId, direct.conversationId).promise,
    (error) => error.statusCode === 409,
  );
  await assert.rejects(
    invokeSession("thread-direct-old", direct.conversationId).promise,
    (error) => error.statusCode === 409,
  );
  const current = invokeSession(direct.runtimeSessionId, direct.conversationId);
  await current.promise;
  assert.equal(current.response.status, 200);
  assert.equal(JSON.parse(current.response.body).threadId, direct.runtimeSessionId);
  assert.equal(groupRoom.snapshot().messages.at(-1).text, directMessage.text);
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

  const runtimeRegistry = createRuntimeAdapterRegistry({
    adapters: [{
      kind: "codex",
      readConversation: async () => null,
      ensureConversation: async () => "thread-direct",
    }],
  });
  const direct = await conversationStore.openForAgent({ agentId: "manager", runtimeRegistry });
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
