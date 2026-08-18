import assert from "node:assert/strict";
import test from "node:test";
import { createProjectStatusService } from "../server/project-status-service.mjs";

const identity = { projectId: "project:personal:test", name: "测试项目", root: "D:\\test" };
const waitFor = async (read, predicate) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for project status");
};

const createActivityIndex = ({ activities, activeByRoom = {}, archivedThreadIds = [], reads = [] }) => ({
  resolve: () => identity,
  read: async ({ date, timeZoneOffsetMinutes }) => {
    reads.push({ date, timeZoneOffsetMinutes });
    return {
      activeAgentCount: Object.values(activeByRoom).reduce((sum, value) => sum + Number(value || 0), 0),
      activeAgentCountByRoom: { ...activeByRoom },
      archivedThreadIds: [...archivedThreadIds],
      activities: [...activities],
    };
  },
});

const noManagement = async () => ({ plan: [], inProgress: [] });

test("does not summarize a user message and creates an event after the assistant completes", async () => {
  const activities = [
    {
      id: "conversation:thread-one:user-one",
      messageId: "user-one",
      kind: "conversation_message",
      threadId: "thread-one",
      title: "状态助手讨论",
      role: "user",
      text: "开发项目状态助手",
      occurredAt: "2026-08-17T02:00:00.000Z",
    },
  ];
  const calls = [];
  const service = createProjectStatusService({
    activityIndex: createActivityIndex({ activities }),
    readManagement: noManagement,
    now: () => Date.parse("2026-08-17T04:00:00.000Z"),
    summarize: async (input) => {
      calls.push(input);
      return {
        todayProgress: ["开发状态助手", "整理会话事件"],
        events: [{
          sourceId: "conversation:thread-one",
          mode: "new",
          title: "开发状态助手",
          summary: "完成项目状态助手初版。",
          startMessageId: "user-one",
        }],
      };
    },
  });
  const read = () => service.get({ projectId: identity.projectId });

  read();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls.length, 0);

  activities.push({
    id: "conversation:thread-one:assistant-one",
    messageId: "assistant-one",
    kind: "conversation_message",
    threadId: "thread-one",
    title: "状态助手讨论",
    role: "assistant",
    text: "初版已经完成。",
    occurredAt: "2026-08-17T02:01:00.000Z",
  });
  const ready = await waitFor(read, (value) => value.todayProgress.length === 2);

  assert.deepEqual(ready.todayProgress, ["开发状态助手", "整理会话事件"]);
  assert.equal(ready.dayKey, "2026-08-17");
  assert.equal(ready.conversations[0].id, "conversation:thread-one");
  assert.equal(ready.conversations[0].events[0].startMessageId, "user-one");
  assert.deepEqual(calls[0].messages.map((message) => message.messageId), ["user-one", "assistant-one"]);
});

