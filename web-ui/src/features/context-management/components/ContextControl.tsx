import { LoaderCircle, Minimize2 } from "lucide-react";
import type { ContextStatus } from "../model/types";
import styles from "./ContextControl.module.css";

interface ContextControlProps {
  status: ContextStatus;
  disabled: boolean;
  onCompact: () => Promise<boolean>;
  onThresholdChange: (threshold: number | null) => Promise<boolean>;
}

export function ContextControl({ status, disabled, onCompact, onThresholdChange }: ContextControlProps) {
  const compacting = status.phase === "compacting";
  const queued = status.phase === "queued";
  const percentage = status.percentage === null ? "--" : String(status.percentage);
  const actionLabel = compacting ? "压缩中" : queued ? "任务后压缩" : `${percentage}%`;
  const detail = status.message || (status.percentage === null
    ? "等待 Codex 返回上下文使用量"
    : `已使用 ${status.usedTokens?.toLocaleString()} / ${status.contextWindow?.toLocaleString()} tokens`);

  return (
    <div className={styles.controls}>
      <span className={styles.model} title={`当前模型：${status.model || "正在读取"}`}>
        {status.model || "读取模型"}
      </span>
      <select
        className={styles.threshold}
        aria-label="自动压缩阈值"
        title="自动压缩阈值"
        disabled={disabled || compacting}
        value={status.autoCompactThreshold === null ? "off" : status.autoCompactThreshold}
        onChange={(event) => {
          const value = event.target.value;
          void onThresholdChange(value === "off" ? null : Number(value));
        }}
      >
        <option value="off">关闭</option>
        <option value="70">70%</option>
        <option value="80">80%</option>
        <option value="90">90%</option>
      </select>
      <button
        className={`${styles.compactButton} ${compacting ? styles.compacting : ""}`}
        type="button"
        aria-label={`压缩上下文，当前占用 ${percentage}%`}
        title={detail}
        disabled={disabled || compacting}
        onClick={() => void onCompact()}
      >
        {compacting ? <LoaderCircle aria-hidden="true" /> : <Minimize2 aria-hidden="true" />}
        <span>{actionLabel}</span>
      </button>
    </div>
  );
}
