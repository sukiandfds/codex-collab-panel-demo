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
  assert.equal(tracker.getStatus("thread-1").streamingText, "最终回复");
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
    { label: "命令已完成", detail: "pnpm build:ui", completed: true },
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

test("does not overwrite a confirmed turn when only submit confirmation fails", () => {
  const events = [];
  const tracker = createExecutionTracker({ broadcast: (event) => events.push(event) });

  tracker.markSubmitted("thread-1");
  tracker.handleProtocolMessage({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-new" } },
  });
  tracker.markFailed("thread-1", new Error("turn/start timed out"));

  const status = tracker.getStatus("thread-1");
  assert.equal(status.turnId, "turn-new");
  assert.equal(status.phase, "working");
  assert.equal(status.active, true);
});

test("keeps an authoritative terminal snapshot for clients that missed the final event", () => {
  const tracker = createExecutionTracker({ broadcast: () => {} });
  tracker.markSubmitted("thread-1");
  tracker.handleProtocolMessage({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  });
  tracker.handleProtocolMessage({
    method: "item/started",
    params: { threadId: "thread-1", item: { id: "answer-1", type: "agentMessage", phase: "final_answer" } },
  });
  tracker.handleProtocolMessage({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", itemId: "answer-1", delta: "最终回复" },
  });
  tracker.handleProtocolMessage({
    method: "turn/completed",
    params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } },
  });

  const snapshot = tracker.getStatus("thread-1");
  assert.equal(snapshot.turnId, "turn-1");
  assert.equal(snapshot.phase, "completed");
  assert.equal(snapshot.active, false);
  assert.equal(snapshot.streamingItemId, "");
  assert.equal(snapshot.streamingText, "");
  assert.equal(typeof snapshot.updatedAt, "string");
});

test("keeps one meaningful reasoning summary and drops empty analysis rows", () => {
  const tracker = createExecutionTracker({ broadcast: () => {} });
  tracker.markSubmitted("thread-1");
  tracker.handleProtocolMessage({
    method: "item/started",
    params: { threadId: "thread-1", item: { id: "reasoning-1", type: "reasoning" } },
  });
  assert.equal(tracker.getStatus("thread-1").activities.length, 0);

  tracker.handleProtocolMessage({
    method: "item/reasoning/summaryTextDelta",
    params: { threadId: "thread-1", itemId: "reasoning-1", delta: "正在检查会话加载逻辑" },
  });
  tracker.handleProtocolMessage({
    method: "item/completed",
    params: { threadId: "thread-1", item: { id: "reasoning-1", type: "reasoning" } },
  });

  const activities = tracker.getStatus("thread-1").activities;
  assert.equal(activities.length, 1);
  assert.deepEqual(
    { label: activities[0].label, detail: activities[0].detail, completed: activities[0].completed },
    { label: "分析完成", detail: "正在检查会话加载逻辑", completed: true },
  );
});

test("shows the inner PowerShell command instead of the launcher path", () => {
  const tracker = createExecutionTracker({ broadcast: () => {} });
  tracker.markSubmitted("thread-1");
  tracker.handleProtocolMessage({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      item: {
        id: "command-1",
        type: "commandExecution",
        command: '"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command "pnpm build:ui"',
      },
    },
  });

  assert.equal(tracker.getStatus("thread-1").activities[0].detail, "pnpm build:ui");
});
