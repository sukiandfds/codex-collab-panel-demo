import assert from "node:assert/strict";
import test from "node:test";
import { blocksFromContent, messageFromThreadItem } from "../server/content-blocks.mjs";

const registerMedia = () => null;

test("normalizes slash-prefixed Windows drive paths in markdown images", () => {
  const registered = [];
  const blocks = blocksFromContent("![preview](/D:/project/images/01.jpg)", (file) => {
    registered.push(file);
    return { url: "/api/media/image-01" };
  });

  assert.deepEqual(registered, ["D:/project/images/01.jpg"]);
  assert.equal(blocks[0].text, "![preview](/api/media/image-01)");
});

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

for (const heading of ["## My request:", "## My request for Codex:"]) {
  test(`removes the user attachment envelope for ${heading}`, () => {
    const message = messageFromThreadItem({
      id: `attachment-${heading}`,
      type: "userMessage",
      content: [
        "# Files mentioned by the user:",
        "",
        "## sample.png: C:\\Users\\sample.png",
        "",
        heading,
        "",
        "Show these images in a compact gallery.",
      ].join("\n"),
    }, registerMedia);

    assert.equal(message.text, "Show these images in a compact gallery.");
    assert.equal(message.blocks.length, 1);
    assert.equal(message.blocks[0].text, "Show these images in a compact gallery.");
  });
}
