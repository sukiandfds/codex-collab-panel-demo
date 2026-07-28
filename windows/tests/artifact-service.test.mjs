import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactService } from "../server/artifact-service.mjs";
import { createGroupRoomStore } from "../server/group-room-store.mjs";
import { createMediaService } from "../server/media-service.mjs";

const createTemporaryRoot = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-artifacts-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
};

test("publishes controlled files, keeps versions, reviews, emits events, and restores metadata", async (t) => {
  const root = await createTemporaryRoot(t);
  const allowedRoot = path.join(root, "agent-artifacts");
  const stateFile = path.join(root, "artifacts.json");
  await fs.mkdir(allowedRoot, { recursive: true });
  await fs.writeFile(path.join(allowedRoot, "report.md"), "# First version\n", "utf8");
  await fs.writeFile(path.join(allowedRoot, "report-v2.md"), "# Second version\n", "utf8");

  const events = [];
  const media = createMediaService({ uploadRoot: path.join(root, "uploads") });
  const service = await createArtifactService({
    stateFile,
    allowedRoot,
    projectId: "demo",
    media,
    broadcast: (event) => events.push(event),
  });

  const first = await service.publish({
    messageId: "message-1",
    createdByAgent: "developer",
    createdByName: "开发 Agent",
    relativePath: "report.md",
  });
  assert.equal(first.version, 1);
  assert.equal(first.previewType, "markdown");
  assert.equal(first.status, "ready");
  assert.equal(first.versions.length, 1);
  assert.equal(JSON.stringify(first).includes(path.resolve(root)), false);

  const rejected = await service.review(first.id, "reject", "请补充证据", "Hans");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reviewDecision, "reject");
  assert.equal(rejected.reviewNote, "请补充证据");

  const second = await service.publish({
    artifactId: first.id,
    messageId: "message-1",
    createdByAgent: "developer",
    createdByName: "开发 Agent",
    relativePath: "report-v2.md",
  });
  assert.equal(second.version, 2);
  assert.equal(second.versions.length, 2);
  assert.equal(second.versions[0].status, "superseded");
  assert.equal(second.versions[1].status, "ready");

  const approved = await service.review(first.id, "approve", "", "Hans");
  assert.equal(approved.status, "ready");
  assert.equal(approved.reviewDecision, "approve");
  assert.deepEqual(events.map((event) => event.type), [
    "artifact.ready",
    "artifact.reviewed",
    "artifact.ready",
    "artifact.reviewed",
  ]);
  await service.close();

  const restoredMedia = createMediaService({ uploadRoot: path.join(root, "uploads") });
  const restored = await createArtifactService({
    stateFile,
    allowedRoot,
    projectId: "demo",
    media: restoredMedia,
    broadcast: () => {},
  });
  assert.equal(restored.get(first.id).version, 2);
  assert.equal(restored.list({ messageId: "message-1" }).length, 1);
  await restored.close();
});

test("publishes an existing mediaId and rejects absolute or escaping paths", async (t) => {
  const root = await createTemporaryRoot(t);
  const allowedRoot = path.join(root, "agent-artifacts");
  const externalFile = path.join(root, "uploaded.txt");
  await fs.mkdir(allowedRoot, { recursive: true });
  await fs.writeFile(externalFile, "controlled media", "utf8");
  const media = createMediaService({ uploadRoot: path.join(root, "uploads") });
  const registered = media.register(externalFile);
  const service = await createArtifactService({
    stateFile: path.join(root, "artifacts.json"),
    allowedRoot,
    projectId: "demo",
    media,
    broadcast: () => {},
  });

  const artifact = await service.publish({
    createdByAgent: "developer",
    createdByName: "开发 Agent",
    mediaId: registered.id,
  });
  assert.equal(artifact.name, "uploaded.txt");
  assert.equal(artifact.size, Buffer.byteLength("controlled media"));
  await assert.rejects(
    service.publish({ createdByAgent: "developer", relativePath: externalFile }),
    /相对路径/u,
  );
  await assert.rejects(
    service.publish({ createdByAgent: "developer", relativePath: "..\\uploaded.txt" }),
    /超出允许目录/u,
  );
  await service.close();
});

test("group messages persist artifact references and broadcast updates", async (t) => {
  const root = await createTemporaryRoot(t);
  const stateFile = path.join(root, "group-room.json");
  const events = [];
  const room = await createGroupRoomStore({ stateFile, project: "demo", broadcast: (event) => events.push(event) });
  const message = await room.addMessage({ authorId: "member-1", authorName: "Hans", text: "交付文件" });
  await room.attachArtifact(message.id, "artifact-1");
  await room.attachArtifact(message.id, "artifact-1");
  assert.deepEqual(room.getMessage(message.id).artifactIds, ["artifact-1"]);
  assert.equal(events.filter((event) => event.type === "group_message_updated").length, 1);
  await room.close();

  const restored = await createGroupRoomStore({ stateFile, project: "demo", broadcast: () => {} });
  assert.deepEqual(restored.getMessage(message.id).artifactIds, ["artifact-1"]);
  await restored.close();
});
