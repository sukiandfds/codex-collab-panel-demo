import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactService } from "../server/artifact-service.mjs";
import { createMediaService } from "../server/media-service.mjs";
import {
  createWebOutputService,
  findEdgeBinary,
  isWebOutputRequest,
  validateHtmlFile,
  validatePdfFile,
} from "../server/web-output-service.mjs";

const html = "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style>body{font-family:sans-serif}</style></head><body><h1>Report</h1></body></html>";

const createTemporaryRoot = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-web-output-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
};

const createServices = async (t, renderPdf, options = {}) => {
  const projectRoot = await createTemporaryRoot(t);
  const media = createMediaService({ uploadRoot: path.join(projectRoot, "runtime", "uploads") });
  const artifacts = await createArtifactService({
    stateFile: path.join(projectRoot, "runtime", "artifacts.json"),
    allowedRoot: path.join(projectRoot, "runtime", "agent-artifacts"),
    projectId: "demo",
    media,
    broadcast: () => {},
  });
  t.after(() => artifacts.close());
  const webOutputs = createWebOutputService({
    projectRoot,
    originBaseUrl: "http://127.0.0.1:9360",
    artifacts,
    media,
    renderPdf,
    ...options,
  });
  t.after(() => webOutputs.close());
  return { projectRoot, media, artifacts, webOutputs };
};

test("detects only explicit HTML page output requests", () => {
  assert.equal(isWebOutputRequest("请生成一个响应式 HTML 网页"), true);
  assert.equal(isWebOutputRequest("制作一份项目报告页"), true);
  assert.equal(isWebOutputRequest("当前 HTML 为什么只能下载？"), false);
  assert.equal(isWebOutputRequest("讨论一下页面结构"), false);
});

test("creates a controlled job, publishes HTML and PDF, and serves a sandboxed ticket", async (t) => {
  const renderPdf = async ({ outputFile }) => fs.writeFile(outputFile, "%PDF-1.4\n%%EOF\n", "ascii");
  const { projectRoot, artifacts, webOutputs } = await createServices(t, renderPdf);
  const job = await webOutputs.createJob({ sourceMessageId: "source-message", agentId: "developer" });
  const allowedRoot = path.join(projectRoot, "runtime", "agent-artifacts");
  assert.equal(path.relative(allowedRoot, job.outputDirectory).startsWith(".."), false);
  assert.match(webOutputs.buildAgentInstructions(job), new RegExp(job.htmlFile.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  await fs.writeFile(job.htmlFile, html, "utf8");

  const result = await webOutputs.completeJob({
    job,
    finalMessageId: "agent-message",
    createdByAgent: "developer",
    createdByName: "开发 Agent",
  });
  assert.equal(result.pdfError, "");
  assert.deepEqual(result.artifacts.map((artifact) => artifact.name), ["index.html", "result.pdf"]);
  assert.equal(result.artifacts.every((artifact) => artifact.taskId === job.jobId), true);
  assert.equal(result.artifacts.every((artifact) => artifact.messageId === "agent-message"), true);
  await validatePdfFile(job.pdfFile);

  const previewPath = await webOutputs.previewForArtifact(result.artifacts[0].id);
  assert.match(previewPath, /^\/artifact-preview\/[A-Za-z0-9_-]+$/u);
  assert.equal(previewPath.includes("token"), false);
  const preview = await webOutputs.readPreview(previewPath.split("/").pop());
  assert.equal(preview.content, html);
  assert.match(preview.headers["Content-Security-Policy"], /^sandbox;/u);
  assert.equal(preview.headers["Content-Security-Policy"].includes("allow-scripts"), false);
  assert.equal(preview.headers["Content-Security-Policy"].includes("allow-same-origin"), false);
  assert.equal(artifacts.list({ messageId: "agent-message" }).length, 2);
});

test("keeps valid HTML and does not publish a fake PDF when conversion fails", async (t) => {
  const renderPdf = async ({ outputFile }) => fs.writeFile(outputFile, "not a pdf", "utf8");
  const { artifacts, webOutputs } = await createServices(t, renderPdf);
  const job = await webOutputs.createJob({ sourceMessageId: "source-message", agentId: "developer" });
  await fs.writeFile(job.htmlFile, html, "utf8");
  const result = await webOutputs.completeJob({
    job,
    finalMessageId: "agent-message",
    createdByAgent: "developer",
    createdByName: "开发 Agent",
  });
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].name, "index.html");
  assert.match(result.pdfError, /文件头无效/u);
  assert.equal(artifacts.list({ messageId: "agent-message" }).length, 1);
  await assert.rejects(fs.stat(job.pdfFile), /ENOENT/u);
});

test("rejects invalid HTML and detects the configured Edge binary", async (t) => {
  const root = await createTemporaryRoot(t);
  const invalid = path.join(root, "index.html");
  await fs.writeFile(invalid, "<html><body>No viewport</body></html>", "utf8");
  await assert.rejects(validateHtmlFile(invalid), /viewport/u);
  const fakeEdge = path.join(root, "msedge.exe");
  await fs.writeFile(fakeEdge, "", "utf8");
  assert.equal(await findEdgeBinary(fakeEdge), fakeEdge);
});
