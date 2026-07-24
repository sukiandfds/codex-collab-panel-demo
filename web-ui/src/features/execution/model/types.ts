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

export interface ExecutionStatus {
  type: "execution_status";
  threadId: string;
  phase: ExecutionPhase;
  label: string;
  detail: string;
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

export type ProjectEvent = ExecutionStatus | AssistantDeltaEvent | AssistantCommentaryEvent | SessionsChangedEvent | { type: "connected" };
