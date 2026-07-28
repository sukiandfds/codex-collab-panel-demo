import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createRealtimeHub } from "../server/realtime-hub.mjs";

const createConnection = (lastEventId = "") => {
  const request = new EventEmitter();
  request.headers = lastEventId ? { "last-event-id": lastEventId } : {};
  const chunks = [];
  const response = {
    socket: { setNoDelay() {} },
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    flushHeaders() {},
    write(chunk) { chunks.push(chunk); },
    end() {},
  };
  return { request, response, chunks };
};

test("flushes an initial SSE body and assigns event ids", () => {
  const hub = createRealtimeHub();
  const connection = createConnection();
  hub.connect(connection.request, connection.response);
  hub.broadcast({ type: "sessions_changed", threadId: "thread-1" });

  assert.equal(connection.response.status, 200);
  assert.equal(connection.response.headers["Content-Encoding"], "identity");
  assert.equal(connection.chunks.some((chunk) => chunk.length >= 4096), true);
  assert.equal(connection.chunks.some((chunk) => chunk.includes("id: 1\n")), true);
  hub.close();
});

test("replays missed events after reconnect", () => {
  const hub = createRealtimeHub();
  hub.broadcast({ type: "sessions_changed", threadId: "thread-1" });
  hub.broadcast({ type: "sessions_changed", threadId: "thread-2" });
  const connection = createConnection("1");
  hub.connect(connection.request, connection.response);

  const output = connection.chunks.join("");
  assert.equal(output.includes("id: 1\n"), false);
  assert.equal(output.includes("id: 2\n"), true);
  assert.equal(output.includes('"threadId":"thread-2"'), true);
  hub.close();
});