test("waits for all group agents and summarizes only messages added after the previous event", async () => {
  const activeByRoom = { "room-one": 1 };
  const activities = [
    {
      id: "group:room-one:user-one",
      messageId: "user-one",
      kind: "group_message",
      roomId: "room-one",
      title: "项目群",
      role: "user",
      text: "检查群聊",
      occurredAt: "2026-08-17T03:00:00.000Z",
    },
    {
      id: "group:room-one:assistant-one",
      messageId: "assistant-one",
      kind: "group_message",
      roomId: "room-one",
      title: "项目群",
      role: "assistant",
      text: "一个员工已完成",
      occurredAt: "2026-08-17T03:01:00.000Z",
    },
  ];
  const calls = [];
  const service = createProjectStatusService({
    activityIndex: createActivityIndex({ activities, activeByRoom }),
    readManagement: noManagement,
    now: () => Date.parse("2026-08-17T04:00:00.000Z"),
    summarize: async (input) => {
      calls.push(input);
      return {
        todayProgress: ["检查群聊"],
        events: [{
          sourceId: "group:room-one",
          mode: calls.length === 1 ? "new" : "continue",
          title: "检查群聊",
          summary: calls.length === 1 ? "完成第一轮检查。" : "完成第二轮检查。",
          startMessageId: calls.length === 1 ? "user-one" : "user-two",
        }],
      };
    },
  });
  const read = () => service.get({ projectId: identity.projectId });

  read();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls.length, 0);

  activeByRoom["room-one"] = 0;
  await waitFor(read, (value) => value.conversations.length === 1);
  assert.equal(calls.length, 1);

  activities.push({
    id: "group:room-one:user-two",
    messageId: "user-two",
    kind: "group_message",
    roomId: "room-one",
    title: "项目群",
    role: "user",
    text: "继续检查",
    occurredAt: "2026-08-17T03:02:00.000Z",
  });
  read();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls.length, 1);

  activities.push({
    id: "group:room-one:assistant-two",
    messageId: "assistant-two",
    kind: "group_message",
    roomId: "room-one",
    title: "项目群",
    role: "assistant",
    text: "第二轮已完成",
    occurredAt: "2026-08-17T03:03:00.000Z",
  });
  const updated = await waitFor(read, (value) => value.conversations[0]?.events[0]?.summary === "完成第二轮检查。");

  assert.deepEqual(calls[1].messages.map((message) => message.messageId), ["user-two", "assistant-two"]);
  assert.equal(updated.conversations[0].events.length, 1);
  assert.equal(updated.conversations[0].events[0].startMessageId, "user-one");
});

test("keeps multiple events returned for the same conversation", async () => {
  const activities = [
    ["user-one", "user", "开发状态窗口", "2026-08-17T02:00:00.000Z"],
    ["assistant-one", "assistant", "状态窗口已完成", "2026-08-17T02:01:00.000Z"],
    ["user-two", "user", "修复定位功能", "2026-08-17T02:02:00.000Z"],
    ["assistant-two", "assistant", "定位功能已修复", "2026-08-17T02:03:00.000Z"],
  ].map(([messageId, role, text, occurredAt]) => ({
    id: `conversation:thread-one:${messageId}`,
    messageId,
    kind: "conversation_message",
    threadId: "thread-one",
    title: "状态助手讨论",
    role,
    text,
    occurredAt,
  }));
  const service = createProjectStatusService({
    activityIndex: createActivityIndex({ activities }),
    readManagement: noManagement,
    now: () => Date.parse("2026-08-17T04:00:00.000Z"),
    summarize: async () => ({
      todayProgress: ["开发状态窗口", "修复定位功能"],
      events: [
        { sourceId: "conversation:thread-one", mode: "new", title: "开发状态窗口", summary: "状态窗口已完成。", startMessageId: "user-one" },
        { sourceId: "conversation:thread-one", mode: "new", title: "修复定位功能", summary: "定位功能已修复。", startMessageId: "user-two" },
      ],
    }),
  });
  const read = () => service.get({ projectId: identity.projectId });
  const ready = await waitFor(read, (value) => value.conversations[0]?.events.length === 2);

  assert.deepEqual(ready.conversations[0].events.map((event) => event.startMessageId), ["user-one", "user-two"]);
  assert.deepEqual(ready.conversations[0].events.map((event) => event.updatedAt), [
    "2026-08-17T02:01:00.000Z",
    "2026-08-17T02:03:00.000Z",
  ]);
});

