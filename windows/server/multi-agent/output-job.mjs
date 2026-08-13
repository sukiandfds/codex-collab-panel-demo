export const completeOutputJob = async ({ outputJob, result, agentId, room, webOutputs, setStatus, finishStatus }) => {
  if (!result.message?.id) {
    webOutputs.abandonJob(outputJob.jobId);
    await room.addMessage({
      type: "system", authorId: "system", authorName: "系统", agentId,
      text: "网页成果处理失败：Agent 未生成可关联的最终群消息。",
    });
    finishStatus(agentId, { phase: "failed", label: "网页成果处理失败", detail: "缺少最终群消息" });
    return;
  }
  await setStatus(agentId, { phase: "working", label: "正在生成网页与 PDF", detail: "正在验证并发布成果", active: true });
  try {
    const output = await webOutputs.completeJob({
      job: outputJob,
      finalMessageId: result.message.id,
      createdByAgent: agentId,
      createdByName: room.getAgent(agentId)?.name || agentId,
    });
    for (const artifact of output.artifacts) await room.attachArtifact(result.message.id, artifact.id);
    if (output.pdfError) {
      await room.addMessage({
        type: "system", authorId: "system", authorName: "系统", agentId,
        text: `HTML 已保留，PDF 生成失败：${output.pdfError}`,
      });
      finishStatus(agentId, { phase: "failed", label: "HTML 已生成，PDF 失败", detail: output.pdfError });
    } else {
      finishStatus(agentId, { phase: "completed", label: "网页与 PDF 已生成", detail: "成果已附到群消息" });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await room.addMessage({
      type: "system", authorId: "system", authorName: "系统", agentId,
      text: `网页成果处理失败：${detail}`,
    });
    finishStatus(agentId, { phase: "failed", label: "网页成果处理失败", detail });
  }
};
