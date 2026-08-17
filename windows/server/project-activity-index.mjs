import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const maxOffsetMinutes = 14 * 60;

const statusError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const clean = (value, maxLength = 12000) => String(value ?? "").trim().slice(0, maxLength);

const timestamp = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (/^\d+(?:\.\d+)?$/u.test(String(value || ""))) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : Number.NaN;
  }
  return Date.parse(String(value || ""));
};

const dayWindow = (date, timeZoneOffsetMinutes) => {
  if (!datePattern.test(date)) throw statusError("date must use YYYY-MM-DD", 400);
  const [year, month, day] = date.split("-").map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
    throw statusError("date is invalid", 400);
  }
  if (!Number.isInteger(timeZoneOffsetMinutes)
    || timeZoneOffsetMinutes < -maxOffsetMinutes
    || timeZoneOffsetMinutes > maxOffsetMinutes) {
    throw statusError("timeZoneOffsetMinutes is invalid", 400);
  }
  const startMs = Date.UTC(year, month - 1, day) - timeZoneOffsetMinutes * 60_000;
  return { startMs, endMs: startMs + 86_400_000 };
};

const sameRoot = (left, right) => {
  try { return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase(); } catch { return false; }
};

const fallbackId = (parts) => createHash("sha256")
  .update(parts.map((part) => String(part || "")).join("\u001f"))
  .digest("hex")
  .slice(0, 24);

const messageText = (message) => {
  const text = clean(message?.text);
  const attachments = (Array.isArray(message?.attachments) ? message.attachments : [])
    .map((file) => clean(file?.name, 240))
    .filter(Boolean);
  return [text, attachments.length ? `Attachments: ${attachments.join(", ")}` : ""].filter(Boolean).join("\n");
};

const dedupeProtocolMirrors = (messages) => {
  const result = [];
  const exactIds = new Set();
  const latestByContent = new Map();
  for (const message of messages) {
    if (exactIds.has(message.id)) continue;
    exactIds.add(message.id);
    const occurredAt = timestamp(message.occurredAt);
    const contentKey = `${message.role}\u001f${fallbackId([message.text])}`;
    const previousIndex = latestByContent.get(contentKey);
    const previous = Number.isInteger(previousIndex) ? result[previousIndex] : null;
    const mirrorsSameProtocolMessage = previous
      && Math.abs(timestamp(previous.occurredAt) - occurredAt) <= 10
      && Boolean(previous.turnId) !== Boolean(message.turnId);
    if (mirrorsSameProtocolMessage) {
      if (message.turnId && !previous.turnId) result[previousIndex] = message;
      continue;
    }
    latestByContent.set(contentKey, result.length);
    result.push(message);
  }
  return result;
};

