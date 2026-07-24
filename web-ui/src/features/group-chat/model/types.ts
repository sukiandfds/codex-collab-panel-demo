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
  threadId: string | null;
  phase: string;
  label: string;
  detail: string;
  active: boolean;
  updatedAt: string | null;
}

export interface GroupMessage {
  id: string;
  type: "human" | "agent" | "system";
  authorId: string;
  authorName: string;
  agentId: string | null;
  targetAgentIds?: string[];
  mode: GroupMode;
  text: string;
  createdAt: string;
}

export interface GroupSnapshot {
  project: string;
  room: { id: string; name: string };
  messages: GroupMessage[];
  agents: GroupAgent[];
  members: GroupMember[];
}

export interface StoredMember {
  id: string;
  name: string;
}

export type GroupEvent =
  | { type: "connected" }
  | { type: "group_message_created"; message: GroupMessage }
  | { type: "group_agent_updated"; agent: GroupAgent }
  | { type: "group_members_changed"; members: GroupMember[] }
  | { type: "group_agent_delta"; agentId: string; itemId: string; delta: string };
