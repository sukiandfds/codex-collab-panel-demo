import assert from "node:assert/strict";
import test from "node:test";
import { buildDiscussionPrompt, mentionedAgentIds, newMentionedAgentIds } from "../server/multi-agent-service.mjs";

const agents = [
  { id: "manager", name: "Manager Agent", aliases: ["Manager"], responsibility: "coordination" },
  { id: "reviewer", name: "Reviewer Agent", aliases: ["Reviewer"], responsibility: "risk review" },
];

test("finds every mentioned Agent in message order", () => {
  assert.deepEqual(
    mentionedAgentIds("Ask @Reviewer Agent, then @Manager Agent", agents),
    ["reviewer", "manager"],
  );
});

test("matches aliases and ignores incomplete or longer names", () => {
  assert.deepEqual(mentionedAgentIds("Ask @Reviewer, then @Manager Agent", agents), ["reviewer", "manager"]);
  assert.deepEqual(mentionedAgentIds("@ReviewerAgent should not match", agents), []);
  assert.deepEqual(mentionedAgentIds("@Manager Agent", [{ ...agents[0], name: "Manager", aliases: [] }, agents[1]]), ["manager"]);
});

test("returns only newly mentioned employees for the current round", () => {
  assert.deepEqual(
    newMentionedAgentIds("Please continue, @Reviewer Agent", agents, new Set(["manager"])),
    ["reviewer"],
  );
  assert.deepEqual(
    newMentionedAgentIds("No handoff needed", agents, new Set(["manager"])),
    [],
  );
});

test("does not awaken an employee twice in the same round", () => {
  assert.deepEqual(
    newMentionedAgentIds("@Manager Agent please revisit this", agents, new Set(["manager", "reviewer"])),
    [],
  );
});

test("discussion prompt contains only the new public room context", () => {
  const prompt = buildDiscussionPrompt({
    agent: agents[1],
    agents,
    messages: [{ type: "human", authorName: "Hans", text: "Check the current plan" }],
  });

  assert.match(prompt, /Check the current plan/u);
  assert.match(prompt, /\[Hans\] Check the current plan/u);
  assert.match(prompt, /@Manager Agent/u);
  assert.match(prompt, /A mentioned employee will continue after you finish/u);
  assert.match(prompt, /only new public group-chat context/u);
  assert.match(prompt, /hidden thinking/u);
});
