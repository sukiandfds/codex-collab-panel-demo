export const cleanAgentIds = (ids, agents) => [...new Set((Array.isArray(ids) ? ids : [])
  .map((id) => String(id || "").trim())
  .filter((id) => agents.some((agent) => agent.id === id)))];

export const mentionedAgentIds = (text, agents) => agents
  .map((agent) => ({
    id: agent.id,
    index: [agent.name, ...(Array.isArray(agent.aliases) ? agent.aliases : [])]
      .map((name) => String(text || "").indexOf(`@${name}`))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0] ?? -1,
  }))
  .filter((value) => value.index >= 0)
  .sort((left, right) => left.index - right.index)
  .map((value) => value.id);

const visibleMessageText = (message) => {
  const text = String(message?.text || "").trim();
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.map((file) => String(file?.name || "").trim()).filter(Boolean)
    : [];
  if (!text && !attachments.length) return "";
  const attachmentText = attachments.length ? ` [Attachments: ${attachments.join(", ")}]` : "";
  return `[${String(message?.authorName || "Unknown").trim()}] ${text}${attachmentText}`.trim();
};

export const buildDiscussionPrompt = ({ agent, agents = [], mode, messages = [], outputInstructions = "", targetProjectRoot = "" }) => {
  const agentNames = agents.map((item) => `@${item.name}`).join(", ");
  const modeRule = mode === "development"
    ? "This is development mode. Only make code or file changes when the public group request clearly authorizes them, and keep the change minimal."
    : "This is discussion mode. Analyze and discuss only; do not modify files or perform high-impact actions.";
  const publicMessages = messages.map(visibleMessageText).filter(Boolean).join("\n\n");
  const lines = [
    "You are replying inside a shared public project group chat.",
    `Your public role: ${agent.name} (${agent.responsibility}).`,
    targetProjectRoot ? `Target project path for this group task: ${targetProjectRoot}` : "",
    modeRule,
    "The messages below are the only new public group-chat context for this turn.",
    "Do not use or reveal hidden thinking, commentary, tool output, private reasoning, or unrelated private conversation history from another Agent.",
    agentNames ? `Available Agent mentions: ${agentNames}.` : "",
    "Reply with useful content for the group. Do not describe hidden reasoning.",
    "",
    "New public group messages since your last checkpoint:",
    publicMessages || "(No new public group messages.)",
  ];
  if (outputInstructions) lines.push("", "Output constraints for this request:", outputInstructions);
  return lines.filter((line, index) => line || index === lines.length - 1).join("\n");
};
