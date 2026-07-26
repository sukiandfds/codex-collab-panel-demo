export type ExecutionPhase =
  | "idle"
  | "submitted"
  | "working"
  | "command"
  | "fileChange"
  | "tool"
  | "responding"
  | "waitingOnApproval"
  | "waitingOnUserInput"
  | "completed"
  | "failed"
  | "interrupted"
  | "systemError";

export interface ExecutionActivity {
  id: string;
  phase: ExecutionPhase;
  label: string;
  detail: string;
  completed: boolean;
  updatedAt: string;
}

export interface ExecutionStatus {
  type: "execution_status";
  threadId: string;
  turnId: string;
  phase: ExecutionPhase;
  label: string;
  detail: string;
  commentary: string;
  activities: ExecutionActivity[];
  active: boolean;
  startedAt: string | null;
  updatedAt: string | null;
}

export interface AssistantDeltaEvent {
  type: "assistant_delta";
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
}

export interface AssistantCommentaryEvent {
  type: "assistant_commentary";
  threadId: string;
  itemId: string;
  text: string;
}

export interface SessionsChangedEvent {
  type: "sessions_changed";
  threadId?: string;
}

export type ProjectEvent = ExecutionStatus | AssistantDeltaEvent | AssistantCommentaryEvent | SessionsChangedEvent | ContextStatus | { type: "connected" };
import type { ContextStatus } from "../../context-management/model/types";