export const readProjectGitCommits = async ({ root, start, end }) => {
  const { stdout } = await execFileAsync("git", [
    "-C", path.resolve(root),
    "log", "--no-merges",
    `--since=${start}`,
    `--until=${end}`,
    "--format=%H%x1f%an%x1f%aI%x1f%s%x1e",
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  return String(stdout || "").split("\u001e").map((record) => {
    const [hash, authorName, occurredAt, subject] = record.trim().split("\u001f");
    return hash && occurredAt ? { hash, authorName, occurredAt, subject: subject || "" } : null;
  }).filter(Boolean);
};

const roomMessagesForDate = (room, date) => {
  if (!room?.getMessagePage) return room?.snapshot?.().messages || [];
  const messages = [];
  let page = room.getMessagePage({ date, limit: 100 });
  let pages = 0;
  while (page?.messages?.length && pages < 100) {
    messages.push(...page.messages);
    if (!page.hasNewer || !page.newestSequence) break;
    page = room.getMessagePage({ afterSequence: page.newestSequence, limit: 100 });
    pages += 1;
  }
  return messages;
};

export const createProjectActivityIndex = ({
  projectDirectory,
  conversations,
  roomDirectory,
  excludeThread = () => false,
  readGitCommits = readProjectGitCommits,
  defaultTimeZoneOffsetMinutes = -new Date().getTimezoneOffset(),
} = {}) => {
  if (!projectDirectory?.get) throw new Error("Project directory is required.");
  if (!conversations?.listSessions || !conversations?.findSession) throw new Error("Conversation service is required.");

  const read = async ({ projectId, date, timeZoneOffsetMinutes = defaultTimeZoneOffsetMinutes } = {}) => {
    const identity = projectDirectory.get(clean(projectId, 200));
    if (!identity) throw statusError("Project does not exist.", 404);
    if (identity.kind === "employee") throw statusError("Employee project activity is not part of the project review index.", 409);
    const root = clean(identity.root || identity.roots?.project, 1000);
    if (!root) throw statusError("Project root is not configured.", 409);

    const { startMs, endMs } = dayWindow(clean(date, 10), Number(timeZoneOffsetMinutes));
    const start = new Date(startMs).toISOString();
    const end = new Date(endMs).toISOString();
    const warnings = [];
    const activities = new Map();
    const add = (activity) => {
      const occurredAtMs = timestamp(activity.occurredAt);
      if (!Number.isFinite(occurredAtMs) || occurredAtMs < startMs || occurredAtMs >= endMs) return;
      const normalized = { ...activity, occurredAt: new Date(occurredAtMs).toISOString() };
      if (!activities.has(normalized.id)) activities.set(normalized.id, normalized);
    };

    const sessionLists = await Promise.all([
      conversations.listSessions("all", false),
      conversations.listSessions("all", true),
    ]);
    const sessions = new Map();
    for (const session of sessionLists.flat()) {
      const threadId = clean(session?.threadId, 200);
      if (!threadId || !sameRoot(session?.cwd, root) || excludeThread(threadId)) continue;
      const updatedAt = timestamp(session?.updatedAt);
      if (Number.isFinite(updatedAt) && updatedAt < startMs) continue;
      sessions.set(threadId, session);
    }

    for (const [threadId, summary] of sessions) {
      try {
        const session = await conversations.findSession(threadId, "all");
        const conversationMessages = [];
        for (const message of session?.messages || []) {
          const text = messageText(message);
          if (!text) continue;
          const messageId = clean(message?.id, 240) || fallbackId([
            threadId, message?.role, message?.createdAt, text,
          ]);
          conversationMessages.push({
            id: `conversation:${threadId}:${messageId}`,
            kind: "conversation_message",
            source: "codex_thread",
            projectId: identity.projectId,
            threadId,
            messageId,
            turnId: clean(message?.turnId, 200),
            title: clean(summary?.title, 240),
            role: clean(message?.role, 40),
            authorName: clean(message?.authorName, 160),
            text,
            occurredAt: message?.createdAt,
          });
        }
        for (const message of dedupeProtocolMirrors(conversationMessages)) add(message);
        if (conversations.getGoal) {
          const result = await conversations.getGoal(threadId);
          const goal = result?.goal || null;
          const occurredAt = goal?.updatedAt ?? goal?.createdAt;
          if (goal && Number.isFinite(timestamp(occurredAt))) {
            add({
              id: `goal:${threadId}:${clean(goal.status, 40)}:${timestamp(occurredAt)}`,
              kind: "goal_snapshot",
              source: "codex_goal",
              projectId: identity.projectId,
              threadId,
              title: clean(summary?.title, 240),
              text: clean(goal.objective),
              status: clean(goal.status, 40),
              tokenBudget: Number.isFinite(goal.tokenBudget) ? goal.tokenBudget : null,
              tokensUsed: Number.isFinite(goal.tokensUsed) ? goal.tokensUsed : null,
              occurredAt,
            });
          }
        }
      } catch (error) {
        warnings.push({ source: "codex_thread", threadId, error: clean(error?.message || error, 500) });
      }
    }

    for (const roomSummary of roomDirectory?.list?.() || []) {
      if (clean(roomSummary?.projectId, 200) !== identity.projectId) continue;
      const room = roomDirectory.get?.(roomSummary.id);
      for (const message of roomMessagesForDate(room, date)) {
        const text = messageText(message);
        if (!text) continue;
        const messageId = clean(message?.id, 240) || fallbackId([
          roomSummary.id, message?.authorId, message?.createdAt, text,
        ]);
        add({
          id: `group:${roomSummary.id}:${messageId}`,
          kind: "group_message",
          source: "negus_group",
          projectId: identity.projectId,
          roomId: roomSummary.id,
          role: message?.type === "agent" ? "assistant" : "user",
          authorId: clean(message?.authorId, 120),
          authorName: clean(message?.authorName, 160),
          text,
          occurredAt: message?.createdAt,
        });
      }
    }

    try {
      for (const commit of await readGitCommits({ root, start, end })) {
        add({
          id: `git:${commit.hash}`,
          kind: "git_commit",
          source: "git",
          projectId: identity.projectId,
          commitHash: commit.hash,
          authorName: clean(commit.authorName, 160),
          text: clean(commit.subject, 1000),
          occurredAt: commit.occurredAt,
        });
      }
    } catch (error) {
      warnings.push({ source: "git", error: clean(error?.message || error, 500) });
    }

    const ordered = [...activities.values()].sort((left, right) => (
      left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)
    ));
    const counts = ordered.reduce((result, activity) => {
      result[activity.kind] = (result[activity.kind] || 0) + 1;
      return result;
    }, {});

    return {
      project: { id: identity.projectId, name: identity.name, kind: identity.kind, root },
      date,
      timeZoneOffsetMinutes: Number(timeZoneOffsetMinutes),
      window: { start, end },
      counts: { total: ordered.length, ...counts },
      activities: ordered,
      warnings,
    };
  };

  return { read };
};
