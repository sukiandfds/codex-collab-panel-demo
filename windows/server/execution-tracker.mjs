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

const activityFromItem = (item, completed = false) => {
  const state = stateFromItem(item);
  if (!state || item?.type === "agentMessage") return null;
  const labels = {
    reasoning: completed ? "已完成分析" : "正在分析任务",
    commandExecution: completed ? "已运行命令" : "正在运行命令",
    fileChange: completed ? "已修改文件" : "正在修改文件",
    mcpToolCall: completed ? "已调用工具" : "正在调用工具",
    dynamicToolCall: completed ? "已调用工具" : "正在调用工具",
    webSearch: completed ? "已搜索资料" : "正在搜索资料",
  };
  return {
    id: item.id || `${item.type}-${Date.now()}`,
    phase: state.phase,
    label: labels[item.type] || state.label,
    detail: detailFromItem(item),
    completed,
    updatedAt: new Date().toISOString(),
  };
};

export const createExecutionTracker = ({ broadcast }) => {
  const statuses = new Map();
  const messagePhases = new Map();

  const publish = (threadId, next) => {
    if (!threadId) return;
    const previous = statuses.get(threadId);
    const active = !terminalPhases.has(next.phase) && next.phase !== "idle";
    const now = new Date().toISOString();
    const beginsTurn = next.phase === "submitted" || (active && !previous?.active);
    let activities = beginsTurn ? [] : previous?.activities || [];
    if (next.activity) {
      const index = activities.findIndex((activity) => activity.id === next.activity.id);
      activities = index >= 0
        ? activities.map((activity, activityIndex) => activityIndex === index ? next.activity : activity)
        : [...activities, next.activity].slice(-12);
    }
    const status = {
      type: "execution_status",
      threadId,
      turnId: beginsTurn ? next.turnId || "" : next.turnId ?? previous?.turnId ?? "",
      phase: next.phase,
      label: next.label,
      detail: next.detail || "",
      commentary: beginsTurn ? "" : previous?.commentary || "",
      activities,
      active,
      startedAt: active ? beginsTurn ? now : previous?.startedAt || now : previous?.startedAt || null,
      updatedAt: now,
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

  const completeActivity = (threadId, item) => {
    const activity = activityFromItem(item, true);
    const previous = statuses.get(threadId);
    if (!activity || !previous) return;
    const index = previous.activities.findIndex((value) => value.id === activity.id);
    const activities = index >= 0
      ? previous.activities.map((value, activityIndex) => activityIndex === index ? activity : value)
      : [...previous.activities, activity].slice(-12);
    const status = { ...previous, activities, updatedAt: activity.updatedAt };
    statuses.set(threadId, status);
    broadcast(status);
  };

  const addCommentaryActivity = (threadId, itemId, text) => {
    const previous = statuses.get(threadId);
    if (!previous) return;
    const now = new Date().toISOString();
    const activity = {
      id: itemId || `commentary-${Date.now()}`,
      phase: "working",
      label: text,
      detail: "",
      completed: true,
      updatedAt: now,
    };
    const activities = [...previous.activities.filter((value) => value.id !== activity.id), activity].slice(-12);
    const status = { ...previous, commentary: text, activities, updatedAt: now };
    statuses.set(threadId, status);
    broadcast(status);
  };

  const handleProtocolMessage = (message) => {
    const { method, params = {} } = message || {};
    const threadId = params.threadId;
    if (!threadId) return;

    if (method === "turn/started") {
      publish(threadId, { phase: "working", label: "Codex 正在处理任务", turnId: params.turn?.id || "" });
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
      if (params.item?.type === "agentMessage") messagePhases.set(params.item.id, params.item.phase);
      const state = stateFromItem(params.item);
      if (state) publish(threadId, {
        ...state,
        detail: detailFromItem(params.item),
        activity: activityFromItem(params.item),
      });
      return;
    }
    if (method === "item/completed") {
      if (params.item?.type === "agentMessage" && params.item.phase === "commentary") {
        const text = String(params.item.text || "").trim();
        if (text) {
          addCommentaryActivity(threadId, params.item.id || "", text);
          broadcast({
            type: "assistant_commentary",
            threadId,
            itemId: params.item.id || "",
            text,
          });
        }
      } else if (["userMessage", "agentMessage", "imageGeneration"].includes(params.item?.type)) {
        broadcast({ type: "sessions_changed", threadId });
      } else {
        completeActivity(threadId, params.item);
      }
      if (params.item?.type === "agentMessage") messagePhases.delete(params.item.id);
      return;
    }
    if (method === "item/agentMessage/delta") {
      if (messagePhases.get(params.itemId) !== "commentary") {
        broadcast({ type: "assistant_delta", ...params });
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
    turnId: "",
    phase: "idle",
    label: "Codex 已就绪",
    detail: "",
    commentary: "",
    activities: [],
    active: false,
    startedAt: null,
    updatedAt: null,
  };

  return { markSubmitted, markFailed, handleProtocolMessage, getStatus };
};
