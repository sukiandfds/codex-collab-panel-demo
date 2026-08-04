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
