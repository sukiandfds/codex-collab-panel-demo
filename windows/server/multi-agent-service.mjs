import { randomUUID } from "node:crypto";
import { createAppServerClient } from "./app-server-client.mjs";
import { inputFromAttachments } from "./app-server-conversation-store.mjs";
import { employeeTurnInstructions } from "./employee-definitions.mjs";
import { buildDiscussionPrompt } from "./multi-agent/discussion-prompt.mjs";
import { cleanAgentIds, mentionedAgentIds, resolveAgentRouting } from "./multi-agent/agent-routing.mjs";
import { completeOutputJob } from "./multi-agent/output-job.mjs";
import { agentStateFromItem, terminalAgentPhases } from "./multi-agent/protocol-state.mjs";

const missingThreadPattern = /\bthread(?:\s+id)?\s+not\s+found\b/iu;

// Product "商讨" is reserved for a future explicit flow: selected Agents discuss in rounds,
// then the manager publishes one consolidated result.

const isMissingThreadError = (error) => missingThreadPattern.test(String(error?.message || error));

export { buildDiscussionPrompt } from "./multi-agent/discussion-prompt.mjs";
export { mentionedAgentIds } from "./multi-agent/agent-routing.mjs";

export const newMentionedAgentIds = (text, agents, scheduledAgentIds = []) => {
  const scheduled = scheduledAgentIds instanceof Set
    ? scheduledAgentIds
    : new Set(scheduledAgentIds);
  return mentionedAgentIds(text, agents).filter((agentId) => !scheduled.has(agentId));
};

