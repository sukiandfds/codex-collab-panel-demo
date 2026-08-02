const reasoningEffortLabels: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "超高",
  max: "极高",
  ultra: "最高",
};

export function formatReasoningEffort(reasoningEffort: string): string {
  const label = reasoningEffortLabels[reasoningEffort];
  return label ? `${label} (${reasoningEffort})` : reasoningEffort;
}
