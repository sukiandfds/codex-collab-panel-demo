import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, WifiOff } from "lucide-react";
import type { ExecutionStatus as ExecutionStatusValue } from "../model/types";
import styles from "./ExecutionStatus.module.css";

const elapsedText = (startedAt: string | null, now: number) => {
  if (!startedAt) return "";
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};

export function ExecutionStatus({ connected, status }: { connected: boolean; status: ExecutionStatusValue }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!status.active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status.active, status.startedAt]);

  if (!connected) {
    return <span className={styles.status} title="实时连接已断开，页面会自动重连"><WifiOff aria-hidden="true" />实时连接已断开</span>;
  }

  const failed = status.phase === "failed" || status.phase === "systemError";
  const completed = status.phase === "completed";
  const Icon = status.active ? LoaderCircle : failed ? CircleAlert : completed ? CheckCircle2 : CheckCircle2;
  const elapsed = status.active ? elapsedText(status.startedAt, now) : "";
  return (
    <span className={`${styles.status} ${failed ? styles.failed : ""}`} title={status.detail || status.label}>
      <Icon className={status.active ? styles.spinning : ""} aria-hidden="true" />
      <span>{status.label}{elapsed ? ` · ${elapsed}` : ""}</span>
    </span>
  );
}
