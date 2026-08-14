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
  const agentNames = agents.map((item) => `@${item.name}`).join(", ");
  const publicMessages = messages.map(visibleMessageText).filter(Boolean).join("\n\n");
  const lines = [
    "You are replying inside a shared public project group chat.",
    `Your public role: ${agent.name} (${agent.responsibility}).`,
    targetProjectRoot ? `Target project path for this group task: ${targetProjectRoot}` : "",
    "The messages below are the only new public group-chat context for this turn.",
    "Do not use or reveal hidden thinking, commentary, tool output, private reasoning, or unrelated private conversation history from another Agent.",
    agentNames ? `To hand work to another employee, explicitly mention them in your final reply: ${agentNames}. A mentioned employee will continue after you finish.` : "",
    "Reply with useful content for the group. Do not describe hidden reasoning.",
    "",
    "New public group messages since your last checkpoint:",
    publicMessages || "(No new public group messages.)",
  ];
  if (outputInstructions) lines.push("", "Output constraints for this request:", outputInstructions);
  return lines.filter((line, index) => line || index === lines.length - 1).join("\n");
};
