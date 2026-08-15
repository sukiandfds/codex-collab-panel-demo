export type GoalStatus = "active" | "paused" | "budgetLimited" | "complete";
export type EditableGoalStatus = Exclude<GoalStatus, "budgetLimited">;

export interface ThreadGoal {
  threadId: string;
  objective: string;
  status: GoalStatus;
  tokenBudget: number | null;
  timeUsedSeconds: number;
  tokensUsed: number;
  createdAt: number;
  updatedAt: number;
}

export interface GoalResponse {
  goal: ThreadGoal | null;
}
