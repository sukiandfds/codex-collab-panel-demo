import { useCallback } from "react";
import { parseGoalCapability } from "../model/capability";
import { useGoals } from "../state/GoalProvider";
import type { Goal, GoalAction } from "../model/types";

export interface GoalCapabilityResult {
  handled: boolean;
  accepted: boolean;
  feedback: string;
}

const actionLabels: Record<GoalAction, string> = {
  pause: "已暂停",
  resume: "已继续",
  wait: "已设为等待",
  complete: "已完成",
  clear: "已清除",
};

const eligibleFor = (goal: Goal, action: GoalAction) => {
  if (action === "pause") return goal.status === "active" || goal.status === "waiting";
  if (action === "resume") return goal.status === "paused" || goal.status === "waiting";
  return goal.status !== "cleared";
};

const matchTarget = (goals: Goal[], target: string) => {
  const normalized = target.trim().toLocaleLowerCase();
  if (!normalized) return [];
  const exactId = goals.find((goal) => goal.id.toLocaleLowerCase() === normalized);
  if (exactId) return [exactId];
  return goals.filter((goal) => (
    goal.id.toLocaleLowerCase().startsWith(normalized)
    || goal.title.toLocaleLowerCase() === normalized
  ));
};

const choicesText = (goals: Goal[]) => goals
  .slice(0, 3)
  .map((goal) => `${goal.title} (${goal.id})`)
  .join("、");

export function useGoalCapability() {
  const { goals, selectedGoal, create, action } = useGoals();

  return useCallback(async (text: string): Promise<GoalCapabilityResult> => {
    const command = parseGoalCapability(text);
    if (!command) return { handled: false, accepted: false, feedback: "" };
    if (command.type === "incomplete") {
      return { handled: true, accepted: false, feedback: "请在 /goal 后填写要持续推进的目标。" };
    }

    try {
      if (command.type === "action") {
        const explicitMatches = matchTarget(goals, command.target)
          .filter((goal) => eligibleFor(goal, command.action));
        const eligibleGoals = goals.filter((goal) => eligibleFor(goal, command.action));
        const targetGoal = command.target
          ? explicitMatches.length === 1 ? explicitMatches[0] : null
          : selectedGoal && eligibleFor(selectedGoal, command.action)
            ? selectedGoal
            : eligibleGoals.length === 1 ? eligibleGoals[0] : null;

        if (!targetGoal) {
          if (command.target && !explicitMatches.length) {
            return { handled: true, accepted: false, feedback: `没有找到可执行此操作的 Goal：${command.target}` };
          }
          const choices = command.target ? explicitMatches : eligibleGoals;
          return {
            handled: true,
            accepted: false,
            feedback: choices.length
              ? `目标不唯一，请在命令后填写 Goal ID：${choicesText(choices)}`
              : "当前没有可执行此操作的 Goal。",
          };
        }

        const updated = await action(targetGoal.id, command.action);
        return { handled: true, accepted: true, feedback: `Goal ${actionLabels[command.action]}：${updated.title}` };
      }

      const created = await create(command.objective);
      return { handled: true, accepted: true, feedback: `Goal 已启动：${created.title}` };
    } catch (cause) {
      return {
        handled: true,
        accepted: false,
        feedback: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }, [action, create, goals, selectedGoal]);
}
