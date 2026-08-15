const visibleMessageText = (message) => {
  const text = String(message?.text || "").trim();
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.map((file) => String(file?.name || "").trim()).filter(Boolean)
    : [];
  if (!text && !attachments.length) return "";
  const attachmentText = attachments.length ? ` [Attachments: ${attachments.join(", ")}]` : "";
  return `[${String(message?.authorName || "Unknown").trim()}] ${text}${attachmentText}`.trim();
};

export const buildDiscussionPrompt = ({ agent, agents = [], messages = [], outputInstructions = "", targetProjectRoot = "" }) => {
  const agentName = String(agent?.name || "当前员工").trim();
  const handoffAgentNames = agents
    .filter((item) => item.id !== agent?.id)
    .map((item) => `@${item.name}`)
    .join(", ");
  const publicMessages = messages.map(visibleMessageText).filter(Boolean).join("\n\n");
  const lines = [
    targetProjectRoot ? `目标项目：${targetProjectRoot}` : "",
    `你是${agentName}，只能以自己的身份回复。不得代替其他员工发言，也不得用“[员工名]”等格式模拟他们的回复。`,
    handoffAgentNames ? `需要其他员工实际参与时，必须在最终回复中准确提及：${handoffAgentNames}。系统会在你回复后调用被提及的员工；不要声称未被调用的员工已经回复或完成工作。` : "",
    "本轮新增群聊消息：",
    publicMessages || "（没有新增群聊消息）",
  ];
  if (outputInstructions) lines.push("", outputInstructions);
  return lines.filter((line, index) => line || index === lines.length - 1).join("\n");
};
