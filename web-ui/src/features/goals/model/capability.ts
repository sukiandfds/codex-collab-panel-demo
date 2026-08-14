import type { GoalAction } from "./types";

export const goalCapabilityOptions = [
  { id: "goal-start", command: "/goal", group: "Codex", label: "启动 Goal", detail: "持续推进目标并协调员工" },
  { id: "goal-pause", command: "/goal pause", group: "Codex", label: "暂停 Goal", detail: "暂停当前持续目标" },
  { id: "goal-resume", command: "/goal resume", group: "Codex", label: "继续 Goal", detail: "继续当前持续目标" },
  { id: "goal-clear", command: "/goal clear", group: "Codex", label: "清除 Goal", detail: "停止并清除当前持续目标" },
] as const;

export type ParsedGoalCapability =
  | { type: "start"; objective: string }
  | { type: "action"; action: GoalAction }
  | { type: "incomplete" };

const goalActions: Record<string, GoalAction> = {
  pause: "pause",
  resume: "resume",
  clear: "clear",
};

export const parseGoalCapability = (text: string): ParsedGoalCapability | null => {
  const match = /^\s*\/goal(?:\s+([\s\S]*?))?\s*$/iu.exec(text);
  if (!match) return null;
  const argument = (match[1] || "").trim();
  if (!argument) return { type: "incomplete" };
  const action = goalActions[argument.toLocaleLowerCase()];
  return action ? { type: "action", action } : { type: "start", objective: argument };
};
