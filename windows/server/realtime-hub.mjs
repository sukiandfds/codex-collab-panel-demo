export const createRealtimeHub = () => {
  const clients = new Set();
  const keepAliveTimer = setInterval(() => {
    for (const client of clients) client.write(": keep-alive\n\n");
  }, 20000);
  keepAliveTimer.unref?.();

  const connect = (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders?.();
    clients.add(response);
    response.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
    request.on("close", () => clients.delete(response));
  };

  const broadcast = (value) => {
    const payload = JSON.stringify(value);
    for (const client of clients) client.write(`data: ${payload}\n\n`);
  };

  const close = () => {
    clearInterval(keepAliveTimer);
    for (const client of clients) client.end();
    clients.clear();
  };

  return { connect, broadcast, close };
};
