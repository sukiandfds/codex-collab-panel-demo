import http from "node:http";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const port = Number(getArg("--port", "9348"));
const observerPort = Number(getArg("--observer-port", "9350"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getJson = async (url) => new Promise((resolve, reject) => {
  http.get(url, (response) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { body += chunk; });
    response.on("end", () => {
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
  }).on("error", reject);
});

const sendCdp = (webSocketDebuggerUrl, method, params = {}) => new Promise((resolve, reject) => {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 0;
  const timer = setTimeout(() => { ws.close(); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
  ws.addEventListener("open", () => {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
  }, { once: true });
  ws.addEventListener("message", (event) => {
    const value = JSON.parse(event.data);
    if (!value.id) return;
    clearTimeout(timer);
    ws.close();
    if (value.error) reject(new Error(value.error.message));
    else resolve(value.result);
  });
  ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP WebSocket failed")); }, { once: true });
});

const bridgeOnce = async () => {
  const [status, targets] = await Promise.all([
    getJson(`http://127.0.0.1:${observerPort}/status`),
    getJson(`http://127.0.0.1:${port}/json/list`),
  ]);
  const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!target) throw new Error("No Codex renderer target");
  const encoded = JSON.stringify(status);
  await sendCdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: `window.__CODEX_DREAM_APPLY_CAPTURE__?.(${encoded})`,
    returnByValue: true,
  });
};

console.log(`[summary-bridge] watching CDP ${port} and observer ${observerPort}`);
while (true) {
  try { await bridgeOnce(); } catch (error) { console.error(`[summary-bridge] ${error.message}`); }
  await sleep(1200);
}
