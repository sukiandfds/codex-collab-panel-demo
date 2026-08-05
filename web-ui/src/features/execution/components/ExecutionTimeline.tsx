import { useEffect, useState } from "react";
import { Brain, Check, ChevronRight, FilePenLine, LoaderCircle, Search, Terminal, Wrench } from "lucide-react";
import type { ExecutionActivity, ExecutionStatus } from "../model/types";
import type { ContextStatus } from "../../context-management/model/types";
import styles from "./ExecutionTimeline.module.css";

const iconFor = (activity: ExecutionActivity) => {
  if (activity.phase === "command") return Terminal;
  if (activity.phase === "fileChange") return FilePenLine;
  if (activity.phase === "tool" && activity.label.includes("搜索")) return Search;
  if (activity.phase === "tool") return Wrench;
  return Brain;
};

const elapsedText = (durationMs: number) => {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

export function ExecutionTimeline({ status, contextStatus }: { status: ExecutionStatus; contextStatus: ContextStatus }) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setExpanded(false);
    setNow(Date.now());
  }, [status.startedAt]);

  useEffect(() => {
    if (!status.active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status.active]);

  if (!status.active && !status.activities.length) return null;
  const activities = (status.activities || []).slice(-4);
  const startedAt = Date.parse(status.startedAt || "");
  const liveDurationMs = Number.isFinite(startedAt) ? now - startedAt : 0;
  const elapsed = status.active
    ? elapsedText(liveDurationMs)
    : Number.isFinite(status.durationMs) ? elapsedText(status.durationMs || 0) : "";
  const compacting = contextStatus.threadId === status.threadId && contextStatus.phase === "compacting";
  const label = compacting ? "正在压缩上下文" : status.label.replace(/^Codex\s*/u, "");

  return (
    <section className={styles.timeline} aria-label="Codex 工作过程">
      <button className={styles.header} type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {status.active
          ? <LoaderCircle className={styles.spinner} aria-hidden="true" />
          : <Check className={styles.completed} aria-hidden="true" />}
        <span>{label}</span>
        {elapsed ? <time>{elapsed}</time> : null}
        <ChevronRight className={expanded ? styles.expanded : ""} aria-hidden="true" />
      </button>
      {expanded ? (
        <div className={styles.activities}>
          {activities.length ? activities.map((activity) => {
            const Icon = iconFor(activity);
            return (
              <div className={styles.activity} key={activity.id}>
                <span className={styles.activityIcon}>{activity.completed ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>
                <div>
                  <span>{activity.label}</span>
                  {activity.detail
                    ? activity.phase === "working"
                      ? <span>{activity.detail}</span>
                      : <code>{activity.detail}</code>
                    : null}
                </div>
              </div>
            );
          }) : (
            <div className={styles.waiting}><i /><i /><i /></div>
          )}
        </div>
      ) : null}
    </section>
  );
}
