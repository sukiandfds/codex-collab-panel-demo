import type { MediaFile } from "../../../shared/model/media";

export type MessageRole = "user" | "assistant";
export type SessionSource = "codex" | "happy";
export type ContentSyncState = "stable" | "syncing" | "recovering" | "degraded";

export interface ProjectInfo {
  name: string;
  root: string;
  mode: "read-only" | "interactive";
}

export interface MarkdownBlock { id: string; type: "markdown"; text: string }
export interface OptionsBlock { id: string; type: "options"; options: string[] }
export interface ImageBlock { id: string; type: "image"; source: string; alt?: string; width?: number; height?: number; file?: MediaFile }
export interface AudioBlock { id: string; type: "audio"; source: string; file?: MediaFile }
export interface VideoBlock { id: string; type: "video"; source: string; file?: MediaFile }
export interface FileBlock { id: string; type: "file"; source: string; name?: string; file?: MediaFile }
export type ContentBlock = MarkdownBlock | OptionsBlock | ImageBlock | AudioBlock | VideoBlock | FileBlock;

export interface SessionMessage {
  id: string;
  role: MessageRole;
  text: string;
  deliveryState?: "pending";
  submissionId?: string;
  blocks?: ContentBlock[];
  createdAt?: string;
  turnId?: string;
  itemId?: string;
}

export interface SessionSummary {
  threadId: string;
  source: SessionSource;
  title: string;
  updatedAt: string;
  messageCount: number | null;
  latestUser: string;
  latestAssistant: string;
  archived?: boolean;
  archivable?: boolean;
  conversationKind?: string;
  readOnly?: boolean;
  forkedFromId?: string | null;
}

export interface SessionDetail extends SessionSummary {
  messages: SessionMessage[];
  contentVersion?: number;
  hasMore?: boolean;
  nextBefore?: number | null;
  nextCursor?: string | null;
}

export type SessionPatch = Partial<SessionSummary> & {
  hasMore?: boolean;
  nextBefore?: number | null;
  nextCursor?: string | null;
};

export interface SessionDelta {
  threadId: string;
  contentVersion: number;
  unchanged: boolean;
  upserts: SessionMessage[];
  deletes: string[];
  sessionPatch?: SessionPatch;
}

export type SessionResponse = SessionDetail | SessionDelta;
