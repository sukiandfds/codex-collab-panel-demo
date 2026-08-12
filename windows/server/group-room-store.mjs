import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadEmployeeDefinitions } from "./employee-definitions.mjs";

const cleanText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);
const safeSequence = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

const initialAgent = (definition, saved = {}) => ({
  ...definition,
  model: cleanText(saved.model, 120) || cleanText(definition.model, 120) || "",
  reasoningEffort: cleanText(saved.reasoningEffort, 40) || cleanText(definition.reasoningEffort, 40) || "",
  threadId: cleanText(saved.threadId, 80) || null,
  phase: "idle",
  label: saved.threadId ? "等待新任务" : "尚未启动",
  detail: "",
  active: false,
  updatedAt: saved.updatedAt || null,
});

export const createGroupRoomStore = async ({ stateFile, project, projectId = "", roomId = "", agentDefinitions = null, broadcast = () => {}, onMessageCreated = () => {} }) => {
  const definitions = agentDefinitions || await loadEmployeeDefinitions();
  let stored = {};
  try {
    stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
  } catch {}

  const projectName = cleanText(project, 160) || "project";
  const linkedProjectId = cleanText(projectId, 200) || cleanText(stored.projectId, 200) || projectName;
  const linkedRoomId = cleanText(roomId, 120) || cleanText(stored.roomId, 120) || "current-project";

  const savedAgents = new Map((Array.isArray(stored.agents) ? stored.agents : []).map((agent) => [agent.id, agent]));
  const storedContextSequences = stored.agentContextSequences && typeof stored.agentContextSequences === "object"
    && !Array.isArray(stored.agentContextSequences) ? stored.agentContextSequences : {};
  const agents = new Map(definitions.map((definition) => [definition.id, initialAgent(definition, savedAgents.get(definition.id))]));
  const agentContextSequences = new Map(definitions.map((definition) => [
    definition.id,
    safeSequence(storedContextSequences[definition.id]),
  ]));
  const messages = (Array.isArray(stored.messages) ? stored.messages : [])
    .filter((message) => message?.id && message?.createdAt
      && (message?.text || (Array.isArray(message?.attachments) && message.attachments.length)))
    .map((message, index) => ({
      ...message,
      clientMessageId: cleanText(message.clientMessageId, 80) || null,
      workId: cleanText(message.workId, 160) || null,
      sequence: Number.isSafeInteger(message.sequence) && message.sequence > 0 ? message.sequence : index + 1,
      artifactIds: [...new Set((Array.isArray(message.artifactIds) ? message.artifactIds : [])
        .map((id) => cleanText(id, 80)).filter(Boolean))],
    }))
    .slice(-300);
  const members = new Map();
  const activeWorks = new Map();
  let nextMessageSequence = messages.reduce((latest, message) => Math.max(latest, message.sequence), 0);
  let writeQueue = Promise.resolve();

  const persist = () => {
    const payload = JSON.stringify({
      version: 4,
      projectId: linkedProjectId,
      roomId: linkedRoomId,
      messages: messages.slice(-300),
      agents: [...agents.values()].map(({ instructions, ...agent }) => agent),
      agentContextSequences: Object.fromEntries(agentContextSequences),
    }, null, 2);
    writeQueue = writeQueue
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(stateFile), { recursive: true });
        await fs.writeFile(stateFile, payload, "utf8");
      });
    return writeQueue;
  };

  const publicAgent = ({ instructions, ...agent }) => agent;
  const emit = (value) => broadcast({ ...value, roomId: linkedRoomId });
  const activeMembers = () => {
    const cutoff = Date.now() - 60000;
    return [...members.values()].filter((member) => Date.parse(member.lastSeenAt) >= cutoff);
  };

  const snapshot = () => ({
    project: projectName,
    projectId: linkedProjectId,
    room: { id: linkedRoomId, projectId: linkedProjectId, name: `${projectName} 项目群` },
    messages: [...messages],
    agents: [...agents.values()].map(publicAgent),
    members: activeMembers(),
    activeWorks: [...activeWorks.values()],
  });

  const beginAgentWork = ({ workId, agentId, agentName, mode, startedAt }) => {
    const id = cleanText(workId, 160);
    const cleanAgentId = cleanText(agentId, 80);
    const agent = agents.get(cleanAgentId);
    if (!id || !agent) return null;
    const work = {
      workId: id,
      agentId: cleanAgentId,
      agentName: cleanText(agentName, 80) || agent.name,
      mode: mode === "development" ? "development" : "discussion",
      startedAt: cleanText(startedAt, 40) || new Date().toISOString(),
      phase: "working",
    };
    activeWorks.set(id, work);
    return work;
  };

  const finishAgentWork = (workId) => activeWorks.delete(cleanText(workId, 160));

  const touchMember = (memberId, name) => {
    const id = cleanText(memberId, 80);
    const displayName = cleanText(name, 24);
    if (!id || !displayName) throw Object.assign(new Error("成员名称不能为空"), { statusCode: 400 });
    const member = { id, name: displayName, lastSeenAt: new Date().toISOString() };
    members.set(id, member);
    emit({ type: "group_members_changed", members: activeMembers() });
    return member;
  };

  const addMessageWithStatus = async ({
    type = "human",
    authorId,
    authorName,
    agentId = null,
    targetAgentIds = [],
    mode = "discussion",
    text,
    attachments = [],
    clientMessageId = null,
    workId = null,
    preserveText = false,
  }) => {
    const content = preserveText
      ? String(text || "").slice(0, 12000)
      : cleanText(text, 12000);
    const cleanAuthorId = cleanText(authorId, 80);
    const cleanClientMessageId = cleanText(clientMessageId, 80) || null;
    const cleanWorkId = cleanText(workId, 160) || null;
    const existing = messages.find((message) => (
      (cleanClientMessageId && message.authorId === cleanAuthorId && message.clientMessageId === cleanClientMessageId)
      || (cleanWorkId && message.workId === cleanWorkId)
    ));
    if (existing) return { message: existing, created: false };
    const files = (Array.isArray(attachments) ? attachments : []).slice(0, 6).map((file) => ({
      id: cleanText(file.id, 80),
      name: cleanText(file.name, 160),
      mimeType: cleanText(file.mimeType, 120),
      url: cleanText(file.url, 240),
    })).filter((file) => file.id && file.name && file.url);
    if (!content.trim() && !files.length) throw Object.assign(new Error("消息不能为空"), { statusCode: 400 });
    const targets = [...new Set((Array.isArray(targetAgentIds) ? targetAgentIds : [])
      .map((id) => cleanText(id, 80))
      .filter((id) => agents.has(id)))];
    const message = {
      id: randomUUID(),
      clientMessageId: cleanClientMessageId,
      workId: cleanWorkId,
      sequence: ++nextMessageSequence,
      type,
      authorId: cleanAuthorId,
      authorName: cleanText(authorName, 40),
      agentId: agentId || targets[0] || null,
      targetAgentIds: targets,
      mode,
      text: content,
      attachments: files,
      artifactIds: [],
      createdAt: new Date().toISOString(),
    };
    messages.push(message);
    if (messages.length > 300) messages.splice(0, messages.length - 300);
    await persist();
    emit({ type: "group_message_created", message });
    if (message.type === "agent") {
      try {
        await onMessageCreated({
          message: { ...message },
          projectId: linkedProjectId,
          roomId: linkedRoomId,
        });
      } catch (error) {
        console.warn(`[group-room] employee message link failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { message, created: true };
  };

  const addMessage = async (params) => (await addMessageWithStatus(params)).message;

  const getAgent = (agentId) => agents.get(agentId) || null;
  const getMessage = (messageId) => messages.find((message) => message.id === messageId) || null;
  const getAgentContext = (agentId) => {
    const afterSequence = agentContextSequences.get(agentId) || 0;
    const throughSequence = nextMessageSequence;
    return {
      afterSequence,
      throughSequence,
      messages: messages.filter((message) => message.sequence > afterSequence
        && message.sequence <= throughSequence),
    };
  };

  const advanceAgentContext = async (agentId, sequence) => {
    if (!agents.has(agentId)) throw Object.assign(new Error("Agent does not exist"), { statusCode: 404 });
    const current = agentContextSequences.get(agentId) || 0;
    const next = Math.max(current, safeSequence(sequence));
    if (next === current) return current;
    agentContextSequences.set(agentId, next);
    await persist();
    return next;
  };

  const attachArtifact = async (messageId, artifactId) => {
    const message = getMessage(cleanText(messageId, 80));
    if (!message) throw Object.assign(new Error("群消息不存在"), { statusCode: 404 });
    const id = cleanText(artifactId, 80);
    if (!id) throw Object.assign(new Error("artifactId 不能为空"), { statusCode: 400 });
    if (message.artifactIds.includes(id)) return message;
    message.artifactIds.push(id);
    await persist();
    emit({ type: "group_message_updated", message: { ...message } });
    return message;
  };

  const updateAgent = async (agentId, patch) => {
    const current = agents.get(agentId);
    if (!current) throw Object.assign(new Error("Agent 不存在"), { statusCode: 404 });
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    agents.set(agentId, next);
    await persist();
    const agent = publicAgent(next);
    emit({ type: "group_agent_updated", agent });
    return agent;
  };

  await persist();
  return {
    snapshot,
    touchMember,
    addMessage,
    addMessageWithStatus,
    getAgent,
    getMessage,
    getAgentContext,
    advanceAgentContext,
    beginAgentWork,
    finishAgentWork,
    attachArtifact,
    updateAgent,
    close: () => writeQueue,
  };
};
