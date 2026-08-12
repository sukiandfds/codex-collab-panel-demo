export const terminalPhases = new Set(["completed", "failed", "interrupted", "systemError"]);

const commandDetail = (item) => {
  const actionCommand = Array.isArray(item?.commandActions)
    ? item.commandActions.map((action) => action?.command).find(Boolean)
    : "";
  const raw = String(actionCommand || item?.command || "").split(/\r?\n/u)[0].trim();
  const wrapped = raw.match(/\s-(?:command|c)\s+(.+)$/iu)?.[1]?.trim() || raw;
  return wrapped.replace(/^(?:"|')|(?:"|')$/gu, "").replace(/\\"/gu, '"');
};

export const detailFromItem = (item) => {
  if (item?.type === "commandExecution") return commandDetail(item);
  if (item?.type === "fileChange") return `${item.changes?.length || 0} 个文件变更`;
  if (item?.type === "mcpToolCall") return [item.server, item.tool].filter(Boolean).join(" / ");
  if (item?.type === "dynamicToolCall") return item.tool || "";
  if (item?.type === "webSearch") return item.query || "";
  return "";
};

export const stateFromItem = (item) => {
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

export const activityFromItem = (item, completed = false) => {
  const state = stateFromItem(item);
  if (!state || item?.type === "agentMessage") return null;
  const detail = detailFromItem(item);
  if (item.type === "reasoning" && !detail) return null;
  const labels = {
    reasoning: completed ? "分析完成" : "正在分析任务",
    commandExecution: completed ? "命令已完成" : "正在运行命令",
    fileChange: completed ? "已修改文件" : "正在修改文件",
    mcpToolCall: completed ? "已调用工具" : "正在调用工具",
    dynamicToolCall: completed ? "已调用工具" : "正在调用工具",
    webSearch: completed ? "已搜索资料" : "正在搜索资料",
  };
  return {
    id: item.type === "reasoning" ? "reasoning-current" : item.id || `${item.type}-${Date.now()}`,
    phase: state.phase,
    label: labels[item.type] || state.label,
    detail,
    completed,
    updatedAt: new Date().toISOString(),
  };
};
