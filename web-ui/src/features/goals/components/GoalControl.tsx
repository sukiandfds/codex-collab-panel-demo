import { Check, ChevronDown, LoaderCircle, Pause, Play, Target, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EditableGoalStatus, GoalStatus, ThreadGoal } from "../model/types";
import styles from "./GoalControl.module.css";

const statusLabels: Record<GoalStatus, string> = {
  active: "进行中",
  paused: "已暂停",
  budgetLimited: "达到预算",
  complete: "已完成",
};

export function GoalControl({ goal, busy, error, disabled, onStatusChange, onClear }: {
  goal: ThreadGoal | null;
  busy: boolean;
  error: string;
  disabled: boolean;
  onStatusChange: (status: EditableGoalStatus) => Promise<boolean>;
  onClear: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  if (!goal) return null;

  const status = statusLabels[goal.status];
  const duration = `${Math.max(0, Math.round(goal.timeUsedSeconds))} 秒`;
  const tokens = goal.tokensUsed.toLocaleString();
  const changeStatus = async (next: EditableGoalStatus) => {
    if (await onStatusChange(next)) setOpen(false);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        className={styles.trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={goal.objective}
        onClick={() => setOpen((value) => !value)}
      >
        <Target aria-hidden="true" />
        <span>目标 · {status}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.menu} role="dialog" aria-label="目标状态">
          <div className={styles.heading}><Target aria-hidden="true" /><strong>当前目标</strong></div>
          <p className={styles.objective}>{goal.objective}</p>
          <div className={styles.stats}>
            <span>状态<strong>{status}</strong></span>
            <span>用时<strong>{duration}</strong></span>
            <span>Token<strong>{tokens}</strong></span>
          </div>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.actions}>
            {goal.status === "active" ? (
              <button type="button" disabled={disabled || busy} onClick={() => void changeStatus("paused")}>
                {busy ? <LoaderCircle aria-hidden="true" /> : <Pause aria-hidden="true" />}暂停
              </button>
            ) : goal.status === "paused" ? (
              <button type="button" disabled={disabled || busy} onClick={() => void changeStatus("active")}>
                {busy ? <LoaderCircle aria-hidden="true" /> : <Play aria-hidden="true" />}继续
              </button>
            ) : null}
            {goal.status !== "complete" ? (
              <button type="button" disabled={disabled || busy} onClick={() => void changeStatus("complete")}>
                {busy ? <LoaderCircle aria-hidden="true" /> : <Check aria-hidden="true" />}完成
              </button>
            ) : null}
            <button className={styles.clear} type="button" disabled={disabled || busy} title="清除目标" aria-label="清除目标" onClick={() => void onClear().then((cleared) => { if (cleared) setOpen(false); })}>
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
