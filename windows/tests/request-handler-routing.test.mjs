import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequestHandler } from "../server/request-handler.mjs";

const createFixture = (projectRoot = "C:\\demo") => {
  const serveStatic = async (_url, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("static");
  };
  return createRequestHandler({
    token: "test-token",
    project: "demo",
    projectRoot,
    device: { name: "test-device" },
    observerPort: 1,
    conversations: {
      listModels: async () => [{ id: "model" }],
      listSessions: async () => [],
    },
    execution: {},
    media: {},
    realtime: {},
    contextManagement: {},
    groupRoom: { snapshot: () => ({ room: { id: "room" }, messages: [], agents: [], members: [] }) },
    multiAgent: {},
    artifacts: { list: () => [{ id: "artifact" }] },
    webOutputs: {},
    readWebVersion: async () => ({ buildId: "web-test", builtAt: "2026-07-28T00:00:00.000Z" }),
    serveStatic,
  });
};

const withServer = async (run, projectRoot) => {
  const server = http.createServer(createFixture(projectRoot));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("dispatches feature routes and preserves static fallback", async () => {
  await withServer(async (baseUrl) => {
    const request = (pathname) => fetch(`${baseUrl}${pathname}${pathname.includes("?") ? "&" : "?"}token=test-token`);
    assert.deepEqual(await (await request("/api/project")).json(), { name: "demo", root: "C:\\demo", mode: "interactive" });
    assert.deepEqual(await (await request("/api/share-link")).json(), { token: "test-token" });
    assert.deepEqual(await (await request("/api/models")).json(), [{ id: "model" }]);
    assert.equal((await (await request("/api/group/snapshot")).json()).room.id, "room");
    assert.deepEqual(await (await request("/api/artifacts")).json(), [{ id: "artifact" }]);
    assert.deepEqual(await (await request("/api/version")).json(), {
      buildId: "web-test",
      builtAt: "2026-07-28T00:00:00.000Z",
    });
    assert.equal(await (await request("/page")).text(), "static");
  });
});

test("keeps API routes protected after route extraction", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/project`);
    assert.equal(response.status, 401);
    assert.equal(await response.text(), "Unauthorized");
  });
});

test("serves the current feature index as live project progress", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-progress-route-"));
  try {
    const docs = path.join(root, "docs", "feature-development");
    await fs.mkdir(docs, { recursive: true });
    await fs.writeFile(path.join(docs, "FEATURE_INDEX.md"), "# Feature index\n\n| ID | Status |\n| --- | --- |\n| FEAT-001 | active |\n", "utf8");
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/project-progress?token=test-token`);
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.match(payload.markdown, /FEAT-001/u);
      assert.ok(Date.parse(payload.updatedAt));
    }, root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("returns structured entries and update history for the progress panel", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-progress-structured-"));
  try {
    const docs = path.join(root, "docs", "feature-development");
    await fs.mkdir(path.join(docs, "features"), { recursive: true });
    await fs.writeFile(path.join(docs, "FEATURE_INDEX.md"), [
      "---",
      "document_type: feature_index",
      "---",
      "# 功能开发索引",
      "## 当前功能",
      "| 功能编号 | 功能 | 当前状态 | 当前版本 | 最近更新 | 当前结论 | 记录 |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| `FEAT-001` | 单人对话 | `in_progress` | `v1.0.0` | 2026-08-02 12:00 +08:00 | 正在补齐状态展示 | [FEAT-001-demo.md](./features/FEAT-001-demo.md) |",
      "## 当前待办开发顺序",
      "| 顺序 | 功能项目 | 当前要做什么 |",
      "| --- | --- | --- |",
      "| `P1` | `FEAT-001-I01` | 补齐状态展示 |",
    ].join("\n"), "utf8");
    await fs.writeFile(path.join(docs, "features", "FEAT-001-demo.md"), [
      "---",
      "feature_id: FEAT-001",
      "status: in_progress",
      "---",
      "# FEAT-001",
      "## 当前快照",
      "- 用户等待回复时可以看到执行状态。",
      "## 用户可见结果",
      "- 用户可以判断任务是否仍在运行。",
      "## 版本时间线",
      "### 2026-08-02 12:00 +08:00 | v1.0.0 | in_progress",
      "- 增加状态展示。",
    ].join("\n"), "utf8");
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/project-progress?token=test-token`);
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.entries.length, 1);
      assert.equal(payload.entries[0].id, "FEAT-001");
      assert.equal(payload.entries[0].status, "in_progress");
      assert.equal(payload.entries[0].updates.length, 1);
      assert.deepEqual(payload.plan.map((entry) => entry.id), ["FEAT-001"]);
      assert.deepEqual(payload.inProgress.map((entry) => entry.id), ["FEAT-001"]);
      assert.equal(payload.logs[0].entryId, "FEAT-001");
    }, root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
