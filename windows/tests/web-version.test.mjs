import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWebVersionReader } from "../server/web-version.mjs";

test("reads the current web build and notices a replaced build without restarting", async (t) => {
  const webRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-web-version-"));
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));
  const versionFile = path.join(webRoot, "version.json");
  const readVersion = createWebVersionReader(webRoot);

  await fs.writeFile(versionFile, JSON.stringify({
    buildId: "web-first",
    builtAt: "2026-07-28T00:00:00.000Z",
  }), "utf8");
  assert.deepEqual(await readVersion(), {
    buildId: "web-first",
    builtAt: "2026-07-28T00:00:00.000Z",
  });

  await fs.writeFile(versionFile, JSON.stringify({
    buildId: "web-second",
    builtAt: "2026-07-28T00:01:00.000Z",
  }), "utf8");
  assert.deepEqual(await readVersion(), {
    buildId: "web-second",
    builtAt: "2026-07-28T00:01:00.000Z",
  });
});

test("keeps the last valid build during an atomic deployment gap", async (t) => {
  const webRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-web-version-gap-"));
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));
  const versionFile = path.join(webRoot, "version.json");
  const version = { buildId: "web-stable", builtAt: "2026-07-28T00:00:00.000Z" };
  await fs.writeFile(versionFile, JSON.stringify(version), "utf8");
  const readVersion = createWebVersionReader(webRoot);

  assert.deepEqual(await readVersion(), version);
  await fs.rm(versionFile);
  assert.deepEqual(await readVersion(), version);
});

test("rejects missing or malformed metadata before any valid build is known", async (t) => {
  const webRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-web-version-invalid-"));
  t.after(() => fs.rm(webRoot, { recursive: true, force: true }));
  const readVersion = createWebVersionReader(webRoot);

  await assert.rejects(readVersion(), /unavailable/i);
  await fs.writeFile(path.join(webRoot, "version.json"), JSON.stringify({ buildId: "", builtAt: "invalid" }), "utf8");
  await assert.rejects(readVersion(), /invalid/i);
});
