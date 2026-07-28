export const terminalAgentPhases = new Set(["completed", "failed", "interrupted", "systemError"]);

export const agentStateFromItem = (item) => {
  switch (item?.type) {
    case "reasoning": return { phase: "working", label: "正在分析任务", detail: "" };
    case "commandExecution": return { phase: "command", label: "正在执行命令", detail: String(item.command || "").split(/\r?\n/u)[0].slice(0, 120) };
    case "fileChange": return { phase: "fileChange", label: "正在修改文件", detail: `${item.changes?.length || 0} 个文件变更` };
    case "mcpToolCall": return { phase: "tool", label: "正在调用工具", detail: [item.server, item.tool].filter(Boolean).join(" / ") };
    case "dynamicToolCall": return { phase: "tool", label: "正在调用工具", detail: item.tool || "" };
    case "webSearch": return { phase: "tool", label: "正在搜索资料", detail: item.query || "" };
    case "agentMessage": return { phase: "responding", label: "正在整理回复", detail: "" };
    default: return null;
  }
};
