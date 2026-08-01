import type { RealtimeConnectedEvent } from "../../../shared/model/realtime";
import type { ContextStatus } from "../../context-management/model/types";

export type ExecutionPhase =
  | "idle"
  | "submitted"
  | "working"
  | "command"
  | "fileChange"
  | "tool"
  | "responding"
  | "finalizing"
  | "waitingOnApproval"
  | "waitingOnUserInput"
  | "completed"
  | "failed"
  | "interrupted"
  | "stopping"
  | "systemError"
  | "recovering"
  | "unknown";

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
  streamingItemId?: string;
  streamingText?: string;
  activities: ExecutionActivity[];
  active: boolean;
  startedAt: string | null;
  updatedAt: string | null;
  lastEventAt?: string | null;
  lastProbeAt?: string | null;
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

export interface HeartbeatEvent {
  type: "heartbeat";
  active: boolean;
  at: string;
}

export type ProjectEvent = ExecutionStatus | AssistantDeltaEvent | AssistantCommentaryEvent | SessionsChangedEvent | ContextStatus | HeartbeatEvent | RealtimeConnectedEvent;
