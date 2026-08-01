import { useEffect, useState } from "react";
import { Brain, Check, ChevronRight, FilePenLine, LoaderCircle, Search, Terminal, Wrench } from "lucide-react";
import type { ExecutionActivity, ExecutionStatus } from "../model/types";
import styles from "./ExecutionTimeline.module.css";

const iconFor = (activity: ExecutionActivity) => {
  if (activity.phase === "command") return Terminal;
  if (activity.phase === "fileChange") return FilePenLine;
  if (activity.phase === "tool" && activity.label.includes("搜索")) return Search;
  if (activity.phase === "tool") return Wrench;
  return Brain;
};

const elapsedText = (startedAt: string | null, now: number) => {
  if (!startedAt) return "";
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

export function ExecutionTimeline({ status }: { status: ExecutionStatus }) {
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setExpanded(status.active);
    setNow(Date.now());
  }, [status.active, status.startedAt]);

  useEffect(() => {
    if (!status.active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status.active]);

  if (!status.active && !status.activities.length) return null;
  const activities = (status.activities || []).slice(-4);
  const endTime = status.active ? now : Date.parse(status.updatedAt || "") || now;
  const elapsed = elapsedText(status.startedAt, endTime);

  return (
    <section className={styles.timeline} aria-label="Codex 工作过程">
      <button className={styles.header} type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {status.active
          ? <LoaderCircle className={styles.spinner} aria-hidden="true" />
          : <Check className={styles.completed} aria-hidden="true" />}
        <span>{status.label.replace(/^Codex\s*/u, "")}</span>
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
