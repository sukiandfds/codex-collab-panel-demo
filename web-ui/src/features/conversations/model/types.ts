import type { MediaFile } from "../../../shared/model/media";

export type MessageRole = "user" | "assistant";
export type SessionSource = "codex" | "happy";

export interface ProjectInfo {
  name: string;
  root: string;
  mode: "read-only" | "interactive";
}

export interface MarkdownBlock { id: string; type: "markdown"; text: string }
export interface OptionsBlock { id: string; type: "options"; options: string[] }
export interface ImageBlock { id: string; type: "image"; source: string; alt?: string; file?: MediaFile }
export interface AudioBlock { id: string; type: "audio"; source: string; file?: MediaFile }
export interface VideoBlock { id: string; type: "video"; source: string; file?: MediaFile }
export interface FileBlock { id: string; type: "file"; source: string; name?: string; file?: MediaFile }
export type ContentBlock = MarkdownBlock | OptionsBlock | ImageBlock | AudioBlock | VideoBlock | FileBlock;

export interface SessionMessage {
  id: string;
  role: MessageRole;
  text: string;
  blocks?: ContentBlock[];
}

export interface SessionSummary {
  threadId: string;
  source: SessionSource;
  title: string;
  updatedAt: string;
  messageCount: number | null;
  latestUser: string;
  latestAssistant: string;
}

export interface SessionDetail extends SessionSummary {
  messages: SessionMessage[];
  hasMore?: boolean;
  nextBefore?: number | null;
}
