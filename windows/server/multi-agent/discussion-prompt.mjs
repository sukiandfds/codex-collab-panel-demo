export const cleanAgentIds = (ids, agents) => [...new Set((Array.isArray(ids) ? ids : [])
  .map((id) => String(id || "").trim())
  .filter((id) => agents.some((agent) => agent.id === id)))];

const escapePattern = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentionBoundary = "(?=$|[^\\p{L}\\p{N}_-])";

export const mentionedAgentIds = (text, agents) => {
  const matches = agents.flatMap((agent, agentOrder) => [...new Set([agent.name, ...(Array.isArray(agent.aliases) ? agent.aliases : [])])]
    .filter(Boolean)
    .flatMap((name) => [...String(text || "").matchAll(new RegExp(`@${escapePattern(name)}${mentionBoundary}`, "gu"))]
      .map((match) => ({ agentId: agent.id, agentOrder, index: match.index, length: String(name).length }))));
  const selected = new Map();
  for (const match of matches) {
    const current = selected.get(match.index);
    if (!current || match.length > current.length || (match.length === current.length && match.agentOrder < current.agentOrder)) selected.set(match.index, match);
  }
  return [...selected.values()].sort((left, right) => left.index - right.index).map((match) => match.agentId);
};

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