export const createMultiAgentService = ({
  projectRoot,
  employeeWorkRoots = {},
  room,
  broadcast,
  webOutputs,
  attachmentContent,
  resolveAttachments = () => [],
  resolveArtifacts = () => [],
  onContextDelivered = async () => {},
  appServerClient = null,
}) => {
  const client = appServerClient || createAppServerClient();
  const threadAgents = new Map();
  const discussions = new Map();
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
    void setStatus(agentId, { active: false, ...patch });
  };

  const announceRunStarted = (run) => {
    if (!run || run.startedBroadcast) return;
    const work = {
      agentId: run.agentId,
      agentName: room.getAgent(run.agentId)?.name || "Codex Agent",
      workId: run.workId,
      startedAt: run.startedAt,
    };
    room.beginAgentWork?.(work);
    run.startedBroadcast = true;
    broadcast({ type: "group_agent_started", ...work });
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
    room.finishAgentWork?.(run.workId);
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
      const run = currentRun?.threadId === params.threadId ? currentRun : null;
      if (run) {
        run.turnId = String(params.turn?.id || params.turnId || run.turnId || "");
        if (run.stopRequested) void interruptRun(run).catch((error) => {
          console.warn(`[multi-agent] deferred interrupt failed: ${error.message}`);
        });
      }
      announceRunStarted(run);
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
      announceRunStarted(currentRun?.threadId === params.threadId ? currentRun : null);
      const workId = currentRun?.threadId === params.threadId
        ? currentRun.workId
        : `${agentId}:${params.itemId || "stream"}`;
      broadcast({ type: "group_agent_delta", ...params, agentId, workId });
      return;
    }
    if (method === "item/completed" && params.item?.type === "agentMessage" && params.item.phase !== "commentary") {
      const workId = currentRun?.threadId === params.threadId
        ? currentRun.workId
        : `${agentId}:${params.item.id || params.turnId || "message"}`;
      const messageWrite = room.addMessage({
        type: "agent",
        authorId: agentId,
        authorName: room.getAgent(agentId)?.name || "Codex Agent",
        agentId,
        text: params.item.text,
        workId,
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

  async function interruptRun(run) {
    if (!run?.threadId || !run.turnId || run.interruptSent) return false;
    run.interruptSent = true;
    try {
      await client.request("turn/interrupt", { threadId: run.threadId, turnId: run.turnId });
      return true;
    } catch (error) {
      run.interruptSent = false;
      throw error;
    }
  }

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
        cwd: employeeWorkRoots[agent.id] || projectRoot,
        developerInstructions: employeeTurnInstructions(currentAgent.instructions),
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

  const ensureAgentThread = async (agentId) => {
    const agent = room.getAgent(agentId);
    if (!agent) throw Object.assign(new Error("Agent 不存在"), { statusCode: 404 });
    return ensureThread(agent);
  };

  const runAgent = async ({ agentId, attachments, outputJob, discussion }) => {
    if (closed) throw new Error("多 Agent 服务已关闭");
    const agent = room.getAgent(agentId);
    if (!agent) throw Object.assign(new Error("Agent 不存在"), { statusCode: 404 });

    await setStatus(agentId, { phase: "submitted", label: "已接收群聊任务", detail: "正在连接 Codex", active: true });
    const threadId = await ensureThread(agent);
    if (discussion.cancelled) {
      finishStatus(agentId, { phase: "interrupted", label: "任务已中断", detail: "" });
      return { status: "interrupted", text: "", message: null };
    }
    const outputInstructions = outputJob && outputJob.agentId === agentId
      ? webOutputs.buildAgentInstructions(outputJob)
      : "";
    const roomSnapshot = room.snapshot();
    const context = room.getAgentContext(agentId);
    const contextAttachmentIds = [...new Set(context.messages.flatMap((message) => (
      Array.isArray(message.attachments) ? message.attachments.map((file) => file.id) : []
    )))];
    const contextAttachments = typeof resolveAttachments === "function"
      ? resolveAttachments(contextAttachmentIds)
      : [];
    const contextArtifactIds = [...new Set(context.messages.flatMap((message) => (
      Array.isArray(message.artifactIds) ? message.artifactIds : []
    )))];
    const contextArtifacts = typeof resolveArtifacts === "function"
      ? resolveArtifacts(contextArtifactIds)
      : [];
    const inputAttachments = [...new Map([
      ...attachments,
      ...contextAttachments,
      ...contextArtifacts,
    ].filter((attachment) => attachment?.id).map((attachment) => [attachment.id, attachment])).values()];
    const prompt = buildDiscussionPrompt({
      agent,
      agents: roomSnapshot.agents,
      messages: context.messages,
      outputInstructions,
      targetProjectRoot: projectRoot,
    });
    let resolveRun;
    const completion = new Promise((resolve) => { resolveRun = resolve; });
    const timer = setTimeout(() => {
      if (currentRun?.threadId !== threadId) return;
      room.finishAgentWork?.(currentRun.workId);
      currentRun = null;
      void setStatus(agentId, { phase: "failed", label: "等待回复超时", detail: "", active: false });
      resolveRun({ status: "failed", text: "" });
    }, 30 * 60 * 1000);
    timer.unref?.();
    currentRun = {
      agentId,
      threadId,
      resolve: resolveRun,
      timer,
      finalText: "",
      messageWrite: null,
      workId: randomUUID(),
      startedAt: new Date().toISOString(),
      startedBroadcast: false,
      discussion,
      turnId: "",
      stopRequested: false,
      interruptSent: false,
    };

    try {
      const started = await client.request("turn/start", {
        threadId,
        input: await inputFromAttachments(prompt, inputAttachments, attachmentContent),
        cwd: projectRoot,
        developerInstructions: employeeTurnInstructions(agent.instructions),
      });
      try {
        await onContextDelivered({ agentId, threadId, messages: context.messages });
      } catch (error) {
        console.warn(`[multi-agent] employee context projection failed: ${error.message}`);
      }
      if (currentRun?.threadId === threadId) {
        currentRun.turnId = String(started?.turn?.id || currentRun.turnId || "");
        if (currentRun.stopRequested) await interruptRun(currentRun);
      }
      const result = await completion;
      if (result.status === "completed") await room.advanceAgentContext(agentId, context.throughSequence);
      return result;
    } catch (error) {
      if (currentRun?.threadId === threadId) {
        room.finishAgentWork?.(currentRun.workId);
        currentRun = null;
      }
      clearTimeout(timer);
      finishStatus(agentId, { phase: "failed", label: "任务启动失败", detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  const runDiscussion = async ({ agentIds, requestText, attachments, outputJob, discussion }) => {
    const agents = room.snapshot().agents;
    const pendingAgentIds = cleanAgentIds(agentIds, agents);
    const scheduledAgentIds = new Set(pendingAgentIds);
    for (let index = 0; index < pendingAgentIds.length; index += 1) {
      if (discussion.cancelled) break;
      const agentId = pendingAgentIds[index];
      try {
        const result = await runAgent({ agentId, attachments, outputJob, discussion });
        if (discussion.cancelled || result.status === "interrupted") {
          if (outputJob) webOutputs.abandonJob(outputJob.jobId);
          break;
        }
        if (outputJob && outputJob.agentId === agentId) {
          await completeOutputJob({ outputJob, result, agentId, room, webOutputs, setStatus, finishStatus });
          return;
        }
        if (result.status === "completed") {
          // Temporary safety boundary: an employee can be awakened only once per round.
          // Revisit this rule when repeated handoffs have a concrete product need.
          for (const mentionedAgentId of newMentionedAgentIds(result.text, agents, scheduledAgentIds)) {
            scheduledAgentIds.add(mentionedAgentId);
            pendingAgentIds.push(mentionedAgentId);
          }
        }
      } catch (error) {
        if (outputJob) webOutputs.abandonJob(outputJob.jobId);
        await room.addMessage({
          type: "system",
          authorId: "system",
          authorName: "系统",
          agentId,
          text: `${room.getAgent(agentId)?.name || "Agent"}启动失败：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  };

  const enqueueDiscussion = async ({ agentIds, requestText, attachments = [], sourceMessageId = "", explicitAgentIds, outputRequested = false }) => {
    const agents = room.snapshot().agents;
    const routing = resolveAgentRouting({
      text: requestText,
      requestedAgentIds: agentIds,
      explicitAgentIds,
      agents,
      outputRequested,
    });
    const targets = routing.targetAgentIds;
    if (!targets.length) throw Object.assign(new Error("请选择一个可用 Agent"), { statusCode: 404 });
    const explicitTargets = routing.explicitAgentIds;
    const canCreateOutputJob = Boolean(routing.outputAgentId) && (!explicitTargets.length
      || (explicitTargets.length === 1 && targets.length === 1 && targets[0] === routing.outputAgentId));
    const outputJob = canCreateOutputJob && outputRequested
      ? await webOutputs.createJob({ sourceMessageId, agentId: routing.outputAgentId })
      : null;
    const jobId = outputJob?.jobId || randomUUID();
    const discussion = { jobId, agentIds: targets, outputJob, cancelled: false };
    discussions.set(jobId, discussion);
    void setStatus(targets[0], { phase: "queued", label: "已加入讨论队列", detail: "", active: true });
    workQueue = workQueue
      .catch(() => {})
      .then(() => discussion.cancelled
        ? undefined
        : runDiscussion({ agentIds: targets, requestText, attachments, outputJob, discussion }))
      .catch((error) => console.warn(`[multi-agent] discussion ${jobId} failed: ${error.message}`))
      .finally(() => discussions.delete(jobId));
    return { jobId, agentIds: targets, status: "queued" };
  };

  const interruptDiscussion = async () => {
    const pending = [...discussions.values()].filter((discussion) => !discussion.cancelled);
    if (!pending.length && !currentRun) {
      throw Object.assign(new Error("当前群聊没有可停止的任务"), { statusCode: 409 });
    }
    for (const discussion of pending) {
      discussion.cancelled = true;
      if (discussion.outputJob) webOutputs.abandonJob(discussion.outputJob.jobId);
    }
    const interruptedAgentIds = [...new Set(pending.flatMap((discussion) => discussion.agentIds))];
    const run = currentRun;
    if (run) {
      run.stopRequested = true;
      await setStatus(run.agentId, { phase: "working", label: "正在停止任务", detail: "", active: true });
      await interruptRun(run);
    }
    for (const agentId of interruptedAgentIds) {
      if (agentId === run?.agentId) continue;
      finishStatus(agentId, { phase: "interrupted", label: "任务已中断", detail: "" });
    }
    await room.addMessage({
      type: "system",
      authorId: "system",
      authorName: "系统",
      agentId: null,
      text: "您终止了本次任务。",
    });
    return {
      status: run ? "interrupting" : "interrupted",
      interruptedAgentIds,
      cancelledDiscussionCount: pending.length,
    };
  };

  const close = () => {
    closed = true;
    for (const discussion of discussions.values()) discussion.cancelled = true;
    discussions.clear();
    if (currentRun) {
      clearTimeout(currentRun.timer);
      room.finishAgentWork?.(currentRun.workId);
      currentRun.resolve({ status: "interrupted", text: currentRun.finalText });
      currentRun = null;
    }
    unsubscribe();
    client.close();
  };

  return { enqueueDiscussion, interruptDiscussion, updateAgentSettings, ensureAgentThread, close };
};
