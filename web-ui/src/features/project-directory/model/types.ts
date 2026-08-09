import type { ExecutionPhase } from "../../execution/model/types";

export type ProjectKind = "personal" | "employee" | "other" | string;

export interface ProjectRuntimeStatus {
  phase?: ExecutionPhase | string;
  label?: string;
  active?: boolean;
  turnId?: string | null;
  updatedAt?: string | null;
}

export interface DirectoryProject {
  id: string;
  name: string;
  kind?: ProjectKind;
  root?: string;
  employeeId?: string;
  mainConversationId?: string | null;
  mainThreadId?: string | null;
  status?: ProjectRuntimeStatus | null;
  conversations?: DirectoryConversation[];
}

export interface DirectoryConversation {
  id: string;
  title: string;
  main?: boolean;
  status?: ProjectRuntimeStatus | null;
}

export interface ProjectDirectoryResponse {
  version?: number;
  projects?: DirectoryProject[];
}

export type DisplayStatus = "answering" | "occupied" | "idle";
