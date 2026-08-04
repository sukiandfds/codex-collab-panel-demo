import path from "node:path";
import { randomUUID } from "node:crypto";
import { createHappyEveringImageClient } from "./happyevering-client.mjs";
import { providerImageRequestFromArgs } from "./image-contract.mjs";
import { intentForWebImageMessage } from "./web-image-intent.mjs";

const publicError = (error) => {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("LYNN_IMAGE_API_KEY")) return "Negus Image 尚未配置 API Key，请重启项目服务后再试。";
  if (/timed out/iu.test(message)) return "图片生成超时；任务没有自动重提，避免重复计费。";
  return message.replace(/https?:\/\/\S+/giu, "[provider]").slice(0, 1000) || "图片生成失败";
};

const specification = (intent) => `${intent.resolution} · ${intent.size} · ${intent.n} 张`;

export const createWebImageGenerationService = ({
  projectRoot,
  runStore,
  execution,
  broadcast,
  client = createHappyEveringImageClient(),
  createId = randomUUID,
}) => {
  const activeByThread = new Map();

  const publish = (threadId, next) => execution.publishStatus(threadId, next);
  const refreshConversation = (threadId) => broadcast({ type: "sessions_changed", threadId });

  const execute = async ({ runId, turnId, threadId, intent, attachments }) => {
    const startedAt = Date.now();
    try {
      await runStore.markRunning(runId);
      publish(threadId, {
        phase: "tool",
        turnId,
        label: "Negus Image 正在生成图片",
        detail: specification(intent),
        active: true,
        activity: {
          id: `negus-image-${runId}`,
          phase: "tool",
          label: "正在调用 Negus Image",
          detail: specification(intent),
          completed: false,
          updatedAt: new Date().toISOString(),
        },
      });
      refreshConversation(threadId);

      const outputDirectory = path.join(projectRoot, "runtime", "generated-images", runId);
      const request = providerImageRequestFromArgs({ ...intent, outputDirectory, outputName: "negus-image" });
      const referenceIds = new Set(intent.referenceIds || []);
      const result = intent.operation === "edit"
        ? await client.edit({
          ...request,
          imagePaths: attachments.filter((attachment) => referenceIds.has(attachment.id)).map((attachment) => attachment.path),
        })
        : await client.generate(request);
      await runStore.complete(runId, result);
      publish(threadId, {
        phase: "completed",
        turnId,
        label: "Negus Image 已完成",
        detail: `已生成 ${result.outputs.length} 张图片`,
        active: false,
        durationMs: Date.now() - startedAt,
        activity: {
          id: `negus-image-${runId}`,
          phase: "completed",
          label: "Negus Image 已完成",
          detail: `已生成 ${result.outputs.length} 张图片`,
          completed: true,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const message = publicError(error);
      await runStore.fail(runId, message);
      publish(threadId, {
        phase: "failed",
        turnId,
        label: "Negus Image 生成失败",
        detail: message,
        active: false,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      if (activeByThread.get(threadId)?.runId === runId) activeByThread.delete(threadId);
      refreshConversation(threadId);
    }
  };

  const start = async ({ threadId, submissionId, text, attachments = [], createdAt, intent }) => {
    if (activeByThread.has(threadId)) {
      const error = new Error("Negus Image 正在生成当前图片，请完成后再发送新消息");
      error.statusCode = 409;
      throw error;
    }
    const runId = `img-${createId()}`;
    const turnId = `negus-image-${runId}`;
    activeByThread.set(threadId, { runId, turnId });
    let created;
    try {
      created = await runStore.create({
        runId,
        turnId,
        threadId,
        submissionId,
        text,
        attachments,
        intent,
        createdAt,
      });
    } catch (error) {
      activeByThread.delete(threadId);
      throw error;
    }
    if (!created.created) {
      activeByThread.delete(threadId);
      return { runId: created.record.runId, turnId: created.record.turnId, status: created.record.status };
    }
    publish(threadId, {
      phase: "submitted",
      turnId,
      label: "已提交给 Negus Image",
      detail: specification(intent),
      active: true,
    });
    refreshConversation(threadId);
    queueMicrotask(() => {
      void execute({ runId, turnId, threadId, intent, attachments })
        .catch((error) => console.error(`[web-image-generation] ${error.message}`));
    });
    return { runId, turnId, status: "inProgress" };
  };

  return {
    intentFor: (value) => intentForWebImageMessage(value),
    isActive: (threadId) => activeByThread.has(threadId),
    start,
  };
};
