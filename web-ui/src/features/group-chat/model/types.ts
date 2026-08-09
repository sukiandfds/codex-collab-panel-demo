import type { MediaFile } from "../../../shared/model/media";
import type { ArtifactRealtimeEvent } from "../../artifacts/model/types";

export type GroupMode = "discussion" | "development";

export interface GroupMember {
  id: string;
  name: string;
  lastSeenAt: string;
}

export interface GroupAgent {
  id: string;
  name: string;
  shortName: string;
  responsibility: string;
  model?: string;
  reasoningEffort?: string;
  threadId: string | null;
  phase: string;
  label: string;
  detail: string;
  active: boolean;
  updatedAt: string | null;
}

export interface GroupMessage {
  id: string;
  clientMessageId?: string | null;
  workId?: string | null;
  sequence?: number;
  pending?: boolean;
  type: "human" | "agent" | "system";
  authorId: string;
  authorName: string;
  agentId: string | null;
  targetAgentIds?: string[];
  mode: GroupMode;
  text: string;
  attachments?: MediaFile[];
  artifactIds?: string[];
  createdAt: string;
}

export interface GroupStreamingMessage {
  workId: string;
  agentId: string;
  itemId: string;
  text: string;
  startedAt: string;
}

export interface GroupSnapshot {
  project: string;
  room: { id: string; name: string };
  messages: GroupMessage[];
  agents: GroupAgent[];
  members: GroupMember[];
}

export type GroupProfile =
  | { kind: "agent"; profile: GroupAgent }
  | { kind: "member"; profile: GroupMember };

export interface StoredMember {
  id: string;
  name: string;
}

export interface GroupSendResponse {
  message: GroupMessage;
  execution: { jobId: string; agentIds: string[]; status: string } | null;
  deduplicated?: boolean;
}

export type GroupEvent =
  | { type: "connected" }
  | { type: "group_message_created"; message: GroupMessage }
  | { type: "group_message_updated"; message: GroupMessage }
  | { type: "group_agent_updated"; agent: GroupAgent }
  | { type: "group_members_changed"; members: GroupMember[] }
  | { type: "group_agent_started"; agentId: string; agentName: string; workId: string; mode: GroupMode; startedAt: string }
  | { type: "group_agent_delta"; agentId: string; workId?: string; itemId: string; delta: string }
  | ArtifactRealtimeEvent;
