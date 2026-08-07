import { randomUUID } from "node:crypto";
import { createAppServerClient } from "./app-server-client.mjs";
import { inputFromAttachments } from "./app-server-conversation-store.mjs";
import { buildDiscussionPrompt, cleanAgentIds, mentionedAgentIds } from "./multi-agent/discussion-prompt.mjs";
import { completeOutputJob } from "./multi-agent/output-job.mjs";
import { agentStateFromItem, terminalAgentPhases } from "./multi-agent/protocol-state.mjs";

const maxDiscussionTurns = 4;
const missingThreadPattern = /\bthread(?:\s+id)?\s+not\s+found\b/iu;

const isMissingThreadError = (error) => missingThreadPattern.test(String(error?.message || error));

export { buildDiscussionPrompt, mentionedAgentIds } from "./multi-agent/discussion-prompt.mjs";

export const createMultiAgentService = ({ projectRoot, room, broadcast, webOutputs }) => {
  const client = createAppServerClient();
  const threadAgents = new Map();
  const activeModes = new Map();
  let currentRun = null;
  let workQueue = Promise.resolve();
  let closed = false;

  for (const agent of room.snapshot().agents) {
    if (agent.threadId) threadAgents.set(agent.threadId, agent.id);
  }

  const setStatus = (agentId, patch) => room.updateAgent(agentId, {
    active: !terminalAgentPhases.has(patch.phase) && patch.phase !== "idle",
    ...patch,
  }).catch((error) => console.warn(`[multi-agent] status update failed: ${error.message}`));

  const finishStatus = (agentId, patch) => {
    activeModes.delete(agentId);
    void setStatus(agentId, { active: false, ...patch });
  };

  const clearAgentThread = async (agent) => {
    const threadId = agent?.threadId;
    if (!threadId) return room.getAgent(agent?.id) || agent;
    threadAgents.delete(threadId);
    const current = room.getAgent(agent.id);
    if (!current || current.threadId !== threadId) return current || agent;
    return room.updateAgent(agent.id, {
      threadId: null,
      phase: "idle",
      label: "尚未启动",
      detail: "",
      active: false,
    });
  };

  const applyAgentSettings = async (agent) => {
    if (!agent.threadId) return true;
    try {
      if (agent.model) await client.request("thread/settings/update", { threadId: agent.threadId, model: agent.model });
      if (agent.reasoningEffort) await client.request("thread/settings/update", { threadId: agent.threadId, effort: agent.reasoningEffort });
      return true;
    } catch (error) {
      if (!isMissingThreadError(error)) throw error;
      await clearAgentThread(agent);
      return false;
    }
  };

  const settleRun = (threadId, status, errorMessage = "") => {
    const run = currentRun;
    if (!run || run.threadId !== threadId) return;
    currentRun = null;
    clearTimeout(run.timer);
    finishStatus(run.agentId, {
      phase: status,
      label: status === "failed" ? "执行失败" : status === "interrupted" ? "任务已中断" : "任务已完成",
      detail: errorMessage,
    });
    Promise.resolve(run.messageWrite)
      .then((message) => run.resolve({ status, text: run.finalText, message: message || null }))
      .catch(() => run.resolve({ status, text: run.finalText, message: null }));
  };

  const handleProtocolMessage = (message) => {
    const { method, params = {} } = message || {};
    const agentId = threadAgents.get(params.threadId);
    if (!agentId) return;

    if (method === "turn/started") {
      void setStatus(agentId, { phase: "working", label: "正在处理任务", detail: "", active: true });
      return;
    }
    if (method === "turn/completed") {
      const status = params.turn?.status || "completed";
      settleRun(params.threadId, status, params.turn?.error?.message || "");
      return;
    }
    if (method === "item/started") {
      const state = agentStateFromItem(params.item);
      if (state) void setStatus(agentId, { ...state, active: true });
      return;
    }
    if (method === "item/agentMessage/delta") {
      broadcast({ type: "group_agent_delta", agentId, ...params });
      return;
    }
    if (method === "item/completed" && params.item?.type === "agentMessage" && params.item.phase !== "commentary") {
      const messageWrite = room.addMessage({
        type: "agent",
        authorId: agentId,
        authorName: room.getAgent(agentId)?.name || "Codex Agent",
        agentId,
        mode: activeModes.get(agentId) || "discussion",
        text: params.item.text,
      });
      if (currentRun?.threadId === params.threadId) {
        currentRun.finalText = params.item.text;
        currentRun.messageWrite = messageWrite;
      }
      void messageWrite.catch((error) => console.warn(`[multi-agent] message write failed: ${error.message}`));
      return;
    }
    if (method?.endsWith("/requestApproval")) {
      void setStatus(agentId, { phase: "waitingOnApproval", label: "等待电脑端审批", detail: "", active: true });
      return;
    }
    if (method === "item/tool/requestUserInput" || method === "mcpServer/elicitation/request") {
      void setStatus(agentId, { phase: "waitingOnUserInput", label: "等待补充信息", detail: "", active: true });
    }
  };

  const unsubscribe = client.subscribe(handleProtocolMessage);

  const ensureThread = async (agent) => {
    let currentAgent = agent;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (currentAgent.threadId) {
        try {
          await client.request("thread/resume", { threadId: currentAgent.threadId, persistExtendedHistory: true });
        } catch (error) {
          if (!isMissingThreadError(error)) throw error;
          currentAgent = await clearAgentThread(currentAgent);
          continue;
        }
        if (await applyAgentSettings(currentAgent)) {
          threadAgents.set(currentAgent.threadId, currentAgent.id);
          return currentAgent.threadId;
        }
        currentAgent = room.getAgent(currentAgent.id) || { ...currentAgent, threadId: null };
        continue;
      }

      const result = await client.request("thread/start", {
        cwd: projectRoot,
        developerInstructions: currentAgent.instructions,
        ephemeral: false,
        serviceName: "negus",
      });
      const threadId = result.thread.id;
      threadAgents.set(threadId, currentAgent.id);
      await client.request("thread/name/set", { threadId, name: `${currentAgent.name} · ${currentAgent.responsibility}` });
      const nextAgent = await room.updateAgent(currentAgent.id, { threadId, phase: "idle", label: "等待任务", detail: "", active: false });
      if (await applyAgentSettings(nextAgent)) return threadId;
      currentAgent = room.getAgent(currentAgent.id) || { ...nextAgent, threadId: null };
    }
    throw new Error("无法建立 Agent Thread");
  };

  const updateAgentSettings = async (agentId, settings) => {
    const agent = room.getAgent(agentId);
    if (!agent) throw Object.assign(new Error("Agent 不存在"), { statusCode: 404 });
    const nextSettings = {
      model: String(settings.model || "").trim().slice(0, 120),
      reasoningEffort: String(settings.reasoningEffort || "").trim().slice(0, 40),
    };
    if (!nextSettings.model || !nextSettings.reasoningEffort) {
      throw Object.assign(new Error("模型和推理强度不能为空"), { statusCode: 400 });
    }
    if (!currentRun || currentRun.agentId !== agentId) {
      await applyAgentSettings({ ...agent, ...nextSettings });
    }
    return room.updateAgent(agentId, nextSettings);
  };

  const runAgent = async ({ agentId, mode, attachments, outputJob }) => {
    if (closed) throw new Error("多 Agent 服务已关闭");
    const agent = room.getAgent(agentId);
    if (!agent) throw Object.assign(new Error("Agent 不存在"), { statusCode: 404 });

    await setStatus(agentId, { phase: "submitted", label: "已接收群聊任务", detail: "正在连接 Codex", active: true });
    const threadId = await ensureThread(agent);
    const outputInstructions = outputJob && outputJob.agentId === agentId
      ? webOutputs.buildAgentInstructions(outputJob)
      : "";
    const roomSnapshot = room.snapshot();
    const context = room.getAgentContext(agentId);
    const prompt = buildDiscussionPrompt({
      agent,
      agents: roomSnapshot.agents,
      mode,
      messages: context.messages,
      outputInstructions,
    });
    activeModes.set(agentId, mode);

    let resolveRun;
    const completion = new Promise((resolve) => { resolveRun = resolve; });
    const timer = setTimeout(() => {
      if (currentRun?.threadId !== threadId) return;
      currentRun = null;
      activeModes.delete(agentId);
      void setStatus(agentId, { phase: "failed", label: "等待回复超时", detail: "", active: false });
      resolveRun({ status: "failed", text: "" });
    }, 30 * 60 * 1000);
    timer.unref?.();
    currentRun = { agentId, threadId, resolve: resolveRun, timer, finalText: "", messageWrite: null };

    try {
      await client.request("turn/start", {
        threadId,
        input: inputFromAttachments(prompt, attachments),
        cwd: projectRoot,
      });
      const result = await completion;
      if (result.status === "completed") await room.advanceAgentContext(agentId, context.throughSequence);
      return result;
    } catch (error) {
      if (currentRun?.threadId === threadId) currentRun = null;
      clearTimeout(timer);
      finishStatus(agentId, { phase: "failed", label: "任务启动失败", detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  const runDiscussion = async ({ agentIds, mode, requestText, attachments, outputJob }) => {
    const agents = room.snapshot().agents;
    const pending = cleanAgentIds(agentIds, agents);
    const runCounts = new Map();
    let needsManagerFollowUp = pending.some((id) => id !== "manager");
    let turns = 0;

    while (turns < maxDiscussionTurns) {
      if (!pending.length && needsManagerFollowUp && (runCounts.get("manager") || 0) < 2) {
        pending.push("manager");
        needsManagerFollowUp = false;
      }
      const agentId = pending.shift();
      if (!agentId) break;
      const limit = agentId === "manager" ? 2 : 1;
      if ((runCounts.get(agentId) || 0) >= limit) continue;
      if (agentId === "manager" && needsManagerFollowUp) needsManagerFollowUp = false;

      try {
        const result = await runAgent({ agentId, mode, attachments, outputJob });
        turns += 1;
        runCounts.set(agentId, (runCounts.get(agentId) || 0) + 1);
        if (outputJob && outputJob.agentId === agentId) {
          await completeOutputJob({ outputJob, result, agentId, mode, room, webOutputs, setStatus, finishStatus });
          return;
        }
        if (agentId !== "manager") needsManagerFollowUp = true;

        for (const mentionedId of mentionedAgentIds(result.text, room.snapshot().agents)) {
          const mentionedLimit = mentionedId === "manager" ? 2 : 1;
          if (mentionedId !== agentId
            && (runCounts.get(mentionedId) || 0) < mentionedLimit
            && !pending.includes(mentionedId)) {
            pending.push(mentionedId);
          }
        }
      } catch (error) {
        if (outputJob) webOutputs.abandonJob(outputJob.jobId);
        turns += 1;
        runCounts.set(agentId, (runCounts.get(agentId) || 0) + 1);
        await room.addMessage({
          type: "system",
          authorId: "system",
          authorName: "系统",
          agentId,
          mode,
          text: `${room.getAgent(agentId)?.name || "Agent"}启动失败：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  };

  const enqueueDiscussion = async ({ agentIds, mode, requestText, attachments = [], sourceMessageId = "" }) => {
    const agents = room.snapshot().agents;
    let targets = cleanAgentIds(agentIds, agents);
    if (!targets.length) throw Object.assign(new Error("请选择一个可用 Agent"), { statusCode: 404 });
    const outputJob = webOutputs?.isRequest(requestText)
      ? await webOutputs.createJob({ sourceMessageId, agentId: "developer" })
      : null;
    if (outputJob) targets = ["developer"];
    const executionMode = outputJob ? "development" : mode;
    const jobId = outputJob?.jobId || randomUUID();
    void setStatus(targets[0], { phase: "queued", label: "已加入讨论队列", detail: "", active: true });
    workQueue = workQueue
      .catch(() => {})
      .then(() => runDiscussion({ agentIds: targets, mode: executionMode, requestText, attachments, outputJob }))
      .catch((error) => console.warn(`[multi-agent] discussion ${jobId} failed: ${error.message}`));
    return { jobId, agentIds: targets, status: "queued" };
  };

  const close = () => {
    closed = true;
    if (currentRun) {
      clearTimeout(currentRun.timer);
      currentRun.resolve({ status: "interrupted", text: currentRun.finalText });
      currentRun = null;
    }
    unsubscribe();
    client.close();
  };

  return { enqueueDiscussion, updateAgentSettings, close };
};
