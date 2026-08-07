const reasoningEffortLabels: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
};

export function formatReasoningEffort(reasoningEffort: string): string {
  return reasoningEffortLabels[reasoningEffort] || reasoningEffort;
}

export function reasoningEffortDescription(reasoningEffort: string): string {
  return reasoningEffort === "ultra" ? "更快消耗使用额度" : "";
}
