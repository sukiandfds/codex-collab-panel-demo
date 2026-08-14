export type GoalStatus = "active" | "paused" | "waiting" | "completed" | "cleared" | "expired" | "failed";
export type GoalTaskStatus = "pending" | "running" | "paused" | "waiting" | "completed" | "blocked" | "failed" | "canceled" | "expired";
export type GoalRunStatus = "pending" | "running" | "paused" | "waiting" | "completed" | "failed" | "canceled" | "expired" | "interrupted";

export interface GoalTask {
  id: string;
  goalId: string;
  parentTaskId: string | null;
  title: string;
  objective: string;
  assigneeId: string;
  assigneeName: string;
  status: GoalTaskStatus;
  detail: string;
  result: string;
  evidence: string[];
  runIds: string[];
  childTaskIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  error: string;
}

export interface GoalRun {
  id: string;
  goalId: string;
  taskId: string;
  attempt: number;
  status: GoalRunStatus;
  source: string;
  externalRef: string;
  detail: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  endedAt: string;
  error: string;
}

export interface GoalEvent {
  id: string;
  goalId: string;
  type: string;
  goalVersion: number;
  actorId: string;
  actorName: string;
  data: Record<string, unknown>;
  createdAt: string;
  sequence: number;
}

export interface Goal {
  id: string;
  title: string;
  objective: string;
  constraints: string[];
  successCriteria: string[];
  stopConditions: string[];
  ownerId: string;
  ownerName: string;
  status: GoalStatus;
  version: number;
  context: {
    projectId?: string;
    roomId?: string;
    threadId?: string;
    conversationId?: string;
    source?: string;
  };
  timeoutAt: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  endedAt: string;
  tasks: GoalTask[];
  runs: GoalRun[];
  events: GoalEvent[];
  runtime: {
    status: string;
    externalRef: string;
    detail: string;
    updatedAt: string;
  };
}

export type GoalAction = "pause" | "resume" | "wait" | "complete" | "clear";

export interface GoalEventPayload {
  type?: string;
  goal?: Goal;
  goalId?: string;
  goalVersion?: number;
  event?: GoalEvent;
}

export interface GoalListResponse { goals: Goal[]; }
export interface GoalResponse { goal: Goal; }
