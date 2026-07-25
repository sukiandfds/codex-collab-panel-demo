import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { inputFromAttachments } from "../server/app-server-conversation-store.mjs";
import { createMediaService } from "../server/media-service.mjs";

test("maps uploaded files to Codex native input types", () => {
  const input = inputFromAttachments("检查附件", [
    { name: "screen.png", mimeType: "image/png", path: "C:\\uploads\\screen.png" },
    { name: "voice.m4a", mimeType: "audio/mp4", path: "C:\\uploads\\voice.m4a" },
    { name: "notes.pdf", mimeType: "application/pdf", path: "C:\\uploads\\notes.pdf" },
  ]);

  assert.deepEqual(input, [
    { type: "text", text: "检查附件", text_elements: [] },
    { type: "localImage", path: "C:\\uploads\\screen.png" },
    { type: "localAudio", path: "C:\\uploads\\voice.m4a" },
    { type: "mention", name: "notes.pdf", path: "C:\\uploads\\notes.pdf" },
  ]);
});

test("stores uploads inside the configured runtime directory and restores them", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-collab-upload-"));
  try {
    const media = createMediaService({ uploadRoot: root });
    const uploaded = await media.upload(Readable.from([Buffer.from("hello")]), { name: "notes.txt", mimeType: "text/plain" });
    const [entry] = media.resolveMany([uploaded.id]);
    assert.equal(entry.name, "notes.txt");
    assert.equal(await fs.readFile(entry.path, "utf8"), "hello");

    const restored = createMediaService({ uploadRoot: root });
    await restored.restoreUploads();
    assert.equal(restored.resolveMany([uploaded.id])[0].name, "notes.txt");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("reuses the same stored upload for identical retry content", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-collab-upload-"));
  try {
    const media = createMediaService({ uploadRoot: root });
    const first = await media.upload(Readable.from([Buffer.from("same content")]), { name: "notes.txt", mimeType: "text/plain" });
    const retried = await media.upload(Readable.from([Buffer.from("same content")]), { name: "notes.txt", mimeType: "text/plain" });
    const files = await fs.readdir(root);

    assert.equal(retried.id, first.id);
    assert.equal(files.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("drops a media entry after its uploaded file is removed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-collab-upload-"));
  try {
    const media = createMediaService({ uploadRoot: root });
    const uploaded = await media.upload(Readable.from([Buffer.from("temporary")]), { name: "temp.txt", mimeType: "text/plain" });
    const [entry] = media.resolveMany([uploaded.id]);
    await fs.rm(entry.path, { force: true });

    assert.deepEqual(media.resolveMany([uploaded.id]), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
