import { CheckCircle2, CircleAlert, CircleDot, WifiOff } from "lucide-react";
import type { ExecutionStatus as ExecutionStatusValue } from "../model/types";
import styles from "./ExecutionStatus.module.css";

export function ExecutionStatus({ connected, status }: { connected: boolean; status: ExecutionStatusValue; commentary: string }) {
  if (!connected) {
    return <span className={styles.status} title="实时连接已断开，页面会自动重连"><WifiOff aria-hidden="true" />实时连接已断开</span>;
  }

  const failed = status.phase === "failed" || status.phase === "systemError";
  const completed = status.phase === "completed";
  const Icon = status.active ? CircleDot : failed ? CircleAlert : completed ? CheckCircle2 : CheckCircle2;
  const showsSpecificStatus = ["unknown", "recovering", "finalizing"].includes(status.phase);
  const label = showsSpecificStatus ? status.label : status.active ? "Codex 正在运行" : status.label;
  return (
    <span className={`${styles.status} ${failed ? styles.failed : ""}`} title={status.detail || label}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
