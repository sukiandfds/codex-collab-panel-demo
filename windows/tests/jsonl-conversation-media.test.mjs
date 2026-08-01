import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJsonlConversationStore } from "../server/jsonl-conversation-store.mjs";

test("attaches tool preview images to the following final assistant message", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-jsonl-media-"));
  const projectRoot = path.join(root, "project");
  const threadId = "00000000-0000-4000-8000-000000000001";
  const file = path.join(root, `rollout-${threadId}.jsonl`);
  const lines = [
    { type: "session_meta", payload: { id: threadId, cwd: projectRoot, title: "Media test" } },
    { type: "response_item", payload: { type: "custom_tool_call_output", output: [
      { type: "input_text", text: "Script completed" },
      { type: "input_image", image_url: "data:image/png;base64,AAAA" },
    ] } },
    { timestamp: "2026-08-01T09:38:20.165Z", type: "response_item", payload: { type: "message", role: "assistant", phase: "final_answer", content: [
      { type: "output_text", text: "Here are the images." },
    ] } },
  ];
  await writeFile(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");

  const store = createJsonlConversationStore({
    sessionRoot: root,
    projectRoot,
    registerMedia: () => null,
    onChange: () => {},
  });
  try {
    const session = await store.findSession(threadId);
    assert.equal(session.messages.length, 1);
    assert.deepEqual(session.messages[0].blocks.map((block) => block.type), ["markdown", "image"]);
    assert.equal(session.messages[0].blocks[1].source, "data:image/png;base64,AAAA");
    assert.equal(session.messages[0].createdAt, "2026-08-01T09:38:20.165Z");
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
