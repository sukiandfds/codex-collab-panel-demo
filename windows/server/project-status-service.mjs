import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readProjectManagement } from "./project-management-store.mjs";

const SHANGHAI_OFFSET_MINUTES = 8 * 60;
const PROJECT_DAY_START_HOUR = 4;
const clean = (value, maxLength = 1200) => String(value ?? "").trim().slice(0, maxLength);
const unique = (values) => [...new Set(values.filter(Boolean))];

const dateAtOffset = (timestamp, offsetMinutes = SHANGHAI_OFFSET_MINUTES) => (
  new Date(timestamp + offsetMinutes * 60_000).toISOString().slice(0, 10)
);

const addDays = (date, amount) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
};

const projectDayKey = (timestamp) => {
  const shifted = new Date(timestamp + SHANGHAI_OFFSET_MINUTES * 60_000);
  const calendarDate = shifted.toISOString().slice(0, 10);
  return shifted.getUTCHours() < PROJECT_DAY_START_HOUR ? addDays(calendarDate, -1) : calendarDate;
};

const projectDayWindow = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day, PROJECT_DAY_START_HOUR)
    - SHANGHAI_OFFSET_MINUTES * 60_000;
  return { startMs, endMs: startMs + 86_400_000 };
};

const parseSetting = (text, key) => new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m").exec(text)?.[1] || "";
const responseText = (payload) => (payload?.output || [])
  .flatMap((item) => item?.content || [])
  .map((item) => item?.text || "")
  .filter(Boolean)
  .join("\n")
  .trim();

const parseJsonObject = (text) => {
  const stripped = clean(text, 20_000).replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("整理模型没有返回有效 JSON");
  return JSON.parse(stripped.slice(start, end + 1));
};

