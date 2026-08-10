import type { ExecutionPhase } from "../../execution/model/types";

export type ProjectKind = "personal" | "employee" | "other" | string;

export interface ProjectRuntimeStatus {
  phase?: ExecutionPhase | string;
  label?: string;
  active?: boolean;
  turnId?: string | null;
  updatedAt?: string | null;
  indicator?: "red" | "green" | null;
}

export interface DirectoryProject {
  id: string;
  name: string;
  kind?: ProjectKind;
  projectId?: string;
  root?: string;
  roots?: Record<string, string | null | undefined>;
  provider?: string | null;
  runtime?: Record<string, unknown> | null;
  capabilities?: Record<string, unknown>;
  memberEmployeeIds?: string[];
  agentIds?: string[];
  employeeId?: string;
  mainConversationId?: string | null;
  mainThreadId?: string | null;
  lastActivityAt?: string | null;
  status?: ProjectRuntimeStatus | null;
  conversations?: DirectoryConversation[];
}

export interface DirectoryConversation {
  id: string;
  threadId?: string | null;
  conversationId?: string | null;
  pendingOpen?: boolean;
  title: string;
  main?: boolean;
  updatedAt?: string | null;
  lastActivityAt?: string | null;
  messageCount?: number | null;
  archived?: boolean;
  status?: ProjectRuntimeStatus | null;
}

export interface ProjectDirectoryResponse {
  version?: number;
  projects?: DirectoryProject[];
}

export type DisplayStatus = "answering" | "occupied" | "idle";
