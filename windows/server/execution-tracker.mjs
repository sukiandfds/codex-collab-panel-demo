const terminalPhases = new Set(["completed", "failed", "interrupted", "systemError"]);

const detailFromItem = (item) => {
  if (item?.type === "commandExecution") return String(item.command || "").split(/\r?\n/u)[0].slice(0, 140);
  if (item?.type === "fileChange") return `${item.changes?.length || 0} 个文件变更`;
  if (item?.type === "mcpToolCall") return [item.server, item.tool].filter(Boolean).join(" / ");
  if (item?.type === "dynamicToolCall") return item.tool || "";
  if (item?.type === "webSearch") return item.query || "";
  return "";
};

const stateFromItem = (item) => {
  switch (item?.type) {
    case "reasoning": return { phase: "working", label: "Codex 正在分析任务" };
    case "commandExecution": return { phase: "command", label: "Codex 正在执行命令" };
    case "fileChange": return { phase: "fileChange", label: "Codex 正在修改文件" };
    case "mcpToolCall":
    case "dynamicToolCall": return { phase: "tool", label: "Codex 正在调用工具" };
    case "webSearch": return { phase: "tool", label: "Codex 正在搜索资料" };
    case "agentMessage": return { phase: "responding", label: "Codex 正在回复" };
    default: return null;
  }
};

export const createExecutionTracker = ({ broadcast }) => {
  const statuses = new Map();

  const publish = (threadId, next) => {
    if (!threadId) return;
    const previous = statuses.get(threadId);
    const active = !terminalPhases.has(next.phase) && next.phase !== "idle";
    const status = {
      type: "execution_status",
      threadId,
      phase: next.phase,
      label: next.label,
      detail: next.detail || "",
      active,
      startedAt: active ? previous?.startedAt || new Date().toISOString() : previous?.startedAt || null,
      updatedAt: new Date().toISOString(),
    };
    statuses.set(threadId, status);
    broadcast(status);
  };

  const markSubmitted = (threadId) => publish(threadId, {
    phase: "submitted",
    label: "指令已发送，正在连接 Codex",
  });

  const markFailed = (threadId, error) => publish(threadId, {
    phase: "failed",
    label: "Codex 启动任务失败",
    detail: error instanceof Error ? error.message : String(error),
  });

  const handleProtocolMessage = (message) => {
    const { method, params = {} } = message || {};
    const threadId = params.threadId;
    if (!threadId) return;

    if (method === "turn/started") {
      publish(threadId, { phase: "working", label: "Codex 正在处理任务" });
      broadcast({ type: "sessions_changed", threadId });
      return;
    }
    if (method === "turn/completed") {
      const phase = params.turn?.status || "completed";
      const failed = phase === "failed";
      publish(threadId, {
        phase,
        label: failed ? "Codex 执行失败" : phase === "interrupted" ? "Codex 已中断" : "Codex 已完成",
        detail: params.turn?.error?.message || "",
      });
      broadcast({ type: "sessions_changed", threadId });
      return;
    }
    if (method === "thread/status/changed") {
      const status = params.status || {};
      if (status.type === "systemError") {
        publish(threadId, { phase: "systemError", label: "Codex 连接异常" });
      } else if (status.type === "active" && status.activeFlags?.includes("waitingOnApproval")) {
        publish(threadId, { phase: "waitingOnApproval", label: "需要在电脑端确认" });
      } else if (status.type === "active" && status.activeFlags?.includes("waitingOnUserInput")) {
        publish(threadId, { phase: "waitingOnUserInput", label: "Codex 正在等待补充信息" });
      } else if (status.type === "active") {
        publish(threadId, { phase: "working", label: "Codex 正在处理任务" });
      } else if (status.type === "idle" && !terminalPhases.has(statuses.get(threadId)?.phase)) {
        publish(threadId, { phase: "idle", label: "Codex 已就绪" });
      }
      return;
    }
    if (method === "item/started") {
      const state = stateFromItem(params.item);
      if (state) publish(threadId, { ...state, detail: detailFromItem(params.item) });
      return;
    }
    if (method === "item/completed") {
      if (params.item?.type === "agentMessage" && params.item.phase === "commentary") {
        const text = String(params.item.text || "").trim();
        if (text) {
          broadcast({
            type: "assistant_commentary",
            threadId,
            itemId: params.item.id || "",
            text,
          });
        }
      } else if (["userMessage", "agentMessage", "imageGeneration"].includes(params.item?.type)) {
        broadcast({ type: "sessions_changed", threadId });
      }
      return;
    }
    if (method?.endsWith("/requestApproval")) {
      publish(threadId, { phase: "waitingOnApproval", label: "需要在电脑端确认" });
      return;
    }
    if (method === "item/tool/requestUserInput" || method === "mcpServer/elicitation/request") {
      publish(threadId, { phase: "waitingOnUserInput", label: "Codex 正在等待补充信息" });
    }
  };

  const getStatus = (threadId) => statuses.get(threadId) || {
    type: "execution_status",
    threadId,
    phase: "idle",
    label: "Codex 已就绪",
    detail: "",
    active: false,
    startedAt: null,
    updatedAt: null,
  };

  return { markSubmitted, markFailed, handleProtocolMessage, getStatus };
};
