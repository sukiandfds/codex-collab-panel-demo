import path from "node:path";
import { spawn } from "node:child_process";

const codexEntrypoint = () => path.join(
  process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming"),
  "npm", "node_modules", "@openai", "codex", "bin", "codex.js",
);

export const createAppServerClient = ({ requestTimeoutMs = 15000 } = {}) => {
  let child;
  let buffer = "";
  let nextId = 1;
  let initializePromise;
  const pending = new Map();

  const rejectPending = (reason) => {
    for (const request of pending.values()) request.reject(reason);
    pending.clear();
  };

  const start = () => {
    if (child && !child.killed) return;
    child = spawn(process.execPath, [codexEntrypoint(), "app-server"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const message = JSON.parse(line);
          const request = pending.get(message.id);
          if (!request) continue;
          clearTimeout(request.timer);
          pending.delete(message.id);
          if (message.error) request.reject(new Error(message.error.message || JSON.stringify(message.error)));
          else request.resolve(message.result);
        } catch {}
      }
    });
    child.once("error", rejectPending);
    child.once("exit", (code) => {
      rejectPending(new Error(`Codex app-server exited with code ${code ?? "unknown"}`));
      child = undefined;
      initializePromise = undefined;
    });
  };

  const requestRaw = (method, params = {}) => {
    start();
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, requestTimeoutMs);
      timer.unref?.();
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    });
  };

  const initialize = () => {
    initializePromise ||= requestRaw("initialize", {
      clientInfo: { name: "codex-collab-panel-demo", title: "Codex Collab Panel", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    }).then((result) => {
      child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
      return result;
    });
    return initializePromise;
  };

  const request = async (method, params = {}) => {
    await initialize();
    return requestRaw(method, params);
  };

  const close = () => {
    rejectPending(new Error("Codex app-server client closed"));
    child?.kill();
    child = undefined;
    initializePromise = undefined;
  };

  return { request, close };
};
