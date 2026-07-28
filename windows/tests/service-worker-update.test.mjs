import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const serviceWorkerFile = path.resolve(testRoot, "..", "..", "web-ui", "public", "sw.js");

const loadWorker = async () => {
  const listeners = new Map();
  const openedCaches = [];
  let skipWaitingCalls = 0;
  const context = {
    URL,
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    caches: {
      open: async (name) => {
        openedCaches.push(name);
        return { addAll: async () => {}, put: async () => {} };
      },
      keys: async () => [],
      delete: async () => true,
      match: async () => null,
    },
    self: {
      location: { href: "https://example.test/sw.js?build=web-test" },
      clients: { claim: async () => {} },
      skipWaiting: () => { skipWaitingCalls += 1; },
      addEventListener: (name, listener) => listeners.set(name, listener),
    },
  };
  vm.runInNewContext(await fs.readFile(serviceWorkerFile, "utf8"), context, { filename: serviceWorkerFile });
  return { listeners, openedCaches, getSkipWaitingCalls: () => skipWaitingCalls };
};

test("uses a build-specific cache without activating during install", async () => {
  const worker = await loadWorker();
  let installWork;
  worker.listeners.get("install")({ waitUntil: (promise) => { installWork = promise; } });
  await installWork;

  assert.deepEqual(worker.openedCaches, ["codex-collab-shell-web-test"]);
  assert.equal(worker.getSkipWaitingCalls(), 0);
});

test("activates only after the page sends an explicit update command", async () => {
  const worker = await loadWorker();
  worker.listeners.get("message")({ data: { type: "OTHER" } });
  assert.equal(worker.getSkipWaitingCalls(), 0);
  worker.listeners.get("message")({ data: { type: "SKIP_WAITING" } });
  assert.equal(worker.getSkipWaitingCalls(), 1);
});
