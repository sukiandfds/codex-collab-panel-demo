import assert from "node:assert/strict";
import test from "node:test";
import { messagesFromTurns } from "../server/codex-thread-history.mjs";

test("scopes app-server message ids to their turn", () => {
  const messages = messagesFromTurns([
    {
      id: "turn-1",
      startedAt: 100,
      completedAt: 130,
      items: [
        { type: "userMessage", id: "item-1", content: [{ type: "text", text: "First" }] },
        { type: "agentMessage", id: "item-2", phase: "final_answer", text: "Answer one" },
      ],
    },
    {
      id: "turn-2",
      startedAt: 200,
      completedAt: 230,
      items: [
        { type: "userMessage", id: "item-1", content: [{ type: "text", text: "Second" }] },
        { type: "agentMessage", id: "item-2", phase: "final_answer", text: "Answer two" },
      ],
    },
  ]);

  const ids = messages.map((message) => message.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.notEqual(ids[0], ids[2]);
  assert.notEqual(ids[1], ids[3]);
  assert.deepEqual(messages.map((message) => message.turnId), ["turn-1", "turn-1", "turn-2", "turn-2"]);
});
