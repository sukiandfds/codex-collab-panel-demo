import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const versionParts = (version) => {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/);
  if (!match) return null;
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split(".") || [],
  };
};

const compareVersions = (left, right) => {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return 0;
  for (let index = 0; index < a.core.length; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (!a.prerelease.length || !b.prerelease.length) return b.prerelease.length - a.prerelease.length;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    const aNumber = Number(a.prerelease[index]);
    const bNumber = Number(b.prerelease[index]);
    const comparison = Number.isNaN(aNumber) || Number.isNaN(bNumber)
      ? a.prerelease[index].localeCompare(b.prerelease[index])
      : aNumber - bNumber;
    if (comparison) return comparison;
  }
  return 0;
};

const commandFor = (entrypoint) => path.extname(entrypoint).toLowerCase() === ".js"
  ? { command: process.execPath, prefixArgs: [entrypoint] }
  : { command: entrypoint, prefixArgs: [] };

const inspectCandidate = (entrypoint) => {
  if (!entrypoint || !fs.existsSync(entrypoint)) return null;
  const launch = commandFor(entrypoint);
  const result = spawnSync(launch.command, [...launch.prefixArgs, "--version"], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return null;
  const version = `${result.stdout || ""} ${result.stderr || ""}`.trim();
  if (!versionParts(version)) return null;
  return { ...launch, entrypoint, version };
};

const desktopCandidates = () => {
  const localAppData = process.env.LOCALAPPDATA
    || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const binRoot = path.join(localAppData, "OpenAI", "Codex", "bin");
  const candidates = [path.join(binRoot, "codex.exe")];
  try {
    for (const entry of fs.readdirSync(binRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(binRoot, entry.name, "codex.exe"));
    }
  } catch {}
  return candidates;
};

const resolveCodexCommand = () => {
  const override = process.env.CODEX_APP_SERVER_BIN?.trim();
  if (override) {
    const selected = inspectCandidate(path.resolve(override));
    if (!selected) throw new Error(`CODEX_APP_SERVER_BIN is not a runnable Codex CLI: ${override}`);
    return selected;
  }

  const desktop = desktopCandidates()
    .map(inspectCandidate)
    .filter(Boolean)
    .sort((left, right) => compareVersions(right.version, left.version));
  if (desktop.length) return desktop[0];

  const appData = process.env.APPDATA
    || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
  const globalNpm = inspectCandidate(path.join(
    appData, "npm", "node_modules", "@openai", "codex", "bin", "codex.js",
  ));
  if (globalNpm) return globalNpm;

  throw new Error("No runnable Codex app-server runtime was found.");
};

export const createAppServerClient = ({ requestTimeoutMs = 15000 } = {}) => {
  let child;
  let buffer = "";
  let nextId = 1;
  let initializePromise;
  let restartPromise;
  let probeFailures = 0;
  const pending = new Map();
  const listeners = new Set();
  const healthListeners = new Set();
  const stderrLines = [];

  const emit = (message) => {
    for (const listener of listeners) {
      try { listener(message); } catch {}
    }
  };

  const emitHealth = (value) => {
    for (const listener of healthListeners) {
      try { listener(value); } catch {}
    }
  };

  const writeMessage = (message) => {
    if (!child?.stdin?.writable) throw new Error("Codex app-server input is unavailable");
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const automaticResponse = (message) => {
    const params = message.params || {};
    if (message.method === "item/commandExecution/requestApproval"
      || message.method === "item/fileChange/requestApproval"
      || message.method === "execCommandApproval"
      || message.method === "applyPatchApproval") {
      return { decision: "accept" };
    }
    if (message.method === "item/permissions/requestApproval") {
      return { permissions: params.permissions || {}, scope: "session" };
    }
    return {};
  };

  const rejectPending = (reason) => {
    for (const request of pending.values()) request.reject(reason);
    pending.clear();
  };

  const start = () => {
    if (child && !child.killed) return;
    const selected = resolveCodexCommand();
    console.log(`[app-server-client] using ${selected.entrypoint} (${selected.version})`);
    const spawned = spawn(selected.command, [...selected.prefixArgs, "app-server"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    child = spawned;
    buffer = "";
    spawned.stdout.setEncoding("utf8");
    spawned.stderr.setEncoding("utf8");
    spawned.stderr.on("data", (chunk) => {
      stderrLines.push(...String(chunk).split(/\r?\n/u).filter(Boolean));
      if (stderrLines.length > 200) stderrLines.splice(0, stderrLines.length - 200);
    });
    spawned.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const message = JSON.parse(line);
          if (message.method && message.id !== undefined) {
            emit(message);
            writeMessage({ id: message.id, result: automaticResponse(message) });
            continue;
          }
          if (message.method) {
            emit(message);
            continue;
          }
          const request = pending.get(message.id);
          if (!request) continue;
          clearTimeout(request.timer);
          pending.delete(message.id);
          if (message.error) request.reject(new Error(message.error.message || JSON.stringify(message.error)));
          else request.resolve(message.result);
        } catch (error) {
          console.warn(`[app-server-client] ignored malformed message: ${error.message}`);
        }
      }
    });
    spawned.once("error", (error) => {
      rejectPending(error);
      if (child === spawned) child = undefined;
    });
    spawned.once("exit", (code) => {
      const tail = stderrLines.slice(-20).join("\n");
      rejectPending(new Error(`Codex app-server exited with code ${code ?? "unknown"}${tail ? `: ${tail}` : ""}`));
      if (child === spawned) {
        child = undefined;
        initializePromise = undefined;
      }
    });
  };

  const requestRaw = (method, params = {}, timeoutMs = requestTimeoutMs) => {
    start();
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, timeoutMs);
      timer.unref?.();
      pending.set(id, { resolve, reject, timer });
      writeMessage({ method, id, params });
    });
  };

  const initialize = () => {
    initializePromise ||= requestRaw("initialize", {
      clientInfo: { name: "codex-collab-panel-demo", title: "Codex Collab Panel", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    }).then((result) => {
      writeMessage({ method: "initialized", params: {} });
      return result;
    }).catch((error) => {
      initializePromise = undefined;
      throw error;
    });
    return initializePromise;
  };

  const request = async (method, params = {}, options = {}) => {
    if (restartPromise) await restartPromise;
    await initialize();
    return requestRaw(method, params, options.timeoutMs);
  };

  const restart = (reason = "health check failed", threadId = "") => {
    if (restartPromise) return restartPromise;
    restartPromise = (async () => {
      emitHealth({ phase: "recovering", reason, threadId });
      const previous = child;
      child = undefined;
      initializePromise = undefined;
      buffer = "";
      rejectPending(new Error(`Codex app-server restarting: ${reason}`));
      previous?.kill();
      if (previous) {
        await Promise.race([
          new Promise((resolve) => previous.once("exit", resolve)),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      }
      await initialize();
      probeFailures = 0;
      emitHealth({ phase: "recovered", reason, threadId });
    })().catch((error) => {
      emitHealth({ phase: "failed", reason, threadId, error });
      throw error;
    }).finally(() => { restartPromise = undefined; });
    return restartPromise;
  };

  const probe = async (method, params = {}, { timeoutMs = 5000, threadId = "" } = {}) => {
    try {
      const result = await request(method, params, { timeoutMs });
      probeFailures = 0;
      emitHealth({ phase: "healthy", threadId });
      return result;
    } catch (error) {
      probeFailures += 1;
      emitHealth({ phase: probeFailures >= 2 ? "recovering" : "checking", threadId, error });
      if (probeFailures >= 2) await restart("two consecutive health checks failed", threadId);
      throw error;
    }
  };

  const close = () => {
    rejectPending(new Error("Codex app-server client closed"));
    child?.kill();
    child = undefined;
    initializePromise = undefined;
    healthListeners.clear();
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const subscribeHealth = (listener) => {
    healthListeners.add(listener);
    return () => healthListeners.delete(listener);
  };

  return { request, probe, restart, subscribe, subscribeHealth, close };
};
