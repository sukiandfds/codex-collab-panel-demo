import assert from "node:assert/strict";
import test from "node:test";
import { blocksFromContent } from "../server/content-blocks.mjs";

const registerMedia = () => null;

test("removes standalone Codex UI directives from visible message text", () => {
  const blocks = blocksFromContent([
    "提交已经推送。",
    "::git-stage{cwd=\"D:\\\\project\"}",
    "::git-commit{cwd=\"D:\\\\project\"}",
    "::git-push{cwd=\"D:\\\\project\" branch=\"codex/demo\"}",
  ].join("\n"), registerMedia);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, "提交已经推送。");
});

test("preserves directive examples inside fenced code blocks", () => {
  const source = [
    "示例：",
    "```text",
    "::git-push{cwd=\"D:\\\\project\" branch=\"codex/demo\"}",
    "```",
  ].join("\n");

  const blocks = blocksFromContent(source, registerMedia);
  assert.equal(blocks[0].text, source);
});
