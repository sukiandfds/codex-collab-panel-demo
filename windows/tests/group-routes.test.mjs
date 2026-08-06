import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGroupRoomStore } from "../server/group-room-store.mjs";
import { createGroupRoutes } from "../server/routes/group-routes.mjs";

test("retries the same group message without enqueueing a second discussion", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "negus-group-route-"));
  const room = await createGroupRoomStore({
    stateFile: path.join(directory, "group-room.json"),
    project: "negus",
    broadcast: () => {},
  });
  let enqueueCount = 0;
  const route = createGroupRoutes({
    groupRoom: room,
    media: { resolveMany: () => [] },
    multiAgent: {
      enqueueDiscussion: async ({ agentIds }) => {
        enqueueCount += 1;
        return { jobId: "job-1", agentIds, status: "queued" };
      },
    },
    webOutputs: { isRequest: () => false },
  });
  const server = http.createServer(async (request, response) => {
    const handled = await route(request, response, new URL(request.url, "http://127.0.0.1"));
    if (!handled) {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await room.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const { port } = server.address();
  const body = {
    memberId: "member-1",
    authorName: "Hans",
    clientMessageId: "client-message-1",
    mode: "discussion",
    agentIds: ["manager"],
    text: "请分析当前问题",
    attachmentIds: [],
  };
  const send = () => fetch(`http://127.0.0.1:${port}/api/group/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const first = await (await send()).json();
  const retried = await (await send()).json();

  assert.equal(first.message.id, retried.message.id);
  assert.equal(retried.deduplicated, true);
  assert.equal(room.snapshot().messages.length, 1);
  assert.equal(enqueueCount, 1);
});
