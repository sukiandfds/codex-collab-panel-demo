import assert from "node:assert/strict";
import test from "node:test";
import { buildDiscussionPrompt, mentionedAgentIds } from "../server/multi-agent-service.mjs";

const agents = [
  { id: "manager", name: "项目经理 Agent", responsibility: "协调与总结" },
  { id: "reviewer", name: "审查 Agent", responsibility: "审查风险" },
];

test("finds every mentioned Agent in message order", () => {
  assert.deepEqual(
    mentionedAgentIds("请 @审查 Agent 看完后交给 @项目经理 Agent", agents),
    ["reviewer", "manager"],
  );
});

test("discussion prompt contains the request and recent room context", () => {
  const prompt = buildDiscussionPrompt({
    agent: agents[1],
    mode: "discussion",
    requestText: "检查当前方案",
    snapshot: {
      agents,
      messages: [{ type: "human", authorName: "Hans", text: "检查当前方案" }],
    },
    followUp: false,
  });

  assert.match(prompt, /检查当前方案/u);
  assert.match(prompt, /\[Hans\] 检查当前方案/u);
  assert.match(prompt, /@项目经理 Agent/u);
  assert.match(prompt, /只分析和讨论，不修改文件/u);
});
