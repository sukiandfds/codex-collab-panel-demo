import { MessageSquare } from "lucide-react";
import type { SessionSummary } from "../model/types";
import styles from "./SessionList.module.css";

interface SessionListProps {
  sessions: SessionSummary[];
  selectedId: string;
  loading: boolean;
  error: string;
  onSelect: (threadId: string) => void;
}

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
});

export function SessionList({ sessions, selectedId, loading, error, onSelect }: SessionListProps) {
  return (
    <div className={styles.root}>
      <h2>项目会话</h2>
      {loading ? <div className={styles.loading}><span /><span /><span /></div> : null}
      {!loading && !sessions.length ? <p className={styles.empty}>{error || "当前项目暂无可显示会话"}</p> : null}
      {sessions.map((session) => (
        <button
          className={`${styles.item} ${session.threadId === selectedId ? styles.active : ""}`}
          type="button"
          key={session.threadId}
          onClick={() => onSelect(session.threadId)}
        >
          <MessageSquare aria-hidden="true" />
          <span className={styles.content}>
            <span className={styles.title}>{session.title}</span>
            <span className={styles.meta}>
              {session.source === "happy" ? "Happy" : "Codex"} · {timeFormatter.format(new Date(session.updatedAt))}
              {session.messageCount === null ? "" : ` · ${session.messageCount} 条`}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
