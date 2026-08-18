import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { createProjectActivityIndex } from "../server/project-activity-index.mjs";
import { createProjectReviewRoutes } from "../server/routes/project-review-routes.mjs";

const project = {
  projectId: "project:business:alpha",
  kind: "business",
  name: "Alpha",
  root: "D:\\projects\\alpha",
};

test("builds one read-only daily index without mixing projects or duplicate messages", async () => {
  const reads = [];
  const conversations = {
    listSessions: async (_source, archived) => archived ? [{
      threadId: "thread-1",
      cwd: project.root,
      title: "Duplicate archived summary",
      updatedAt: "2026-08-14T08:00:00.000Z",
    }] : [{
      threadId: "thread-1",
      cwd: project.root,
      title: "Daily work",
      updatedAt: "2026-08-15T01:00:00.000Z",
    }, {
      threadId: "thread-other-project",
      cwd: "D:\\projects\\beta",
      title: "Other project",
      updatedAt: "2026-08-14T08:00:00.000Z",
    }, {
      threadId: "thread-employee",
      cwd: project.root,
      title: "Employee thread",
      updatedAt: "2026-08-14T08:00:00.000Z",
    }, {
      threadId: "thread-old",
      cwd: project.root,
      title: "Old thread",
      updatedAt: "2026-08-13T10:00:00.000Z",
    }],
    findSession: async (threadId) => {
      reads.push(threadId);
      return {
        messages: [{
          id: "message-1",
          turnId: "turn-1",
          role: "user",
          text: "Review yesterday",
          createdAt: "2026-08-14T01:00:00.000Z",
        }, {
          id: "message-event-1",
          role: "user",
          text: "Review yesterday",
          createdAt: "2026-08-14T01:00:00.000Z",
        }, {
          id: "message-outside",
          role: "assistant",
          text: "Today only",
          createdAt: "2026-08-14T18:00:00.000Z",
        }],
      };
    },
    getGoal: async () => ({
      goal: {
        objective: "Finish the review index",
        status: "active",
        updatedAt: Date.parse("2026-08-14T04:00:00.000Z") / 1000,
        tokenBudget: 1000,
        tokensUsed: 200,
      },
    }),
  };
  const roomA = {
    snapshot: () => ({
      messages: [{
        id: "group-1",
        type: "human",
        authorId: "user-1",
        authorName: "Hans",
        text: "Check the complete context",
        createdAt: "2026-08-14T02:00:00.000Z",
      }, {
        id: "group-outside",
        type: "agent",
        authorId: "developer",
        authorName: "Developer",
        text: "Outside the requested day",
        createdAt: "2026-08-13T10:00:00.000Z",
      }],
    }),
  };
  const roomDirectory = {
    list: () => [
      { id: "room-alpha", projectId: project.projectId },
      { id: "room-beta", projectId: "project:business:beta" },
    ],
    get: (roomId) => roomId === "room-alpha" ? roomA : null,
  };
  const index = createProjectActivityIndex({
    projectDirectory: { get: (projectId) => projectId === project.projectId ? project : null },
    conversations,
    roomDirectory,
    excludeThread: (threadId) => threadId === "thread-employee",
    readGitCommits: async () => [{
      hash: "abc123",
      authorName: "Hans",
      occurredAt: "2026-08-14T03:00:00.000Z",
      subject: "Add activity index",
    }, {
      hash: "outside",
      authorName: "Hans",
      occurredAt: "2026-08-14T20:00:00.000Z",
      subject: "Outside",
    }],
  });

  const result = await index.read({
    projectId: project.projectId,
    date: "2026-08-14",
    timeZoneOffsetMinutes: 480,
  });

  assert.deepEqual(reads, ["thread-1"]);
  assert.deepEqual(result.window, {
    start: "2026-08-13T16:00:00.000Z",
    end: "2026-08-14T16:00:00.000Z",
  });
  assert.deepEqual(result.counts, {
    total: 4,
    conversation_message: 1,
    group_message: 1,
    git_commit: 1,
    goal_snapshot: 1,
  });
  assert.deepEqual(result.activities.map((activity) => activity.id), [
    "conversation:thread-1:message-1",
    "group:room-alpha:group-1",
    "git:abc123",
    `goal:thread-1:active:${Date.parse("2026-08-14T04:00:00.000Z")}`,
  ]);
  assert.deepEqual(result.warnings, []);
});

test("rejects invalid dates, unknown projects, and employee projects", async () => {
  const conversations = { listSessions: async () => [], findSession: async () => null };
  const identities = new Map([
    [project.projectId, project],
    ["project:employee:developer", {
      projectId: "project:employee:developer",
      kind: "employee",
      name: "Developer",
      root: "D:\\employees\\developer",
    }],
  ]);
  const index = createProjectActivityIndex({
    projectDirectory: { get: (projectId) => identities.get(projectId) || null },
    conversations,
    readGitCommits: async () => [],
  });

  await assert.rejects(
    () => index.read({ projectId: project.projectId, date: "2026-02-30", timeZoneOffsetMinutes: 480 }),
    (error) => error?.statusCode === 400,
  );
  await assert.rejects(
    () => index.read({ projectId: "missing", date: "2026-08-14", timeZoneOffsetMinutes: 480 }),
    (error) => error?.statusCode === 404,
  );
  await assert.rejects(
    () => index.read({ projectId: "project:employee:developer", date: "2026-08-14", timeZoneOffsetMinutes: 480 }),
    (error) => error?.statusCode === 409,
  );
});

test("reports archived project threads without treating them as active", async () => {
  const conversations = {
    listSessions: async (_source, archived) => archived ? [{
      threadId: "thread-archived",
      cwd: project.root,
      title: "Archived work",
      updatedAt: "2026-08-14T08:00:00.000Z",
    }] : [],
    findSession: async () => ({
      messages: [{
        id: "message-archived",
        role: "assistant",
        text: "Archived result",
        createdAt: "2026-08-14T08:00:00.000Z",
      }],
    }),
  };
  const index = createProjectActivityIndex({
    projectDirectory: { get: (projectId) => projectId === project.projectId ? project : null },
    conversations,
    readGitCommits: async () => [],
  });

  const result = await index.read({ projectId: project.projectId, date: "2026-08-14", timeZoneOffsetMinutes: 480 });

  assert.deepEqual(result.archivedThreadIds, ["thread-archived"]);
  assert.equal(result.activities[0].archived, true);
});

test("exposes the activity index through a read-only route", async () => {
  const calls = [];
  const route = createProjectReviewRoutes({
    activityIndex: {
      read: async (input) => {
        calls.push(input);
        return { project: { id: input.projectId }, date: input.date, activities: [] };
      },
    },
  });
  const pathname = "/api/project-review/activity?projectId=project%3Abusiness%3Aalpha&date=2026-08-14&timeZoneOffsetMinutes=480";
  const request = Readable.from([]);
  request.method = "GET";
  request.url = pathname;
  const response = {
    status: 0,
    body: "",
    writeHead(status) { this.status = status; },
    end(value) { this.body = value || ""; },
  };

  assert.equal(await route(request, response, new URL(`http://127.0.0.1${pathname}`)), true);
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{
    projectId: project.projectId,
    date: "2026-08-14",
    timeZoneOffsetMinutes: 480,
  }]);
});
