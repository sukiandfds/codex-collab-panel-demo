export type ContextPhase = "idle" | "queued" | "compacting" | "completed" | "failed";

export interface ContextStatus {
  type: "context_status";
  threadId: string;
  model: string;
  usedTokens: number | null;
  contextWindow: number | null;
  percentage: number | null;
  autoCompactThreshold: number | null;
  phase: ContextPhase;
  message: string;
  updatedAt: string | null;
}
