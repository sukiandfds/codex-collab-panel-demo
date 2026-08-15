import type { RealtimeConnectedEvent } from "../../../shared/model/realtime";
import type { MediaFile } from "../../../shared/model/media";
import type { ContextStatus } from "../../context-management/model/types";
import type { FollowUpQueueItem } from "../../conversations/model/followUpQueue";
import type { ThreadGoal } from "../../goals/model/types";

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
  durationMs?: number | null;
  lastEventAt?: string | null;
  lastProbeAt?: string | null;
  eventEpoch?: string;
  eventSeq?: number;
}

export interface AssistantDeltaEvent {
  type: "assistant_delta";
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
  eventEpoch?: string;
  eventSeq?: number;
}

export interface AssistantCommentaryEvent {
  type: "assistant_commentary";
  threadId: string;
  turnId?: string;
  itemId: string;
  text: string;
  eventEpoch?: string;
  eventSeq?: number;
}

export interface SessionsChangedEvent {
  type: "sessions_changed";
  threadId?: string;
  eventEpoch?: string;
  eventSeq?: number;
}

export interface UserMessageSubmittedEvent {
  type: "user_message_submitted";
  threadId: string;
  submissionId: string;
  messageId: string;
  text: string;
  attachments?: MediaFile[];
  createdAt: string;
}

export interface QueueChangedEvent {
  type: "queue_changed";
  threadId: string;
  reason: string;
  items: FollowUpQueueItem[];
  eventEpoch?: string;
  eventSeq?: number;
}

export interface GoalStatusEvent {
  type: "goal_status";
  threadId: string;
  goal: ThreadGoal | null;
}

export interface HeartbeatEvent {
  type: "heartbeat";
  active: boolean;
  at: string;
}

export type ProjectEvent = ExecutionStatus | AssistantDeltaEvent | AssistantCommentaryEvent | SessionsChangedEvent | UserMessageSubmittedEvent | QueueChangedEvent | GoalStatusEvent | ContextStatus | HeartbeatEvent | RealtimeConnectedEvent;
