import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { createConversationRoutes } from "../server/routes/conversation-routes.mjs";

const invoke = (route, body) => {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]);
  request.method = "POST";
  request.url = "/api/session/message";
  const response = {
    status: 0,
    body: "",
    writeHead(status) { this.status = status; },
    end(value) { this.body = value || ""; },
  };
  return { response, promise: route(request, response, new URL("http://127.0.0.1/api/session/message")) };
};

test("reuses the in-flight result for a repeated submission id", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let sendCalls = 0;
  const events = [];
  const route = createConversationRoutes({
    conversations: {
      sendMessage: async () => {
        sendCalls += 1;
        await gate;
        return { turn: { id: "turn-1", status: "inProgress" } };
      },
      steerMessage: async () => { throw new Error("steer should not be called"); },
    },
    execution: { getStatus: () => ({ active: false, turnId: "" }) },
    contextManagement: {},
    media: { resolveMany: () => [] },
    broadcast: (event) => events.push(event),
  });
  const body = { threadId: "thread-1", text: "same message", attachmentIds: [], submissionId: "submission-1" };

  const first = invoke(route, body);
  while (sendCalls === 0) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    type: "user_message_submitted",
    threadId: "thread-1",
    submissionId: "submission-1",
    messageId: "optimistic-submission-1",
    text: "same message",
    attachments: [],
    createdAt: events[0].createdAt,
  });
  const second = invoke(route, body);
  release();
  await Promise.all([first.promise, second.promise]);

  assert.equal(sendCalls, 1);
  assert.equal(events.length, 1);
  assert.equal(first.response.status, 202);
  assert.equal(second.response.status, 202);
  assert.deepEqual(JSON.parse(first.response.body), JSON.parse(second.response.body));
  const third = invoke(route, body);
  await third.promise;
  assert.equal(sendCalls, 1);
  assert.equal(events.length, 1);
  assert.deepEqual(JSON.parse(first.response.body), JSON.parse(third.response.body));
});

test("routes image requests through the real Codex turn without a web-side bypass", async () => {
  const codexCalls = [];
  const route = createConversationRoutes({
    conversations: {
      sendMessage: async (threadId, text, attachments) => {
        codexCalls.push({ threadId, text, attachments });
        return { turn: { id: "turn-image-1", status: "inProgress" } };
      },
      steerMessage: async () => { throw new Error("steer should not be called"); },
    },
    execution: { getStatus: () => ({ active: false, turnId: "" }) },
    contextManagement: {},
    media: { resolveMany: () => [] },
    imageGeneration: {
      intentFor: () => { throw new Error("legacy image intent must not be used"); },
      start: async () => { throw new Error("legacy image service must not be used"); },
    },
  });
  const prompt = "Generate one 2.35：1 cinematic image in 4K";
  const call = invoke(route, {
    threadId: "thread-1",
    text: prompt,
    attachmentIds: [],
    submissionId: "image-submission",
  });
  await call.promise;

  assert.equal(call.response.status, 202);
  assert.deepEqual(codexCalls, [{ threadId: "thread-1", text: prompt, attachments: [] }]);
  const body = JSON.parse(call.response.body);
  assert.equal(body.turnId, "turn-image-1");
  assert.equal("capability" in body, false);
  assert.equal("runId" in body, false);
});

test("returns the new real thread id after migrating a legacy image conversation", async () => {
  const route = createConversationRoutes({
    conversations: {
      sendMessage: async () => ({
        threadId: "real-thread",
        migratedFromThreadId: "legacy-thread",
        turn: { id: "real-turn", status: "inProgress" },
      }),
      steerMessage: async () => { throw new Error("steer should not be called"); },
    },
    execution: { getStatus: () => ({ active: false, turnId: "" }) },
    contextManagement: {},
    media: { resolveMany: () => [] },
  });
  const call = invoke(route, {
    threadId: "legacy-thread",
    text: "Make the previous image a night scene",
    attachmentIds: [],
    submissionId: "legacy-migration",
  });
  await call.promise;

  assert.equal(call.response.status, 202);
  assert.deepEqual(JSON.parse(call.response.body), {
    threadId: "real-thread",
    migratedFromThreadId: "legacy-thread",
    turnId: "real-turn",
    status: "inProgress",
    submissionId: "legacy-migration",
    messageId: "optimistic-legacy-migration",
  });
});

