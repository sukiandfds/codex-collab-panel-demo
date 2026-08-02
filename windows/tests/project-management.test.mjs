import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readProjectManagement } from "../server/project-management-store.mjs";
import { createRequestHandler } from "../server/request-handler.mjs";
import { createStaticFileServer } from "../server/static-files.mjs";

const writeFixture = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-project-management-"));
  const dataRoot = path.join(root, "docs", "project-management");
  const itemRoot = path.join(dataRoot, "items", "PM-001");
  await fs.mkdir(itemRoot, { recursive: true });
  await fs.writeFile(path.join(dataRoot, "PROJECT.md"), [
    "---",
    "document_type: project_management_project",
    "project_id: demo",
    "title: Demo 项目",
    "status: active",
    "last_updated: 2026-08-02 15:30 +08:00",
    "---",
    "# Demo 项目",
    "## 项目目标",
    "让用户快速看到真实进度。",
    "## 当前阶段",
    "M1 数据闭环。",
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(dataRoot, "INDEX.md"), [
    "---",
    "document_type: project_management_index",
    "---",
    "# 项目管理目录",
    "## 当前计划",
    "- `PM-001`",
    "## 当前进行中",
    "- `PM-001`",
    "## 条目目录",
    "| 条目编号 | 类型 | 分类 | 文件夹 | 排序 |",
    "| --- | --- | --- | --- | --- |",
    "| `PM-001` | feature | development | `items/PM-001/` | 1 |",
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(itemRoot, "item.md"), [
    "---",
    "id: PM-001",
    "type: feature",
    "title: 独立项目管理",
    "category: development",
    "priority: P1",
    "status: in_progress",
    "updated_at: 2026-08-02 15:30 +08:00",
    "related: []",
    "source: docs/source.md",
    "---",
    "# 独立项目管理",
    "## 用户原话",
    "不要和原来的文件混在一起。",
    "## 助手初步理解",
    "建立独立的数据源和维护边界。",
    "## 简短摘要",
    "把项目进度组织成可扫描的工作项。",
    "## 具体内容",
    "使用场景：查看当前计划。",
    "## 预计效果",
    "用户先看摘要，再按需打开详情。",
    "## 当前证据",
    "- docs/source.md",
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(itemRoot, "updates.md"), [
    "# 更新记录",
    "### 2026-08-02 15:30 +08:00",
    "- 状态：in_progress",
    "- 本次更新：建立独立项目管理数据源。",
    "- 用户影响：首屏只显示摘要字段。",
    "- 证据：docs/project-management/INDEX.md",
  ].join("\n"), "utf8");
  return root;
};

const createFixtureHandler = (projectRoot) => {
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
    conversations: { listModels: async () => [], listSessions: async () => [] },
    execution: {},
    media: {},
    realtime: {},
    contextManagement: {},
    groupRoom: { snapshot: () => ({ room: {}, messages: [], agents: [], members: [] }) },
    multiAgent: {},
    artifacts: { list: () => [] },
    webOutputs: {},
    readWebVersion: async () => ({ buildId: "test", builtAt: "2026-08-02T00:00:00.000Z" }),
    serveStatic,
  });
};

test("reads the independent project-management directory", async () => {
  const root = await writeFixture();
  try {
    const document = await readProjectManagement({ project: "demo", projectRoot: root });
    assert.equal(document.project.title, "Demo 项目");
    assert.match(document.project.updatedAt, /^2026-08-02T07:30:00\.000Z$/u);
    assert.deepEqual(document.plan.map((entry) => entry.id), ["PM-001"]);
    assert.deepEqual(document.inProgress.map((entry) => entry.id), ["PM-001"]);
    assert.equal(document.entries[0].summary, "把项目进度组织成可扫描的工作项。");
    assert.equal(document.entries[0].priority, "P1");
    assert.match(document.entries[0].updatedAt, /^2026-08-02T07:30:00\.000Z$/u);
    assert.equal(document.entries[0].updates[0].change, "建立独立项目管理数据源。");
    assert.equal(document.entries[0].userQuote, undefined);
    assert.equal(document.source, "docs/project-management");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("serves project-management data through its separate API", async () => {
  const root = await writeFixture();
  const server = http.createServer(createFixtureHandler(root));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/project-management?token=test-token`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.entries[0].id, "PM-001");
    assert.equal(payload.entries[0].concreteContent, undefined);
    assert.ok(!Object.hasOwn(payload, "markdown"));
    const detailResponse = await fetch(`http://127.0.0.1:${address.port}/api/project-management/entries/PM-001?token=test-token`);
    const detail = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detail.concreteContent, "使用场景：查看当前计划。");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("maps the clean progress path to the independent page", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-project-management-static-"));
  await fs.writeFile(path.join(root, "project-management.html"), "project-management-page", "utf8");
  const staticServer = createStaticFileServer(root);
  const server = http.createServer((request, response) => staticServer(
    new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`),
    response,
  ));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/progress?token=test-token`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "project-management-page");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});
