import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildAppServerEnvironment } from "../server/app-server-client.mjs";
import {
  CURRENT_MODEL_PROVIDER_ID,
  GROK_MODEL_ID,
  GROK_MODEL_PROVIDER_ID,
  createModelProviderCredentialStore,
  createModelProviderService,
} from "../server/model-provider-service.mjs";

const withTemporaryRoot = async (run) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-model-provider-"));
  try { await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
};

test("app-server environment keeps the default behavior unless isolation is requested", () => {
  const base = {
    PATH: "C:\\tools",
    OPENAI_API_KEY: "do-not-copy",
    FUSHENG_GROK_API_KEY: "do-not-copy-either",
  };
  const ordinary = buildAppServerEnvironment({ baseEnvironment: base });
  assert.deepEqual(ordinary, base);

  const isolated = buildAppServerEnvironment({
    baseEnvironment: base,
    codexHome: "C:\\runtime\\grok",
    sanitizeEnvironment: true,
    environment: { NEGUS_RUNTIME: "provider" },
  });
  assert.equal(isolated.PATH, "C:\\tools");
  assert.equal(isolated.CODEX_HOME, path.resolve("C:\\runtime\\grok"));
  assert.equal(isolated.NEGUS_RUNTIME, "provider");
  assert.equal(isolated.OPENAI_API_KEY, undefined);
  assert.equal(isolated.FUSHENG_GROK_API_KEY, undefined);
  assert.equal(base.OPENAI_API_KEY, "do-not-copy");
});

test("provider routing keeps GPT current and sends Grok to the isolated provider", async () => {
  await withTemporaryRoot(async (root) => {
    const defaultClient = { id: "default" };
    const credentials = createModelProviderCredentialStore({
      root: path.join(root, "credentials"),
      protect: async () => Buffer.from("encrypted-test-value").toString("base64"),
    });
    const service = createModelProviderService({ projectRoot: root, defaultClient, credentialStore: credentials });

    assert.equal(service.resolveRoute({ model: "gpt-5.6-terra" }).modelProviderId, CURRENT_MODEL_PROVIDER_ID);
    assert.equal(service.resolveRoute({ model: GROK_MODEL_ID }).modelProviderId, GROK_MODEL_PROVIDER_ID);
    assert.throws(
      () => service.resolveRoute({ model: GROK_MODEL_ID, modelProviderId: CURRENT_MODEL_PROVIDER_ID }),
      /does not belong/u,
    );
    assert.equal(await service.getClient({ model: "gpt-5.6-terra" }), defaultClient);
    service.close();
  });
});

test("credential storage never writes the plaintext token", async () => {
  await withTemporaryRoot(async (root) => {
    const plaintext = "test-secret-that-must-not-be-written";
    const encrypted = Buffer.from(`protected:${plaintext}`).toString("base64");
    const credentials = createModelProviderCredentialStore({
      root,
      protect: async (secret) => {
        assert.equal(secret, plaintext);
        return encrypted;
      },
    });
    const saved = await credentials.save(GROK_MODEL_PROVIDER_ID, plaintext);
    const stored = await fs.readFile(saved.file, "utf8");
    assert.equal(stored.trim(), encrypted);
    assert.equal(stored.includes(plaintext), false);
    assert.equal(await credentials.isConfigured(GROK_MODEL_PROVIDER_ID), true);
  });
});

test("external client is lazy, reused, and configured with command auth", async () => {
  await withTemporaryRoot(async (root) => {
    const credentials = createModelProviderCredentialStore({
      root: path.join(root, "credentials"),
      protect: async () => Buffer.from("encrypted-test-value").toString("base64"),
    });
    await credentials.save(GROK_MODEL_PROVIDER_ID, "synthetic-token");
    const created = [];
    const service = createModelProviderService({
      projectRoot: root,
      defaultClient: { id: "default" },
      credentialStore: credentials,
      createClient: (options) => {
        const client = { options, closeCount: 0, close() { this.closeCount += 1; } };
        created.push(client);
        return client;
      },
    });

    const models = await service.listModels([{ model: "gpt-5.6-terra", displayName: "Terra" }]);
    assert.equal(models.find((model) => model.model === GROK_MODEL_ID)?.available, true);
    const first = await service.getClient({ model: GROK_MODEL_ID });
    const second = await service.getClient({ model: GROK_MODEL_ID });
    assert.equal(first, second);
    assert.equal(created.length, 1);
    assert.equal(first.options.sanitizeEnvironment, true);
    const config = await fs.readFile(path.join(first.options.codexHome, "config.toml"), "utf8");
    assert.match(config, /model_provider = "fusheng-grok"/u);
    assert.match(config, /\[model_providers\.fusheng-grok\.auth\]/u);
    assert.match(config, /command = "powershell\.exe"/u);
    assert.doesNotMatch(config, /env_key|requires_openai_auth|synthetic-token/u);
    service.close();
    assert.equal(first.closeCount, 1);
  });
});

test("DPAPI helper protects and reads a synthetic token on Windows", { skip: process.platform !== "win32" }, async () => {
  await withTemporaryRoot(async (root) => {
    const helper = path.resolve("windows", "scripts", "model-provider-credential.ps1");
    const token = "synthetic-dpapi-token";
    const protectedResult = spawnSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", helper, "-Mode", "protect",
    ], { input: token, encoding: "utf8", windowsHide: true });
    assert.equal(protectedResult.status, 0, protectedResult.stderr);
    const credentialFile = path.join(root, "credential.dpapi");
    await fs.writeFile(credentialFile, protectedResult.stdout, "utf8");
    assert.equal(protectedResult.stdout.includes(token), false);

    const readResult = spawnSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", helper, "-Mode", "read", "-CredentialFile", credentialFile,
    ], { encoding: "utf8", windowsHide: true });
    assert.equal(readResult.status, 0, readResult.stderr);
    assert.equal(readResult.stdout, token);
  });
});