test("routes direct employee text through employee runtime", async () => {
  const binding = {
    conversationId: "employee-conversation",
    agentId: "developer",
    runtimeKind: "codex",
    runtimeSessionId: "employee-thread",
    conversationKind: "direct",
  };
  const employeeCalls = [];
  const events = [];
  let genericCalls = 0;
  const route = createConversationRoutes({
    conversations: {
      sendMessage: async () => { genericCalls += 1; throw new Error("generic conversation path used"); },
      steerMessage: async () => { genericCalls += 1; throw new Error("generic conversation path used"); },
    },
    execution: { getStatus: () => ({ active: true, turnId: "native-turn" }) },
    contextManagement: {},
    media: { resolveMany: () => [] },
    broadcast: (event) => events.push(event),
    agentConversationStore: {
      findByRuntimeSession: () => binding,
      resolve: async () => binding,
    },
    employeeRuntime: {
      supportsEmployee: (employeeId) => employeeId === "developer",
      ownsConversation: (value) => value === binding,
      sendMessage: async (value) => {
        employeeCalls.push(value);
        return {
          employeeId: "developer",
          conversationId: binding.conversationId,
          threadId: binding.runtimeSessionId,
          turnId: "employee-turn",
          status: "inProgress",
        };
      },
    },
  });

  const call = invoke(route, {
    threadId: binding.runtimeSessionId,
    conversationId: binding.conversationId,
    text: "run employee task",
    attachmentIds: [],
    submissionId: "employee-submission",
  });
  await call.promise;

  assert.equal(call.response.status, 202);
  assert.equal(genericCalls, 0);
  assert.deepEqual(employeeCalls, [{
    employeeId: "developer",
    text: "run employee task",
    requestId: "employee-submission",
  }]);
  assert.deepEqual(JSON.parse(call.response.body), {
    threadId: binding.runtimeSessionId,
    turnId: "employee-turn",
    status: "inProgress",
    submissionId: "employee-submission",
    messageId: "optimistic-employee-submission",
  });
  assert.equal(events[0].type, "user_message_submitted");
});

test("rejects employee attachments instead of bypassing employee runtime", async () => {
  const binding = {
    conversationId: "employee-conversation",
    agentId: "developer",
    runtimeKind: "codex",
    runtimeSessionId: "employee-thread",
    conversationKind: "direct",
  };
  let employeeCalls = 0;
  const route = createConversationRoutes({
    conversations: { sendMessage: async () => { throw new Error("generic path used"); } },
    execution: { getStatus: () => ({ active: false, turnId: "" }) },
    contextManagement: {},
    media: { resolveMany: () => [] },
    agentConversationStore: {
      findByRuntimeSession: () => binding,
      resolve: async () => binding,
    },
    employeeRuntime: {
      supportsEmployee: () => true,
      ownsConversation: (value) => value === binding,
      sendMessage: async () => { employeeCalls += 1; },
    },
  });

  const call = invoke(route, {
    threadId: binding.runtimeSessionId,
    conversationId: binding.conversationId,
    text: "inspect attachment",
    attachmentIds: ["file-1"],
    submissionId: "employee-attachment-submission",
  });
  await assert.rejects(call.promise, (error) => error?.statusCode === 400);
  assert.equal(employeeCalls, 0);
});

test("keeps an older direct binding on the generic conversation path", async () => {
  const binding = {
    conversationId: "legacy-conversation",
    agentId: "developer",
    runtimeKind: "codex",
    runtimeSessionId: "legacy-thread",
    conversationKind: "direct",
  };
  let genericCalls = 0;
  let employeeCalls = 0;
  const route = createConversationRoutes({
    conversations: {
      sendMessage: async () => {
        genericCalls += 1;
        return { turn: { id: "legacy-turn", status: "inProgress" } };
      },
      steerMessage: async () => { throw new Error("legacy steer should not be called"); },
    },
    execution: { getStatus: () => ({ active: false, turnId: "" }) },
    contextManagement: {},
    media: { resolveMany: () => [] },
    agentConversationStore: {
      findByRuntimeSession: () => binding,
      resolve: async () => binding,
    },
    employeeRuntime: {
      supportsEmployee: () => true,
      ownsConversation: () => false,
      sendMessage: async () => { employeeCalls += 1; },
    },
  });

  const call = invoke(route, {
    threadId: binding.runtimeSessionId,
    conversationId: binding.conversationId,
    text: "legacy task",
    attachmentIds: [],
    submissionId: "legacy-submission",
  });
  await call.promise;

  assert.equal(genericCalls, 1);
  assert.equal(employeeCalls, 0);
  assert.equal(JSON.parse(call.response.body).turnId, "legacy-turn");
});
