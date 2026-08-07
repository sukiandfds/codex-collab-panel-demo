import assert from "node:assert/strict";
import test from "node:test";
import { buildDiscussionPrompt, mentionedAgentIds } from "../server/multi-agent-service.mjs";

const agents = [
  { id: "manager", name: "Manager Agent", responsibility: "coordination" },
  { id: "reviewer", name: "Reviewer Agent", responsibility: "risk review" },
];

test("finds every mentioned Agent in message order", () => {
  assert.deepEqual(
    mentionedAgentIds("Ask @Reviewer Agent, then @Manager Agent", agents),
    ["reviewer", "manager"],
  );
});

test("discussion prompt contains only the new public room context", () => {
  const prompt = buildDiscussionPrompt({
    agent: agents[1],
    agents,
    mode: "discussion",
    messages: [{ type: "human", authorName: "Hans", text: "Check the current plan" }],
  });

  assert.match(prompt, /Check the current plan/u);
  assert.match(prompt, /\[Hans\] Check the current plan/u);
  assert.match(prompt, /@Manager Agent/u);
  assert.match(prompt, /Analyze and discuss only/u);
  assert.match(prompt, /only new public group-chat context/u);
  assert.match(prompt, /hidden thinking/u);
});
