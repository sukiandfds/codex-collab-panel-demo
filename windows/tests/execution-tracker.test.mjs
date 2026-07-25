import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionTracker } from "../server/execution-tracker.mjs";

test("streams final answers but keeps commentary updates complete", () => {
  const events = [];
  const tracker = createExecutionTracker({ broadcast: (event) => events.push(event) });

  tracker.markSubmitted("thread-1");
  tracker.handleProtocolMessage({
    method: "item/started",
    params: { threadId: "thread-1", item: { id: "commentary-1", type: "agentMessage", phase: "commentary" } },
  });
  tracker.handleProtocolMessage({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", itemId: "commentary-1", delta: "分析中" },
  });
  tracker.handleProtocolMessage({
    method: "item/completed",
    params: { threadId: "thread-1", item: { id: "commentary-1", type: "agentMessage", phase: "commentary", text: "已经完成分析" } },
  });
  tracker.handleProtocolMessage({
    method: "item/started",
    params: { threadId: "thread-1", item: { id: "answer-1", type: "agentMessage", phase: "final_answer" } },
  });
  tracker.handleProtocolMessage({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", itemId: "answer-1", delta: "最终回复" },
  });

  assert.equal(events.some((event) => event.type === "assistant_delta" && event.itemId === "commentary-1"), false);
  assert.equal(events.some((event) => event.type === "assistant_commentary" && event.text === "已经完成分析"), true);
  assert.equal(events.some((event) => event.type === "assistant_delta" && event.itemId === "answer-1"), true);
  assert.equal(tracker.getStatus("thread-1").commentary, "已经完成分析");
  assert.equal(tracker.getStatus("thread-1").activities.at(-1).label, "已经完成分析");
});

test("tracks the active turn id and completed tool activity", () => {
  const tracker = createExecutionTracker({ broadcast: () => {} });
  tracker.markSubmitted("thread-1");
  tracker.handleProtocolMessage({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  });
  tracker.handleProtocolMessage({
    method: "item/started",
    params: { threadId: "thread-1", item: { id: "command-1", type: "commandExecution", command: "pnpm build:ui" } },
  });
  tracker.handleProtocolMessage({
    method: "item/completed",
    params: { threadId: "thread-1", item: { id: "command-1", type: "commandExecution", command: "pnpm build:ui" } },
  });

  const status = tracker.getStatus("thread-1");
  assert.equal(status.turnId, "turn-1");
  assert.deepEqual(status.activities.map(({ label, detail, completed }) => ({ label, detail, completed })), [
    { label: "已运行命令", detail: "pnpm build:ui", completed: true },
  ]);
});

test("resets startedAt for a new turn", async () => {
  const tracker = createExecutionTracker({ broadcast: () => {} });
  tracker.markSubmitted("thread-1");
  const firstStartedAt = tracker.getStatus("thread-1").startedAt;
  tracker.handleProtocolMessage({
    method: "turn/completed",
    params: { threadId: "thread-1", turn: { status: "completed" } },
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  tracker.markSubmitted("thread-1");

  assert.notEqual(tracker.getStatus("thread-1").startedAt, firstStartedAt);
});
