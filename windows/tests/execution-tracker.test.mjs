import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
    params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed", durationMs: 12345 } },
  });

  const snapshot = tracker.getStatus("thread-1");
  assert.equal(snapshot.turnId, "turn-1");
  assert.equal(snapshot.phase, "completed");
  assert.equal(snapshot.active, false);
  assert.equal(snapshot.streamingItemId, "");
  assert.equal(snapshot.streamingText, "");
  assert.equal(snapshot.durationMs, 12345);
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

test("clears a stale active state when the authoritative thread is idle", () => {
  const tracker = createExecutionTracker({ broadcast: () => {} });
  tracker.markSubmitted("thread-1");
  tracker.handleProtocolMessage({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  });

  tracker.reconcile("thread-1", { type: "idle" });

  assert.equal(tracker.getStatus("thread-1").active, false);
  assert.equal(tracker.getStatus("thread-1").phase, "idle");
});

test("reports an uncertain state when app-server cannot confirm an active thread", () => {
  const tracker = createExecutionTracker({ broadcast: () => {} });
  tracker.markSubmitted("thread-1");
  tracker.handleProtocolMessage({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  });

  tracker.reconcile("thread-1", { type: "notLoaded" });

  const status = tracker.getStatus("thread-1");
  assert.equal(status.active, true);
  assert.equal(status.phase, "unknown");
  assert.equal(status.label, "状态暂时无法确认");
  assert.equal(status.turnId, "turn-1");
});

test("restores explicit approval state from the authoritative thread", () => {
  const tracker = createExecutionTracker({ broadcast: () => {} });
  tracker.markSubmitted("thread-1");

  tracker.reconcile("thread-1", { type: "active", activeFlags: ["waitingOnApproval"] });

  assert.equal(tracker.getStatus("thread-1").phase, "waitingOnApproval");
  assert.equal(tracker.getStatus("thread-1").label, "需要在电脑端确认");
});

test("shows app-server recovery and marks the interrupted turn after recovery", () => {
  const events = [];
  const tracker = createExecutionTracker({ broadcast: (event) => events.push(event) });
  tracker.markSubmitted("thread-1");
  tracker.handleProtocolMessage({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  });
  const lastEventAt = tracker.getStatus("thread-1").lastEventAt;

  tracker.handleHealthState({ phase: "checking", threadId: "thread-1" });
  assert.equal(tracker.getStatus("thread-1").label, "暂时没有新输出，正在确认状态");
  assert.equal(tracker.getStatus("thread-1").lastEventAt, lastEventAt);
  assert.equal(typeof tracker.getStatus("thread-1").lastProbeAt, "string");

  tracker.handleHealthState({ phase: "recovering", threadId: "thread-1" });
  assert.equal(tracker.getStatus("thread-1").phase, "recovering");
  assert.equal(tracker.getStatus("thread-1").active, true);

  tracker.handleHealthState({ phase: "recovered", threadId: "thread-1" });
  assert.equal(tracker.getStatus("thread-1").phase, "interrupted");
  assert.equal(tracker.getStatus("thread-1").active, false);
  assert.equal(events.some((event) => event.type === "sessions_changed"), true);
});

test("reports an app-server recovery failure without leaving the page active", () => {
  const tracker = createExecutionTracker({ broadcast: () => {} });
  tracker.markSubmitted("thread-1");

  tracker.handleHealthState({ phase: "failed", threadId: "thread-1", error: new Error("restart failed") });

  assert.equal(tracker.getStatus("thread-1").phase, "systemError");
  assert.equal(tracker.getStatus("thread-1").label, "Codex 自动恢复失败");
  assert.equal(tracker.getStatus("thread-1").active, false);
});

test("distinguishes a completed reply from a completed turn", () => {
  const tracker = createExecutionTracker({ broadcast: () => {} });
  tracker.markSubmitted("thread-1");
  tracker.handleProtocolMessage({
    method: "turn/started",
    params: { threadId: "thread-1", turn: { id: "turn-1" } },
  });
  tracker.handleProtocolMessage({
    method: "item/completed",
    params: {
      threadId: "thread-1",
      item: { id: "answer-1", type: "agentMessage", phase: "final_answer", text: "Done" },
    },
  });

  assert.equal(tracker.getStatus("thread-1").phase, "finalizing");
  assert.equal(tracker.getStatus("thread-1").label, "回复已完成，正在收尾");
  assert.equal(tracker.getStatus("thread-1").active, true);

  tracker.handleHealthState({
    phase: "authoritative",
    threadId: "thread-1",
    status: { type: "idle" },
    finalAnswerCompleted: true,
  });
  assert.equal(tracker.getStatus("thread-1").phase, "completed");
  assert.equal(tracker.getStatus("thread-1").active, false);
});

test("restores an unfinished persisted run as interrupted", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "execution-tracker-"));
  const stateFile = path.join(directory, "runs.json");
  try {
    const tracker = createExecutionTracker({ broadcast: () => {}, stateFile });
    tracker.markSubmitted("thread-1");
    tracker.handleProtocolMessage({
      method: "turn/started",
      params: { threadId: "thread-1", turn: { id: "turn-1" } },
    });
    await tracker.close();

    const restored = createExecutionTracker({ broadcast: () => {}, stateFile });
    assert.equal(restored.getStatus("thread-1").phase, "interrupted");
    assert.equal(restored.getStatus("thread-1").active, false);
    assert.equal(restored.getStatus("thread-1").turnId, "turn-1");
    await restored.close();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
