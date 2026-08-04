import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { modelForImageResolution } from "../server/image-generation/image-contract.mjs";
import { createImageGenerationRunStore } from "../server/image-generation/image-generation-run-store.mjs";
import { createWebImageGenerationService } from "../server/image-generation/web-image-generation-service.mjs";
import { intentForWebImageMessage } from "../server/image-generation/web-image-intent.mjs";

const temporaryRoot = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "negus-web-image-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
};

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for image generation test state");
};

test("recognizes explicit image requests without intercepting feature discussion", () => {
  assert.deepEqual(intentForWebImageMessage({
    text: "请生成一张 16:9、2K 的中国网红直播图片",
  }), {
    operation: "generate",
    prompt: "一张 16:9、2K 的中国网红直播图片",
    resolution: "2K",
    size: "16:9",
    n: 1,
    referenceIds: [],
  });
  assert.equal(intentForWebImageMessage({ text: "我们需要开发生图功能和自动化工作台" }), null);
  assert.equal(modelForImageResolution("4K"), "gpt-image-2-4k");
});

test("uses uploaded images as references for explicit edit requests", () => {
  const intent = intentForWebImageMessage({
    text: "请根据这张图片改图，换成夜景",
    attachments: [{ id: "media-1", mimeType: "image/png" }],
  });
  assert.equal(intent.operation, "edit");
  assert.deepEqual(intent.referenceIds, ["media-1"]);
});

test("runs web image generation asynchronously and exposes persistent conversation media", async (t) => {
  const root = await temporaryRoot(t);
  const output = path.join(root, "result.png");
  await fs.writeFile(output, Buffer.from([1, 2, 3]));
  const registered = [];
  const media = {
    register: (file, overrides) => {
      registered.push({ file, overrides });
      return {
        id: "media-result",
        name: path.basename(file),
        mimeType: "image/png",
        url: "/api/media/media-result?w=2560&h=1440",
        width: 2560,
        height: 1440,
      };
    },
  };
  const runStore = createImageGenerationRunStore({
    stateFile: path.join(root, "runs.json"),
    media,
  });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let providerRequest;
  const client = {
    generate: async (request) => {
      providerRequest = request;
      await gate;
      return {
        taskId: "provider-task",
        model: request.model,
        outputs: [{ path: output, mimeType: "image/png", width: 2560, height: 1440, bytes: 3 }],
      };
    },
  };
  const statuses = [];
  const events = [];
  const service = createWebImageGenerationService({
    projectRoot: root,
    runStore,
    execution: { publishStatus: (threadId, status) => statuses.push({ threadId, ...status }) },
    broadcast: (event) => events.push(event),
    client,
    createId: () => "fixed",
  });
  const intent = intentForWebImageMessage({ text: "生成一张 16:9 2K 的直播图片" });
  const accepted = await service.start({
    threadId: "thread-1",
    submissionId: "submission-1",
    text: "生成一张 16:9 2K 的直播图片",
    attachments: [],
    createdAt: "2026-08-04T09:00:00.000Z",
    intent,
  });

  assert.equal(accepted.status, "inProgress");
  assert.equal(service.isActive("thread-1"), true);
  await waitFor(() => providerRequest);
  assert.equal(providerRequest.model, "gpt-image-2-2k");
  assert.equal(providerRequest.size, "16:9");
  assert.equal(providerRequest.n, 1);
  assert.equal(providerRequest.outputDirectory, path.join(root, "runtime", "generated-images", "img-fixed"));
  const runningMessages = await runStore.list("thread-1");
  assert.match(runningMessages[1].text, /正在生成图片/u);

  release();
  await waitFor(async () => (await runStore.get("img-fixed"))?.status === "succeeded");
  assert.equal(service.isActive("thread-1"), false);
  const messages = await runStore.list("thread-1");
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1].blocks.map((block) => block.type), ["markdown", "image"]);
  assert.equal(messages[1].blocks[1].source, "/api/media/media-result?w=2560&h=1440");
  assert.equal("path" in messages[1].blocks[1], false);
  assert.equal(registered.length, 1);
  assert.ok(statuses.some((status) => status.phase === "tool" && status.active));
  assert.ok(statuses.some((status) => status.phase === "completed" && !status.active));
  assert.ok(events.filter((event) => event.type === "sessions_changed").length >= 2);
});
