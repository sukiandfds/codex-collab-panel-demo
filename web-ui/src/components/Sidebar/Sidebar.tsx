import { ChevronDown, Folder, RefreshCw, SquarePen } from "lucide-react";
import type { ProjectInfo, SessionSummary } from "../../features/conversations/model/types";
import { ConnectionStatus } from "../../features/conversations/components/ConnectionStatus";
import { SessionList } from "../../features/conversations/components/SessionList";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  project: ProjectInfo | null;
  sessions: SessionSummary[];
  selectedId: string;
  loading: boolean;
  connected: boolean;
  creating: boolean;
  error: string;
  onSelect: (threadId: string) => void;
  onCreate: () => Promise<boolean>;
  onRefresh: () => void;
}

export function Sidebar({ project, sessions, selectedId, loading, connected, creating, error, onSelect, onCreate, onRefresh }: SidebarProps) {
  return (
    <aside className={styles.sidebar} aria-label="当前项目会话">
      <div className={styles.brandRow}>
        <div className={styles.brand}>
          <span>Codex</span>
          <ChevronDown aria-hidden="true" />
        </div>
        <div className={styles.actions}>
          <button className={styles.iconButton} type="button" aria-label="新建对话" title="新建对话" disabled={creating} onClick={() => void onCreate()}>
            <SquarePen aria-hidden="true" />
          </button>
          <button className={styles.iconButton} type="button" aria-label="刷新会话" title="刷新会话" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.projectHeader}>
        <Folder aria-hidden="true" />
        <span>{project?.name || "正在读取项目"}</span>
      </div>

      <SessionList sessions={sessions} selectedId={selectedId} loading={loading} error={error} onSelect={onSelect} />
      <ConnectionStatus connected={connected} />
    </aside>
  );
}