const createModelSummarizer = ({
  model = "gpt-5.6-terra",
  codexRoot = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
} = {}) => async ({ dayKey, previousProgress, previousEvents, messages, managementCandidates }) => {
  const [configText, authText] = await Promise.all([
    fs.readFile(path.join(codexRoot, "config.toml"), "utf8"),
    fs.readFile(path.join(codexRoot, "auth.json"), "utf8"),
  ]);
  const provider = parseSetting(configText, "model_provider");
  const configuredModel = parseSetting(configText, "model");
  const escapedProvider = provider.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const section = new RegExp(`\\[model_providers\\.${escapedProvider}\\]([\\s\\S]*?)(?=\\n\\[|$)`).exec(configText)?.[1] || "";
  const baseUrl = parseSetting(section, "base_url").replace(/\/$/u, "");
  const apiKey = JSON.parse(authText)?.OPENAI_API_KEY;
  if (!provider || !baseUrl || !apiKey) throw new Error("小型整理模型尚未配置");

  const prompt = [
    "你只整理项目进度，不新增需求，不替用户做决定。",
    `当前项目日：${dayKey}（Asia/Shanghai 04:00 至次日 03:59）。`,
    "返回 JSON，不要 Markdown。todayProgress 是 2-6 个简短中文短语；events 必须覆盖本轮触及的每个 sourceId。",
    "一个 sourceId 可以有多个事件，按发生顺序返回。每个事件由一条用户指令开始；同一天若仍在处理上一事件，mode 用 continue，否则用 new。事件只写短标题和一段简短结论。",
    "格式：{\"todayProgress\":[\"短语\"],\"events\":[{\"sourceId\":\"conversation:...\",\"mode\":\"continue|new\",\"title\":\"短标题\",\"summary\":\"简短结论\",\"startMessageId\":\"用户消息ID\",\"projectItemId\":\"可选条目ID\"}]}。",
    `上一版今日进度：${JSON.stringify(previousProgress || [])}`,
    `各会话上一事件：${JSON.stringify(previousEvents || [])}`,
    `项目管理候选（只允许关联，不修改）：${JSON.stringify(managementCandidates || [])}`,
    `本轮新增消息：${JSON.stringify(messages || [])}`,
  ].join("\n\n");

  let lastError = null;
  for (const selectedModel of unique([model, configuredModel])) {
    try {
      const response = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          input: prompt,
          reasoning: { effort: "low" },
          max_output_tokens: 720,
          store: false,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `整理模型 HTTP ${response.status}`);
      return { ...parseJsonObject(responseText(payload)), model: selectedModel };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("整理模型暂时不可用");
};

const sourceFrom = (activity) => activity.kind === "group_message"
  ? {
      id: `group:${activity.roomId}`,
      kind: "group",
      label: clean(activity.title, 120) || "项目群聊",
      roomId: activity.roomId,
    }
  : {
      id: `conversation:${activity.threadId}`,
      kind: "conversation",
      label: clean(activity.title, 120) || "未命名对话",
      threadId: activity.threadId,
    };

const messageIdFrom = (activity) => clean(activity.messageId, 240)
  || clean(activity.id.split(":").at(-1), 240);

const messageFrom = (activity) => ({
  id: activity.id,
  messageId: messageIdFrom(activity),
  sourceId: sourceFrom(activity).id,
  sourceLabel: sourceFrom(activity).label,
  role: activity.role === "assistant" ? "assistant" : "user",
  text: clean(activity.text, 1200),
  occurredAt: activity.occurredAt,
});

const groupBySource = (activities) => {
  const groups = new Map();
  for (const activity of activities) {
    const source = sourceFrom(activity);
    const current = groups.get(source.id) || { source, activities: [] };
    current.activities.push(activity);
    groups.set(source.id, current);
  }
  return groups;
};

const shortPhrase = (value, maxLength = 32) => clean(value, 240)
  .split(/[。！？!?\n]/u)[0]
  .replace(/^[#>*-]+\s*/u, "")
  .slice(0, maxLength)
  .trim();

const normalizeProgress = (values) => unique((Array.isArray(values) ? values : [])
  .map((value) => shortPhrase(value, 36)))
  .slice(0, 6);

const managementCandidatesFrom = async (readManagement, identity) => {
  try {
    const projectRoot = clean(identity.root || identity.roots?.project, 1000);
    if (!projectRoot) return [];
    const management = await readManagement({ project: identity, projectRoot });
    const entries = [...(management.inProgress || []), ...(management.plan || [])];
    const seen = new Set();
    return entries.filter((entry) => {
      if (!entry?.id || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    }).slice(0, 8).map((entry) => ({ id: entry.id, title: clean(entry.title, 100) }));
  } catch {
    return [];
  }
};

const initialState = (identity) => ({
  project: { id: identity.projectId, name: identity.name },
  dayKey: "",
  progressByDay: {},
  conversations: [],
  lastSummarizedBySource: {},
  fallbackProgress: null,
  retryAfter: 0,
});

const latestEventForDay = (conversations, dayKey) => conversations
  .flatMap((conversation) => conversation.events || [])
  .filter((event) => event.dayKey === dayKey)
  .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] || null;

const publicState = (state, dayKey) => {
  const progress = state.progressByDay[dayKey];
  const previousDayKey = addDays(dayKey, -1);
  const previousEvent = latestEventForDay(state.conversations, previousDayKey);
  const fallback = previousEvent
    ? { phrases: [previousEvent.title], dayKey: previousEvent.dayKey, updatedAt: previousEvent.updatedAt }
    : state.fallbackProgress?.dayKey === previousDayKey ? state.fallbackProgress : null;
  const selected = progress?.phrases?.length ? progress : fallback;
  return {
    project: state.project,
    dayKey,
    todayProgress: selected?.phrases || [],
    progressDay: selected?.dayKey || null,
    progressUpdatedAt: selected?.updatedAt || null,
    conversations: state.conversations
      .map((conversation) => ({
        ...conversation,
        events: conversation.events.filter((event) => event.dayKey >= previousDayKey && event.dayKey <= dayKey),
      }))
      .filter((conversation) => conversation.events?.length)
      .sort((left, right) => right.latestAt.localeCompare(left.latestAt))
      .slice(0, 8),
  };
};

const mergeDateReads = async ({ activityIndex, identity, dayKey, nowMs, cache }) => {
  const currentCalendarDate = dateAtOffset(nowMs);
  const dates = [dayKey, addDays(dayKey, 1)].filter((date) => date <= currentCalendarDate);
  const readDate = (date) => {
    if (!cache.has(date)) {
      cache.set(date, activityIndex.read({
        projectId: identity.projectId,
        date,
        timeZoneOffsetMinutes: SHANGHAI_OFFSET_MINUTES,
      }));
    }
    return cache.get(date);
  };
  const results = await Promise.all(dates.map(readDate));
  const { startMs, endMs } = projectDayWindow(dayKey);
  const activities = new Map();
  const activeAgentCountByRoom = {};
  const archivedSourceIds = new Set();
  for (const result of results) {
    for (const threadId of result.archivedThreadIds || []) archivedSourceIds.add(`conversation:${threadId}`);
  }
  for (const result of results) {
    for (const [roomId, count] of Object.entries(result.activeAgentCountByRoom || {})) {
      activeAgentCountByRoom[roomId] = Math.max(activeAgentCountByRoom[roomId] || 0, Number(count || 0));
    }
    for (const activity of result.activities || []) {
      const occurredAt = Date.parse(activity.occurredAt);
      const archivedConversation = activity.kind === "conversation_message"
        && (activity.archived === true || archivedSourceIds.has(`conversation:${activity.threadId}`));
      if ((activity.kind === "conversation_message" || activity.kind === "group_message")
        && !archivedConversation
        && occurredAt >= startMs && occurredAt < endMs) activities.set(activity.id, activity);
    }
  }
  return {
    activities: [...activities.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    activeAgentCount: Math.max(0, ...results.map((result) => Number(result.activeAgentCount || 0))),
    activeAgentCountByRoom,
    archivedSourceIds,
  };
};

const applyEvents = ({ previous, dayKey, completed, modelResult, managementCandidates }) => {
  const conversations = previous.conversations.map((conversation) => ({
    ...conversation,
    events: [...conversation.events],
  }));
  const modelEvents = Array.isArray(modelResult?.events) ? modelResult.events : [];
  const candidateById = new Map(managementCandidates.map((candidate) => [candidate.id, candidate]));
  const summarizedIds = { ...previous.lastSummarizedBySource };

  for (const { source, incremental, all } of completed) {
    const sourceOutputs = modelEvents.filter((event) => clean(event?.sourceId, 300) === source.id);
    const outputs = sourceOutputs.length ? sourceOutputs : [{}];
    const userActivities = incremental.filter((activity) => activity.role !== "assistant");
    let conversation = conversations.find((entry) => entry.id === source.id);
    if (!conversation) {
      conversation = { id: source.id, kind: source.kind, label: source.label, latestAt: all.at(-1)?.occurredAt, events: [] };
      conversations.push(conversation);
    }
    conversation.label = source.label;
    conversation.latestAt = all.at(-1)?.occurredAt || conversation.latestAt;
    const starts = outputs.map((output, index) => {
      const requestedStartId = clean(output.startMessageId, 240);
      const requestedStart = incremental.find((activity) => (
        activity.role !== "assistant" && [activity.id, messageIdFrom(activity)].includes(requestedStartId)
      ));
      return requestedStart || userActivities[index] || null;
    });

    for (const [outputIndex, output] of outputs.entries()) {
      const previousEvent = [...conversation.events].reverse().find((event) => event.dayKey === dayKey);
      const startActivity = starts[outputIndex] || (previousEvent ? null : incremental[0]);
      const startIndex = startActivity ? incremental.indexOf(startActivity) : 0;
      const nextStartIndex = starts[outputIndex + 1] ? incremental.indexOf(starts[outputIndex + 1]) : incremental.length;
      const segment = incremental.slice(Math.max(0, startIndex), nextStartIndex > startIndex ? nextStartIndex : incremental.length);
      const assistant = [...segment].reverse().find((activity) => activity.role === "assistant") || segment.at(-1) || incremental.at(-1);
      const mode = (output.mode === "continue" || (!startActivity && previousEvent)) && previousEvent ? "continue" : "new";
      const title = shortPhrase(output.title, 40)
        || shortPhrase(startActivity?.text, 40)
        || previousEvent?.title
        || "继续处理当前事项";
      const summary = clean(output.summary, 260)
        || clean(assistant?.text, 260)
        || "已记录本轮处理结果。";
      const projectItem = candidateById.get(clean(output.projectItemId, 40));

      if (mode === "continue") {
        Object.assign(previousEvent, {
          title,
          summary,
          updatedAt: assistant?.occurredAt || incremental.at(-1)?.occurredAt,
          ...(projectItem ? { projectItem } : {}),
        });
      } else {
        const startMessageId = messageIdFrom(startActivity || incremental[0]);
        const baseId = `${source.id}:${dayKey}:${startMessageId}`;
        const id = conversation.events.some((event) => event.id === baseId) ? `${baseId}:${outputIndex + 1}` : baseId;
        conversation.events.push({
          id,
          dayKey,
          title,
          summary,
          startMessageId,
          startAt: startActivity?.occurredAt || incremental[0]?.occurredAt,
          updatedAt: assistant?.occurredAt || incremental.at(-1)?.occurredAt,
          ...(projectItem ? { projectItem } : {}),
        });
      }
    }
    conversation.events = conversation.events.slice(-12);
    summarizedIds[source.id] = incremental.at(-1)?.id || summarizedIds[source.id];
  }

  const oldestDay = addDays(dayKey, -1);
  const trimmedConversations = conversations.map((conversation) => ({
    ...conversation,
    events: conversation.events.filter((event) => event.dayKey >= oldestDay),
  })).filter((conversation) => conversation.events.length);
  const fallbackProgress = trimmedConversations
    .flatMap((conversation) => conversation.events)
    .filter((event) => event.dayKey === dayKey)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((event) => event.title);
  const phrases = normalizeProgress(modelResult?.todayProgress);

  return {
    conversations: trimmedConversations,
    lastSummarizedBySource: summarizedIds,
    progress: {
      phrases: phrases.length ? phrases : normalizeProgress(fallbackProgress),
      dayKey,
      updatedAt: new Date().toISOString(),
    },
  };
};

export const createProjectStatusService = ({
  activityIndex,
  summarize = createModelSummarizer(),
  readManagement = readProjectManagement,
  now = () => Date.now(),
} = {}) => {
  if (!activityIndex?.read || !activityIndex?.resolve) throw new Error("Project activity index is required.");
  const states = new Map();
  const running = new Map();

  const refresh = async ({ identity, dayKey, nowMs }) => {
    const key = identity.projectId;
    const previous = states.get(key) || initialState(identity);
    if (previous.retryAfter > nowMs) return;
    try {
      const readCache = new Map();
      const currentDay = await mergeDateReads({ activityIndex, identity, dayKey, nowMs, cache: readCache });
      const sourceGroups = groupBySource(currentDay.activities);
      const completed = [];
      for (const { source, activities } of sourceGroups.values()) {
        const latest = activities.at(-1);
        const groupActiveCount = source.kind === "group"
          ? Number(currentDay.activeAgentCountByRoom[source.roomId] ?? currentDay.activeAgentCount)
          : 0;
        if (latest?.role !== "assistant" || groupActiveCount > 0) continue;
        const previousId = previous.lastSummarizedBySource[source.id];
        const previousIndex = previousId ? activities.findIndex((activity) => activity.id === previousId) : -1;
        const incremental = previousIndex >= 0 ? activities.slice(previousIndex + 1) : activities.slice(-30);
        if (incremental.length) completed.push({ source, incremental, all: activities });
      }

      const archivedRemoved = previous.conversations.some((conversation) => currentDay.archivedSourceIds.has(conversation.id));
      const knownConversations = previous.conversations
        .filter((conversation) => !currentDay.archivedSourceIds.has(conversation.id))
        .map((conversation) => {
        const current = sourceGroups.get(conversation.id);
        return current ? {
          ...conversation,
          label: current.source.label,
          latestAt: current.activities.at(-1)?.occurredAt || conversation.latestAt,
        } : conversation;
      });
      const lastSummarizedBySource = Object.fromEntries(Object.entries(previous.lastSummarizedBySource)
        .filter(([sourceId]) => !currentDay.archivedSourceIds.has(sourceId)));
      const progressByDay = { ...previous.progressByDay };
      if (archivedRemoved) {
        const remainingEvents = knownConversations
          .flatMap((conversation) => conversation.events)
          .filter((event) => event.dayKey === dayKey)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        const phrases = normalizeProgress(remainingEvents.map((event) => event.title));
        if (phrases.length) {
          progressByDay[dayKey] = { phrases, dayKey, updatedAt: remainingEvents[0].updatedAt };
        } else {
          delete progressByDay[dayKey];
        }
      }
      let visibleState = {
        ...previous,
        project: { id: identity.projectId, name: identity.name },
        dayKey,
        conversations: knownConversations,
        lastSummarizedBySource,
        progressByDay,
        retryAfter: 0,
      };

      if (!currentDay.activities.length) {
        const priorDayKey = addDays(dayKey, -1);
        const priorDay = await mergeDateReads({ activityIndex, identity, dayKey: priorDayKey, nowMs, cache: readCache });
        const latest = priorDay.activities.at(-1);
        visibleState = {
          ...visibleState,
          fallbackProgress: latest ? {
            phrases: [shortPhrase(latest.text) || sourceFrom(latest).label],
            dayKey: priorDayKey,
            updatedAt: latest.occurredAt,
          } : null,
        };
      } else {
        visibleState.fallbackProgress = null;
      }

      states.set(key, visibleState);
      if (!completed.length) return;

      const managementCandidates = await managementCandidatesFrom(readManagement, identity);
      const previousEvents = completed.map(({ source }) => {
        const conversation = visibleState.conversations.find((entry) => entry.id === source.id);
        const event = [...(conversation?.events || [])].reverse().find((entry) => entry.dayKey === dayKey);
        return event ? { sourceId: source.id, title: event.title, summary: event.summary } : { sourceId: source.id };
      });
      const messages = completed
        .flatMap(({ incremental }) => incremental.map(messageFrom))
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
      const result = await summarize({
        dayKey,
        previousProgress: visibleState.progressByDay[dayKey]?.phrases || [],
        previousEvents,
        messages,
        managementCandidates,
      });
      const merged = applyEvents({ previous: visibleState, dayKey, completed, modelResult: result, managementCandidates });
      const nextProgressByDay = { ...visibleState.progressByDay, [dayKey]: merged.progress };
      for (const storedDay of Object.keys(nextProgressByDay)) {
        if (storedDay < addDays(dayKey, -1)) delete nextProgressByDay[storedDay];
      }
      states.set(key, {
        ...visibleState,
        conversations: merged.conversations,
        lastSummarizedBySource: merged.lastSummarizedBySource,
        progressByDay: nextProgressByDay,
        fallbackProgress: null,
      });
    } catch {
      states.set(key, { ...previous, dayKey, retryAfter: nowMs + 30_000 });
    }
  };

  const get = ({ projectId, projectRoot } = {}) => {
    const identity = activityIndex.resolve({ projectId, projectRoot });
    const key = identity.projectId;
    const nowMs = Number(now());
    const dayKey = projectDayKey(nowMs);
    const state = states.get(key) || initialState(identity);
    states.set(key, state);
    if (!running.has(key)) {
      const task = refresh({ identity, dayKey, nowMs }).finally(() => running.delete(key));
      running.set(key, task);
    }
    return publicState(state, dayKey);
  };

  return { get };
};
