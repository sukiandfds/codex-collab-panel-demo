import { createAppServerClient } from "./app-server-client.mjs";

const terminalPhases = new Set(["completed", "failed", "interrupted", "systemError"]);

const itemState = (item) => {
  switch (item?.type) {
    case "reasoning": return { phase: "working", label: "正在分析任务", detail: "" };
    case "commandExecution": return { phase: "command", label: "正在执行命令", detail: String(item.command || "").split(/\r?\n/u)[0].slice(0, 120) };
    case "fileChange": return { phase: "fileChange", label: "正在修改文件", detail: `${item.changes?.length || 0} 个文件变更` };
    case "mcpToolCall": return { phase: "tool", label: "正在调用工具", detail: [item.server, item.tool].filter(Boolean).join(" / ") };
    case "dynamicToolCall": return { phase: "tool", label: "正在调用工具", detail: item.tool || "" };
    case "webSearch": return { phase: "tool", label: "正在搜索资料", detail: item.query || "" };
    case "agentMessage": return { phase: "responding", label: "正在整理回复", detail: "" };
    default: return null;
  }
};

export const createMultiAgentService = ({ projectRoot, room, broadcast }) => {
  const client = createAppServerClient();
  const threadAgents = new Map();
  const activeModes = new Map();
  let activeAgentId = null;

  for (const agent of room.snapshot().agents) {
    if (agent.threadId) threadAgents.set(agent.threadId, agent.id);
  }

  const setStatus = (agentId, patch) => room.updateAgent(agentId, {
    active: !terminalPhases.has(patch.phase) && patch.phase !== "idle",
    ...patch,
  }).catch((error) => console.warn(`[multi-agent] status update failed: ${error.message}`));

  const finish = (agentId, patch) => {
    if (activeAgentId === agentId) activeAgentId = null;
    activeModes.delete(agentId);
    void setStatus(agentId, { active: false, ...patch });
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
      finish(agentId, {
        phase: status,
        label: status === "failed" ? "执行失败" : status === "interrupted" ? "任务已中断" : "任务已完成",
        detail: params.turn?.error?.message || "",
      });
      return;
    }
    if (method === "item/started") {
      const state = itemState(params.item);
      if (state) void setStatus(agentId, { ...state, active: true });
      return;
    }
    if (method === "item/agentMessage/delta") {
      broadcast({ type: "group_agent_delta", agentId, ...params });
      return;
    }
    if (method === "item/completed" && params.item?.type === "agentMessage" && params.item.phase !== "commentary") {
      void room.addMessage({
        type: "agent",
        authorId: agentId,
        authorName: room.getAgent(agentId)?.name || "Codex Agent",
        agentId,
        mode: activeModes.get(agentId) || "development",
        text: params.item.text,
      });
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
    if (agent.threadId) {
      await client.request("thread/resume", { threadId: agent.threadId, persistExtendedHistory: true });
      threadAgents.set(agent.threadId, agent.id);
      return agent.threadId;
    }
    const result = await client.request("thread/start", {
      cwd: projectRoot,
      developerInstructions: agent.instructions,
      ephemeral: false,
      serviceName: "codex-collab-panel-demo",
    });
    const threadId = result.thread.id;
    threadAgents.set(threadId, agent.id);
    await client.request("thread/name/set", { threadId, name: `${agent.name} · ${agent.responsibility}` });
    await room.updateAgent(agent.id, { threadId, phase: "idle", label: "等待任务", detail: "", active: false });
    return threadId;
  };

  const dispatch = async (agentId, text, mode, onAccepted) => {
    const agent = room.getAgent(agentId);
    if (!agent) throw Object.assign(new Error("请选择一个可用 Agent"), { statusCode: 404 });
    if (activeAgentId) {
      const active = room.getAgent(activeAgentId);
      throw Object.assign(new Error(`${active?.name || "其他 Agent"}正在工作，请等待当前任务完成`), { statusCode: 409 });
    }
    activeAgentId = agentId;
    activeModes.set(agentId, mode);
    try {
      await onAccepted?.();
      await setStatus(agentId, { phase: "submitted", label: "任务已提交", detail: "正在连接 Codex", active: true });
      const threadId = await ensureThread(agent);
      const result = await client.request("turn/start", {
        threadId,
        input: [{ type: "text", text, text_elements: [] }],
        cwd: projectRoot,
      });
      return { agentId, threadId, turnId: result.turn?.id || "", status: result.turn?.status || "inProgress" };
    } catch (error) {
      finish(agentId, { phase: "failed", label: "任务启动失败", detail: error instanceof Error ? error.message : String(error) });
      await room.addMessage({
        type: "system",
        authorId: "system",
        authorName: "系统",
        agentId,
        mode,
        text: `${agent.name}启动失败：${error instanceof Error ? error.message : String(error)}`,
      });
      throw error;
    }
  };

  const close = () => {
    unsubscribe();
    client.close();
  };

  return { dispatch, close };
};
