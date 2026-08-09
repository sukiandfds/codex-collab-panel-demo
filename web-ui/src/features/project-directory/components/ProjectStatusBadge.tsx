import type { DisplayStatus, ProjectRuntimeStatus } from "../model/types";
import styles from "./ProjectStatusBadge.module.css";

const occupiedPhases = new Set(["occupied", "locked", "busy"]);

export const displayStatusFrom = (status?: ProjectRuntimeStatus | null): DisplayStatus => {
  if (!status?.active) return "idle";
  const label = `${status.phase || ""} ${status.label || ""}`.toLowerCase();
  return [...occupiedPhases].some((value) => label.includes(value)) || label.includes("占用")
    ? "occupied"
    : "answering";
};

const labels: Record<DisplayStatus, string> = {
  answering: "回答中",
  occupied: "被占用中",
  idle: "空闲中",
};

export function ProjectStatusBadge({ status, compact = false }: { status?: ProjectRuntimeStatus | null; compact?: boolean }) {
  const value = displayStatusFrom(status);
  return (
    <span className={`${styles.badge} ${compact ? styles.compact : ""}`} data-status={value}>
      <i aria-hidden="true" />
      <span>{labels[value]}</span>
    </span>
  );
}
