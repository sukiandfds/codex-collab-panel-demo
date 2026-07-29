import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_THRESHOLD = 80;
const MIN_THRESHOLD = 50;
const MAX_THRESHOLD = 95;

const now = () => new Date().toISOString();

const emptyStatus = (threadId, threshold) => ({
  type: "context_status",
  threadId,
  model: "",
  reasoningEffort: "",
  usedTokens: null,
  contextWindow: null,
  percentage: null,
  autoCompactThreshold: threshold,
  phase: "idle",
  message: "",
  updatedAt: null,
});

export const createContextManagementService = async ({
  stateFile, broadcast, getExecutionStatus, getRuntimeContext, compactContext,
}) => {
  const states = new Map();
  let settings = { version: 1, defaultThreshold: DEFAULT_THRESHOLD, threads: {} };
  let writeChain = Promise.resolve();

  try {
    const stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
    settings = {
      version: 1,
      defaultThreshold: Number.isInteger(stored.defaultThreshold) ? stored.defaultThreshold : DEFAULT_THRESHOLD,
      threads: stored.threads && typeof stored.threads === "object" ? stored.threads : {},
    };
  } catch {}

  const thresholdFor = (threadId) => Object.prototype.hasOwnProperty.call(settings.threads, threadId)
    ? settings.threads[threadId]
    : settings.defaultThreshold;

  const statusFor = (threadId) => {
    if (!states.has(threadId)) states.set(threadId, emptyStatus(threadId, thresholdFor(threadId)));
    return states.get(threadId);
  };

  const publicStatus = (status) => {
    const { compactionSource, lastAutoTriggerTokens, ...value } = status;
    return value;
  };

  const publish = (threadId, patch = {}) => {
    const next = { ...statusFor(threadId), ...patch, updatedAt: now() };
    states.set(threadId, next);
    broadcast(publicStatus(next));
    return next;
  };

  const persistSettings = () => {
    const snapshot = JSON.stringify(settings, null, 2);
    writeChain = writeChain.then(async () => {
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      const temporary = `${stateFile}.tmp`;
      await fs.writeFile(temporary, `${snapshot}\n`, "utf8");
      await fs.rename(temporary, stateFile);
    });
    return writeChain;
  };

  const startCompaction = async (threadId, source) => {
    const current = statusFor(threadId);
    if (current.phase === "compacting") return publicStatus(current);
    publish(threadId, {
      phase: "compacting",
      message: source === "auto" ? "已到阈值，正在自动压缩" : "正在压缩上下文",
      compactionSource: source,
    });
    try {
      await compactContext(threadId);
      return publicStatus(statusFor(threadId));
    } catch (error) {
      publish(threadId, {
        phase: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const requestCompaction = async (threadId, source = "manual") => {
    if (!statusFor(threadId).model) {
      const runtime = await getRuntimeContext(threadId);
      publish(threadId, {
        model: runtime.model || "",
        reasoningEffort: runtime.reasoningEffort || "",
      });
    }
    const current = statusFor(threadId);
    if (current.phase === "compacting" || current.phase === "queued") return publicStatus(current);
    if (getExecutionStatus(threadId).active) {
      return publicStatus(publish(threadId, {
        phase: "queued",
        message: source === "auto" ? "已到阈值，任务完成后自动压缩" : "当前任务完成后压缩",
        compactionSource: source,
      }));
    }
    return startCompaction(threadId, source);
  };

  const maybeAutoCompact = (threadId) => {
    const current = statusFor(threadId);
    const threshold = current.autoCompactThreshold;
    if (threshold === null || current.percentage === null || current.percentage < threshold) {
      if (current.lastAutoTriggerTokens !== null) states.set(threadId, { ...current, lastAutoTriggerTokens: null });
      return;
    }
    if (["queued", "compacting"].includes(current.phase)) return;
    if (current.lastAutoTriggerTokens === current.usedTokens) return;
    states.set(threadId, { ...current, lastAutoTriggerTokens: current.usedTokens });
    void requestCompaction(threadId, "auto").catch(() => {});
  };

  const load = async (threadId) => {
    const runtime = await getRuntimeContext(threadId);
    publish(threadId, {
      model: runtime.model || statusFor(threadId).model,
      reasoningEffort: runtime.reasoningEffort || statusFor(threadId).reasoningEffort,
    });
    maybeAutoCompact(threadId);
    return publicStatus(statusFor(threadId));
  };

  const setThreshold = async (threadId, threshold) => {
    if (threshold !== null && (!Number.isInteger(threshold) || threshold < MIN_THRESHOLD || threshold > MAX_THRESHOLD)) {
      const error = new Error(`Auto compact threshold must be null or an integer from ${MIN_THRESHOLD} to ${MAX_THRESHOLD}.`);
      error.statusCode = 400;
      throw error;
    }
    settings = { ...settings, threads: { ...settings.threads, [threadId]: threshold } };
    await persistSettings();
    publish(threadId, { autoCompactThreshold: threshold });
    maybeAutoCompact(threadId);
    return publicStatus(statusFor(threadId));
  };

  const handleProtocolMessage = (message) => {
    const { method, params = {} } = message || {};
    const threadId = params.threadId;
    if (!threadId) return;

    if (method === "thread/tokenUsage/updated") {
      const usedTokens = Number(params.tokenUsage?.last?.totalTokens);
      const contextWindow = Number(params.tokenUsage?.modelContextWindow);
      const validUsage = Number.isFinite(usedTokens) && usedTokens >= 0;
      const validWindow = Number.isFinite(contextWindow) && contextWindow > 0;
      publish(threadId, {
        usedTokens: validUsage ? usedTokens : null,
        contextWindow: validWindow ? contextWindow : null,
        percentage: validUsage && validWindow ? Math.min(100, Math.round((usedTokens / contextWindow) * 100)) : null,
      });
      maybeAutoCompact(threadId);
      return;
    }
    if (method === "thread/settings/updated") {
      publish(threadId, {
        model: params.threadSettings?.model || statusFor(threadId).model,
        reasoningEffort: params.threadSettings?.reasoningEffort || statusFor(threadId).reasoningEffort,
      });
      return;
    }
    if (method === "model/rerouted") {
      publish(threadId, { model: params.toModel || statusFor(threadId).model });
      return;
    }
    if (method === "thread/compacted" || (method === "item/completed" && params.item?.type === "contextCompaction")) {
      publish(threadId, { phase: "completed", message: "上下文压缩完成" });
      broadcast({ type: "sessions_changed", threadId });
      return;
    }
    if (method === "turn/completed" && statusFor(threadId).phase === "queued") {
      const source = statusFor(threadId).compactionSource || "manual";
      void startCompaction(threadId, source).catch(() => {});
    }
  };

  return {
    getStatus: (threadId) => publicStatus(statusFor(threadId)),
    load,
    setThreshold,
    requestCompaction,
    handleProtocolMessage,
    close: () => writeChain,
  };
};
