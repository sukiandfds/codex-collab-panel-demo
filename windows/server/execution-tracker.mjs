import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { activityFromItem, detailFromItem, maxActivities, stateFromItem, terminalPhases } from "./execution/activity.mjs";

export const createExecutionTracker = ({ broadcast, stateFile = "" }) => {
  const statuses = new Map();
  const messagePhases = new Map();
  const reasoningBuffers = new Map();
  const protocolEventTimes = new Map();
  let persistTimer;
  let persistChain = Promise.resolve();

  if (stateFile) {
    try {
      const stored = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      for (const status of stored.statuses || []) {
        if (!status?.threadId) continue;
        statuses.set(status.threadId, status.active ? {
          ...status,
          phase: "interrupted",
          label: "项目服务已重启，上一任务已中断",
          active: false,
          streamingItemId: "",
          streamingText: "",
          updatedAt: new Date().toISOString(),
        } : status);
      }
    } catch {}
  }

  const persist = () => {
    if (!stateFile) return Promise.resolve();
    const payload = `${JSON.stringify({
      version: 1,
      statuses: [...statuses.values()].slice(-50),
    }, null, 2)}\n`;
    persistChain = persistChain.catch(() => {}).then(async () => {
      await fsp.mkdir(path.dirname(stateFile), { recursive: true });
      const temporary = `${stateFile}.${process.pid}.tmp`;
      await fsp.writeFile(temporary, payload, "utf8");
      await fsp.rename(temporary, stateFile);
    }).catch((error) => console.warn(`[execution-tracker] state persistence failed: ${error.message}`));
    return persistChain;
  };

  const schedulePersist = () => {
    if (!stateFile) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void persist(), 200);
    persistTimer.unref?.();
  };

  const publish = (threadId, next) => {
    if (!threadId) return;
    const previous = statuses.get(threadId);
    const active = next.active ?? (!terminalPhases.has(next.phase) && next.phase !== "idle");
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
      durationMs: beginsTurn ? next.durationMs ?? null : next.durationMs ?? previous?.durationMs ?? null,
      lastEventAt: protocolEventTimes.get(threadId) || previous?.lastEventAt || null,
      lastProbeAt: next.lastProbeAt ?? previous?.lastProbeAt ?? null,
    };
    statuses.set(threadId, status);
    schedulePersist();
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
    schedulePersist();
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
    schedulePersist();
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
    protocolEventTimes.set(threadId, new Date().toISOString());

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
        durationMs: Number.isFinite(params.turn?.durationMs) ? params.turn.durationMs : null,
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
        if (params.item?.type === "agentMessage" && params.item?.phase !== "commentary") {
          publish(threadId, {
            phase: "finalizing",
            label: "回复已完成，正在收尾",
            active: true,
          });
        }
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
          schedulePersist();
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
    durationMs: null,
    lastEventAt: null,
    lastProbeAt: null,
  };

  const handleHealthState = (event = {}) => {
    const threadId = event.threadId;
    if (!threadId) return;
    const lastProbeAt = new Date().toISOString();
    if (event.phase === "healthy") {
      const current = statuses.get(threadId);
      if (current) {
        statuses.set(threadId, { ...current, lastProbeAt });
        schedulePersist();
      }
      return;
    }
    if (event.phase === "authoritative") {
      const current = statuses.get(threadId);
      if (event.status?.type === "idle" && current?.active) {
        publish(threadId, {
          phase: event.finalAnswerCompleted ? "completed" : "idle",
          label: event.finalAnswerCompleted ? "Codex 已完成" : "Codex 已就绪",
          active: false,
          lastProbeAt,
        });
      } else {
        reconcile(threadId, event.status);
      }
      return;
    }
    if (event.phase === "checking") {
      publish(threadId, {
        phase: "unknown",
        label: "暂时没有新输出，正在确认状态",
        detail: "正在确认 Codex 是否仍在运行",
        active: true,
        lastProbeAt,
      });
      return;
    }
    if (event.phase === "recovering") {
      publish(threadId, {
        phase: "recovering",
        label: "Codex 连接异常，正在恢复",
        active: true,
        lastProbeAt,
      });
      return;
    }
    if (event.phase === "recovered") {
      publish(threadId, {
        phase: "interrupted",
        label: "连接已恢复，上一任务已中断",
        active: false,
        lastProbeAt,
      });
      broadcast({ type: "sessions_changed", threadId });
      return;
    }
    if (event.phase === "failed") {
      publish(threadId, {
        phase: "systemError",
        label: "Codex 自动恢复失败",
        detail: event.error instanceof Error ? event.error.message : String(event.error || ""),
        active: false,
        lastProbeAt,
      });
    }
  };

  const reconcile = (threadId, authoritativeStatus) => {
    const current = statuses.get(threadId);
    if (!current?.active) return getStatus(threadId);
    const type = authoritativeStatus?.type;
    const flags = authoritativeStatus?.activeFlags || [];
    if (type === "idle") {
      publish(threadId, { phase: "idle", label: "Codex 已就绪" });
    } else if (type === "systemError") {
      publish(threadId, { phase: "systemError", label: "Codex 连接异常" });
    } else if (type === "active" && flags.includes("waitingOnApproval")) {
      publish(threadId, { phase: "waitingOnApproval", label: "需要在电脑端确认" });
    } else if (type === "active" && flags.includes("waitingOnUserInput")) {
      publish(threadId, { phase: "waitingOnUserInput", label: "Codex 正在等待补充信息" });
    } else if (type === "active") {
      publish(threadId, { phase: "working", label: "Codex 正在处理任务" });
    } else {
      publish(threadId, {
        phase: "unknown",
        label: "状态暂时无法确认",
        detail: "实时状态暂时无法确认，可以等待自动恢复或手动停止后重试",
        active: true,
      });
    }
    return getStatus(threadId);
  };

  const close = async () => {
    clearTimeout(persistTimer);
    await persist();
  };

  return { markSubmitted, markFailed, handleProtocolMessage, handleHealthState, getStatus, reconcile, close };
};
