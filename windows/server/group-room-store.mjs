import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const agentDefinitions = [
  {
    id: "manager",
    name: "项目经理 Agent",
    shortName: "PM",
    responsibility: "澄清目标、拆解任务、汇总结论",
    instructions: "你是当前项目群的项目经理 Agent。优先澄清目标、拆解任务、识别依赖与风险，并给出简洁、可执行的项目结论。除非用户明确要求你直接修改代码，否则不要修改文件。遵守项目中的 AGENTS.md 和现有维护边界。最终回复会公开显示在项目群中，请只输出对团队有用的结果，不展示隐藏推理。",
  },
  {
    id: "researcher",
    name: "研究 Agent",
    shortName: "研",
    responsibility: "只读调研、技术验证、方案比较",
    instructions: "你是当前项目群的研究 Agent。只进行只读检查、技术调研、证据收集和方案比较，不修改项目文件、配置或本机环境。遵守项目中的 AGENTS.md。最终回复会公开显示在项目群中，请提供事实、来源、风险和建议，不展示隐藏推理。",
  },
  {
    id: "developer",
    name: "开发 Agent",
    shortName: "开",
    responsibility: "实现明确任务、运行基础代码检查",
    instructions: "你是当前项目群的开发 Agent。只在用户给出明确开发任务时修改代码，并保持快速、轻量、最小范围；遵守项目中的 AGENTS.md、现有架构和 pnpm 约束。不要擅自修改既有 UI 样式、全局环境或 Codex JSONL。完成后只做与改动相称的基础检查。最终回复会公开显示在项目群中，请简洁说明结果和未完成事项，不展示隐藏推理。",
  },
  {
    id: "reviewer",
    name: "审查 Agent",
    shortName: "审",
    responsibility: "只读检查缺陷、风险和遗漏",
    instructions: "你是当前项目群的审查 Agent。默认只读审查现有实现，优先发现真实 Bug、回归风险、安全问题和缺失检查，不修改文件，除非用户之后明确授权修复。遵守项目中的 AGENTS.md。最终回复会公开显示在项目群中，请按严重程度给出简洁结论，不展示隐藏推理。",
  },
];

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

export const createGroupRoomStore = async ({ stateFile, project, broadcast }) => {
  let stored = {};
  try {
    stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
  } catch {}

  const savedAgents = new Map((Array.isArray(stored.agents) ? stored.agents : []).map((agent) => [agent.id, agent]));
  const storedContextSequences = stored.agentContextSequences && typeof stored.agentContextSequences === "object"
    && !Array.isArray(stored.agentContextSequences) ? stored.agentContextSequences : {};
  const agents = new Map(agentDefinitions.map((definition) => [definition.id, initialAgent(definition, savedAgents.get(definition.id))]));
  const agentContextSequences = new Map(agentDefinitions.map((definition) => [
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
      version: 3,
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
  const activeMembers = () => {
    const cutoff = Date.now() - 60000;
    return [...members.values()].filter((member) => Date.parse(member.lastSeenAt) >= cutoff);
  };

  const snapshot = () => ({
    project,
    room: { id: "current-project", name: `${project} 项目群` },
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
    broadcast({ type: "group_members_changed", members: activeMembers() });
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
    broadcast({ type: "group_message_created", message });
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
    broadcast({ type: "group_message_updated", message: { ...message } });
    return message;
  };

  const updateAgent = async (agentId, patch) => {
    const current = agents.get(agentId);
    if (!current) throw Object.assign(new Error("Agent 不存在"), { statusCode: 404 });
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    agents.set(agentId, next);
    await persist();
    const agent = publicAgent(next);
    broadcast({ type: "group_agent_updated", agent });
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
