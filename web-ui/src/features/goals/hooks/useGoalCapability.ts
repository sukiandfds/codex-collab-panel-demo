import { useCallback } from "react";
import { parseGoalCapability } from "../model/capability";
import { useGoals } from "../state/GoalProvider";

export interface GoalCapabilityResult {
  handled: boolean;
  accepted: boolean;
}

export function useGoalCapability() {
  const { selectedGoal, create, action } = useGoals();

  return useCallback(async (text: string): Promise<GoalCapabilityResult> => {
    const command = parseGoalCapability(text);
    if (!command) return { handled: false, accepted: false };
    if (command.type === "incomplete") return { handled: true, accepted: false };

    if (command.type === "action") {
      if (!selectedGoal) return { handled: true, accepted: false };
      return { handled: true, accepted: Boolean(await action(selectedGoal.id, command.action)) };
    }

    return { handled: true, accepted: Boolean(await create(command.objective)) };
  }, [action, create, selectedGoal]);
}
