import type { MediaFile } from "../../../shared/model/media";
import type { ArtifactRealtimeEvent } from "../../artifacts/model/types";

export interface GroupMember {
  id: string;
  name: string;
  lastSeenAt: string;
}

export interface GroupAgent {
  id: string;
  name: string;
  shortName: string;
  aliases?: string[];
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

export interface GroupActiveWork {
  workId: string;
  agentId: string;
  agentName: string;
  startedAt: string;
  phase: "working";
}

export interface GroupRoom {
  id: string;
  name: string;
  projectId: string;
}

export interface GroupSnapshot {
  project: string;
  projectId: string;
  room: GroupRoom;
  messages: GroupMessage[];
  agents: GroupAgent[];
  members: GroupMember[];
  activeWorks?: GroupActiveWork[];
  history?: GroupMessageHistory;
}

export interface GroupMessagePage {
  messages: GroupMessage[];
  date: string;
  found: boolean;
  hasOlder: boolean;
  hasNewer: boolean;
  oldestSequence: number;
  newestSequence: number;
}

export type GroupMessageHistory = Omit<GroupMessagePage, "messages">;

export interface GroupRoomListResponse {
  rooms: GroupRoom[];
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
  | { type: "connected"; roomId?: string }
  | { type: "group_message_created"; roomId?: string; message: GroupMessage }
  | { type: "group_message_updated"; roomId?: string; message: GroupMessage }
  | { type: "group_agent_updated"; roomId?: string; agent: GroupAgent }
  | { type: "group_members_changed"; roomId?: string; members: GroupMember[] }
  | { type: "group_agent_started"; roomId?: string; agentId: string; agentName: string; workId: string; startedAt: string }
  | { type: "group_agent_delta"; roomId?: string; agentId: string; workId?: string; itemId: string; delta: string }
  | ArtifactRealtimeEvent;
