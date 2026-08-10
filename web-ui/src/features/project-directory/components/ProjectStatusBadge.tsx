import type { DisplayStatus, ProjectRuntimeStatus } from "../model/types";
import styles from "./ProjectStatusBadge.module.css";

const occupiedPhases = new Set(["occupied", "locked", "busy"]);
const hiddenPhases = new Set(["idle", "completed", "failed", "unknown", "interrupted", "systemerror"]);

export const displayStatusFrom = (status?: ProjectRuntimeStatus | null): DisplayStatus => {
  const phase = String(status?.phase || "").toLowerCase();
  const label = String(status?.label || "").toLowerCase();
  if (occupiedPhases.has(phase) || [...occupiedPhases].some((value) => label.includes(value)) || label.includes("占用")) return "occupied";
  if (!status?.active || hiddenPhases.has(phase)) return "idle";
  return "answering";
};

const labels: Record<Exclude<DisplayStatus, "idle">, string> = {
  answering: "回答中",
  occupied: "被占用中",
};

export function ProjectStatusBadge({ status, compact = false }: { status?: ProjectRuntimeStatus | null; compact?: boolean }) {
  const value = displayStatusFrom(status);
  if (value === "idle") return null;
  return <span className={`${styles.badge} ${compact ? styles.compact : ""}`} data-status={value} role="img" aria-label={labels[value]} title={labels[value]} />;
}
