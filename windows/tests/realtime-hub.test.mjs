import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createRealtimeHub } from "../server/realtime-hub.mjs";

const createConnection = (lastEventId = "", url = "/events") => {
  const request = new EventEmitter();
  request.headers = lastEventId ? { "last-event-id": lastEventId } : {};
  request.url = url;
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

const eventPayloads = (chunks) => chunks.join("")
  .split("\n\n")
  .map((frame) => frame.split("\n").find((line) => line.startsWith("data: ")))
  .filter(Boolean)
  .map((line) => JSON.parse(line.slice(6)));

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

test("accepts a browser reconnect cursor in the query and reports replay diagnostics", () => {
  const hub = createRealtimeHub();
  hub.broadcast({ type: "sessions_changed", threadId: "thread-1" });
  hub.broadcast({ type: "sessions_changed", threadId: "thread-2" });
  const connection = createConnection("", "/events?token=test&lastEventId=1");
  hub.connect(connection.request, connection.response);

  const connected = eventPayloads(connection.chunks).find((event) => event.type === "connected");
  assert.deepEqual(connected, {
    type: "connected",
    eventId: 2,
    requestedEventId: 1,
    oldestEventId: 1,
    replayed: 1,
    gap: false,
  });
  assert.equal(connection.chunks.join("").includes("id: 2\n"), true);
  hub.close();
});

test("reports a gap when the requested event is older than retained history", () => {
  const hub = createRealtimeHub();
  for (let index = 1; index <= 205; index += 1) {
    hub.broadcast({ type: "sessions_changed", threadId: `thread-${index}` });
  }
  const connection = createConnection("", "/events?lastEventId=1");
  hub.connect(connection.request, connection.response);

  const connected = eventPayloads(connection.chunks).find((event) => event.type === "connected");
  assert.deepEqual(connected, {
    type: "connected",
    eventId: 205,
    requestedEventId: 1,
    oldestEventId: 6,
    replayed: 200,
    gap: true,
  });
  const output = connection.chunks.join("");
  assert.equal(output.includes("id: 5\n"), false);
  assert.equal(output.includes("id: 6\n"), true);
  assert.equal(output.includes("id: 205\n"), true);
  hub.close();
});

test("reports a gap when the client cursor belongs to a previous server instance", () => {
  const hub = createRealtimeHub();
  const connection = createConnection("", "/events?lastEventId=99");
  hub.connect(connection.request, connection.response);

  const connected = eventPayloads(connection.chunks).find((event) => event.type === "connected");
  assert.deepEqual(connected, {
    type: "connected",
    eventId: 0,
    requestedEventId: 99,
    oldestEventId: 1,
    replayed: 0,
    gap: true,
  });
  hub.close();
});
