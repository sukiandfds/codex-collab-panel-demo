import { activityFromItem, detailFromItem, maxActivities, stateFromItem, terminalPhases } from "./execution/activity.mjs";

export const createExecutionTracker = ({ broadcast }) => {
  const statuses = new Map();
  const messagePhases = new Map();
  const reasoningBuffers = new Map();

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
        : [...activities, next.activity].slice(-maxActivities);
    }
    const status = {
      type: "execution_status",
      threadId,
      turnId: beginsTurn ? next.turnId || "" : next.turnId ?? previous?.turnId ?? "",
      phase: next.phase,
      label: next.label,
      detail: next.detail || "",
      commentary: beginsTurn ? "" : previous?.commentary || "",
      streamingItemId: beginsTurn || !active ? "" : previous?.streamingItemId || "",
      streamingText: beginsTurn || !active ? "" : previous?.streamingText || "",
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

  const markFailed = (threadId, error) => {
    const current = statuses.get(threadId);
    if (current?.turnId && current.phase !== "submitted") return;
    publish(threadId, {
      phase: "failed",
      label: "Codex 启动任务失败",
      detail: error instanceof Error ? error.message : String(error),
    });
  };

  const completeActivity = (threadId, item) => {
    const previous = statuses.get(threadId);
    if (!previous) return;
    const existingReasoning = item?.type === "reasoning"
      ? previous.activities.find((value) => value.id === "reasoning-current")
      : null;
    const activity = existingReasoning?.detail
      ? { ...existingReasoning, label: "分析完成", completed: true, updatedAt: new Date().toISOString() }
      : activityFromItem(item, true);
    if (!activity) return;
    const index = previous.activities.findIndex((value) => value.id === activity.id);
    const activities = index >= 0
      ? previous.activities.map((value, activityIndex) => activityIndex === index ? activity : value)
      : [...previous.activities, activity].slice(-maxActivities);
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
    const activities = [...previous.activities.filter((value) => value.id !== activity.id), activity].slice(-maxActivities);
    const status = { ...previous, commentary: text, activities, updatedAt: now };
    statuses.set(threadId, status);
    broadcast(status);
  };

  const addReasoningSummary = (threadId, itemId, delta) => {
    const addition = String(delta || "");
    if (!addition || !threadId) return;
    const previousBuffer = reasoningBuffers.get(threadId);
    const text = `${previousBuffer?.itemId === itemId ? previousBuffer.text : ""}${addition}`
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 600);
    reasoningBuffers.set(threadId, { itemId, text });
    if (!text) return;
    publish(threadId, {
      phase: "working",
      label: "Codex 正在分析任务",
      detail: text,
      activity: {
        id: "reasoning-current",
        phase: "working",
        label: "正在分析任务",
        detail: text,
        completed: false,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  const handleProtocolMessage = (message) => {
    const { method, params = {} } = message || {};
    const threadId = params.threadId;
    if (!threadId) return;

    if (method === "turn/started") {
      reasoningBuffers.delete(threadId);
      publish(threadId, { phase: "working", label: "Codex 正在处理任务", turnId: params.turn?.id || "" });
      broadcast({ type: "sessions_changed", threadId });
      return;
    }
    if (method === "turn/completed") {
      reasoningBuffers.delete(threadId);
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
    if (method === "item/reasoning/summaryTextDelta") {
      addReasoningSummary(threadId, params.itemId || "reasoning", params.delta);
      return;
    }
    if (method === "item/agentMessage/delta") {
      if (messagePhases.get(params.itemId) !== "commentary") {
        const previous = statuses.get(threadId);
        if (previous) {
          const streamingText = previous.streamingItemId === params.itemId
            ? previous.streamingText + String(params.delta || "")
            : String(params.delta || "");
          statuses.set(threadId, {
            ...previous,
            streamingItemId: params.itemId || "",
            streamingText,
            updatedAt: new Date().toISOString(),
          });
        }
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
    streamingItemId: "",
    streamingText: "",
    activities: [],
    active: false,
    startedAt: null,
    updatedAt: null,
  };

  return { markSubmitted, markFailed, handleProtocolMessage, getStatus };
};