test("removes an archived conversation even when it was the latest source", async () => {
  const archivedThreadIds = [];
  const activities = [
    {
      id: "conversation:thread-one:user-one",
      messageId: "user-one",
      kind: "conversation_message",
      threadId: "thread-one",
      title: "即将归档",
      role: "user",
      text: "完成这个任务",
      occurredAt: "2026-08-17T03:00:00.000Z",
    },
    {
      id: "conversation:thread-one:assistant-one",
      messageId: "assistant-one",
      kind: "conversation_message",
      threadId: "thread-one",
      title: "即将归档",
      role: "assistant",
      text: "任务已经完成",
      occurredAt: "2026-08-17T03:01:00.000Z",
    },
  ];
  let summarizeCalls = 0;
  const service = createProjectStatusService({
    activityIndex: createActivityIndex({ activities, archivedThreadIds }),
    readManagement: noManagement,
    now: () => Date.parse("2026-08-17T04:00:00.000Z"),
    summarize: async () => {
      summarizeCalls += 1;
      return {
        todayProgress: ["完成归档前任务"],
        events: [{ sourceId: "conversation:thread-one", mode: "new", title: "完成归档前任务", summary: "任务已经完成。", startMessageId: "user-one" }],
      };
    },
  });
  const read = () => service.get({ projectId: identity.projectId });
  await waitFor(read, (value) => value.conversations.length === 1);

  archivedThreadIds.push("thread-one");
  const archived = await waitFor(read, (value) => value.conversations.length === 0);

  assert.deepEqual(archived.todayProgress, []);
  assert.equal(archived.progressDay, null);
  assert.equal(summarizeCalls, 1);
});

test("uses Asia Shanghai 04:00 as the fixed project-day boundary", async () => {
  const reads = [];
  const activities = [
    {
      id: "conversation:thread-one:user-one",
      messageId: "user-one",
      kind: "conversation_message",
      threadId: "thread-one",
      title: "跨日讨论",
      role: "user",
      text: "凌晨继续处理",
      occurredAt: "2026-08-16T19:00:00.000Z",
    },
    {
      id: "conversation:thread-one:assistant-one",
      messageId: "assistant-one",
      kind: "conversation_message",
      threadId: "thread-one",
      title: "跨日讨论",
      role: "assistant",
      text: "凌晨三点已完成",
      occurredAt: "2026-08-16T19:05:00.000Z",
    },
  ];
  const service = createProjectStatusService({
    activityIndex: createActivityIndex({ activities, reads }),
    readManagement: noManagement,
    now: () => Date.parse("2026-08-16T19:30:00.000Z"),
    summarize: async () => ({
      todayProgress: ["凌晨继续处理"],
      events: [{ sourceId: "conversation:thread-one", mode: "new", title: "凌晨继续处理", summary: "凌晨三点已完成。", startMessageId: "user-one" }],
    }),
  });
  const read = () => service.get({ projectId: identity.projectId });
  const ready = await waitFor(read, (value) => value.todayProgress.length > 0);

  assert.equal(ready.dayKey, "2026-08-16");
  assert.ok(reads.every((entry) => entry.timeZoneOffsetMinutes === 480));
  assert.ok(reads.some((entry) => entry.date === "2026-08-17"));
});

test("uses the last event from the previous project day when today has no content", async () => {
  const activities = [
    {
      id: "conversation:thread-one:assistant-old",
      messageId: "assistant-old",
      kind: "conversation_message",
      threadId: "thread-one",
      title: "昨天的对话",
      role: "assistant",
      text: "完成群聊显示优化。后续再验证。",
      occurredAt: "2026-08-16T18:30:00.000Z",
    },
  ];
  let summarizeCalls = 0;
  const service = createProjectStatusService({
    activityIndex: createActivityIndex({ activities }),
    readManagement: noManagement,
    now: () => Date.parse("2026-08-17T04:00:00.000Z"),
    summarize: async () => {
      summarizeCalls += 1;
      return {};
    },
  });
  const read = () => service.get({ projectId: identity.projectId });
  const fallback = await waitFor(read, (value) => value.progressDay === "2026-08-16");

  assert.deepEqual(fallback.todayProgress, ["完成群聊显示优化"]);
  assert.equal(fallback.progressUpdatedAt, "2026-08-16T18:30:00.000Z");
  assert.equal(summarizeCalls, 0);
});
