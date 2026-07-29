import { useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import type { ContextStatus } from "../model/types";
import styles from "./ContextControl.module.css";

interface ContextControlProps {
  status: ContextStatus;
  disabled: boolean;
  onCompact: () => Promise<boolean>;
  onThresholdChange: (threshold: number | null) => Promise<boolean>;
}

export function ContextControl({ status, disabled, onCompact, onThresholdChange }: ContextControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const compacting = status.phase === "compacting";
  const queued = status.phase === "queued";
  const percentage = status.percentage === null ? "--" : String(status.percentage);
  const usageLabel = status.percentage === null ? "--" : `${percentage}%`;
  const detail = status.message || (status.percentage === null
    ? "等待 Codex 返回上下文使用量"
    : `已使用 ${status.usedTokens?.toLocaleString()} / ${status.contextWindow?.toLocaleString()} tokens`);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.controls} ref={rootRef}>
      <button
        className={styles.trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={detail}
        onClick={() => setOpen((value) => !value)}
      >
        <span>上下文 {usageLabel}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.menu} role="dialog" aria-label="上下文设置">
          <div className={styles.usage}>
            <span>当前使用</span>
            <strong>{usageLabel}</strong>
          </div>
          <div className={styles.meter} aria-hidden="true">
            <i style={{ width: `${Math.max(0, Math.min(status.percentage || 0, 100))}%` }} />
          </div>
          <button
            className={`${styles.compactButton} ${compacting ? styles.compacting : ""}`}
            type="button"
            disabled={disabled || compacting}
            onClick={() => void onCompact()}
          >
            {compacting ? <LoaderCircle aria-hidden="true" /> : null}
            <span>{compacting ? "正在压缩" : queued ? "任务完成后压缩" : "立即压缩"}</span>
          </button>
          <label className={styles.thresholdRow}>
            <span>自动压缩阈值</span>
            <select
              className={styles.threshold}
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
          </label>
        </div>
      ) : null}
    </div>
  );
}
