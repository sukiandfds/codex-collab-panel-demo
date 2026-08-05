import { CheckCircle2, CircleAlert, CircleDot, WifiOff } from "lucide-react";
import type { ExecutionStatus as ExecutionStatusValue } from "../model/types";
import type { ContextStatus } from "../../context-management/model/types";
import styles from "./ExecutionStatus.module.css";

export function ExecutionStatus({ connected, status, contextStatus, sendingSlow }: {
  connected: boolean;
  status: ExecutionStatusValue;
  contextStatus: ContextStatus;
  commentary: string;
  sendingSlow: boolean;
}) {
  if (!connected) {
    return <span className={styles.status} title="实时连接已断开，页面会自动重连"><WifiOff aria-hidden="true" />实时连接已断开</span>;
  }
  if (sendingSlow && !status.active) {
    return <span className={styles.status} title="正在确认消息是否已经送达"><CircleDot aria-hidden="true" />网络较慢</span>;
  }

  const failed = status.phase === "failed" || status.phase === "systemError";
  const completed = status.phase === "completed";
  const Icon = status.active ? CircleDot : failed ? CircleAlert : completed ? CheckCircle2 : CheckCircle2;
  const showsSpecificStatus = ["unknown", "recovering", "finalizing", "stopping"].includes(status.phase);
  const compacting = contextStatus.threadId === status.threadId && contextStatus.phase === "compacting";
  const label = compacting ? "正在压缩上下文" : showsSpecificStatus ? status.label : status.active ? "Codex 正在运行" : status.label;
  return (
    <span className={`${styles.status} ${failed ? styles.failed : ""}`} title={status.detail || label}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
