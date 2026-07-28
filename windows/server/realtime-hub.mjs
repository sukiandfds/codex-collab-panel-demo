export const createRealtimeHub = () => {
  const historyLimit = 200;
  const clients = new Set();
  const activeThreads = new Set();
  const history = [];
  let nextEventId = 1;
  let lastIdleKeepAlive = 0;

  const write = (client, chunk) => {
    try {
      client.write(chunk);
      return true;
    } catch {
      clients.delete(client);
      return false;
    }
  };

  const writeEvent = (client, value, id) => {
    const eventId = id ? `id: ${id}\n` : "";
    write(client, `${eventId}data: ${JSON.stringify(value)}\n\n`);
  };

  const keepAliveTimer = setInterval(() => {
    const now = Date.now();
    if (activeThreads.size) {
      const heartbeat = { type: "heartbeat", active: true, at: new Date(now).toISOString() };
      for (const client of clients) writeEvent(client, heartbeat);
      return;
    }
    if (now - lastIdleKeepAlive < 30000) return;
    lastIdleKeepAlive = now;
    for (const client of clients) write(client, ": keep-alive\n\n");
  }, 10000);
  keepAliveTimer.unref?.();

  const connect = (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Content-Encoding": "identity",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.socket?.setNoDelay?.(true);
    response.flushHeaders?.();
    clients.add(response);
    // A small initial body can be buffered by mobile and tunnel proxies.
    write(response, `: ${" ".repeat(4096)}\n\nretry: 2000\n\n`);
    const requestUrl = new URL(request.url || "/events", "http://127.0.0.1");
    const requestedValue = request.headers?.["last-event-id"]
      || requestUrl.searchParams.get("lastEventId")
      || "0";
    const parsedEventId = Number(requestedValue);
    const lastEventId = Number.isSafeInteger(parsedEventId) && parsedEventId > 0 ? parsedEventId : 0;
    const latestEventId = nextEventId - 1;
    const oldestEventId = history[0]?.id ?? nextEventId;
    const gap = lastEventId > 0
      && (lastEventId > latestEventId || lastEventId < oldestEventId - 1);
    let replayed = 0;
    if (lastEventId > 0 && lastEventId <= latestEventId) {
      for (const event of history) {
        if (event.id <= lastEventId) continue;
        writeEvent(response, event.value, event.id);
        replayed += 1;
      }
    }
    writeEvent(response, {
      type: "connected",
      eventId: latestEventId,
      requestedEventId: lastEventId,
      oldestEventId,
      replayed,
      gap,
    });
    request.on("close", () => clients.delete(response));
  };

  const broadcast = (value) => {
    if (value?.type === "execution_status" && value.threadId) {
      if (value.active) activeThreads.add(value.threadId);
      else activeThreads.delete(value.threadId);
    }
    const event = { id: nextEventId++, value };
    history.push(event);
    if (history.length > historyLimit) history.shift();
    for (const client of clients) writeEvent(client, event.value, event.id);
  };

  const close = () => {
    clearInterval(keepAliveTimer);
    for (const client of clients) client.end();
    clients.clear();
  };

  return { connect, broadcast, close };
};
