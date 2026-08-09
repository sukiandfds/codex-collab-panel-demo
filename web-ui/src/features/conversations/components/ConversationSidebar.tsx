import { Archive, ArchiveRestore, RefreshCw, SquarePen } from "lucide-react";
import { SidebarHeader } from "../../../components/Sidebar/SidebarHeader";
import type { ProjectInfo, SessionSummary } from "../model/types";
import type { ExecutionStatus } from "../../execution/model/types";
import { useProjectDirectory } from "../../project-directory/hooks/useProjectDirectory";
import { ProjectDirectory } from "../../project-directory/components/ProjectDirectory";
import { ConnectionStatus } from "./ConnectionStatus";
import { SessionList } from "./SessionList";
import styles from "./ConversationSidebar.module.css";

interface ConversationSidebarProps {
  project: ProjectInfo | null;
  sessions: SessionSummary[];
  selectedId: string;
  loading: boolean;
  connected: boolean;
  creating: boolean;
  archivedView: boolean;
  archiveBusyId: string;
  error: string;
  onSelect: (threadId: string) => void;
  onCreate: () => Promise<boolean>;
  onRefresh: () => void;
  onArchiveViewChange: (archived: boolean) => Promise<void>;
  onArchive: (threadId: string) => Promise<boolean>;
  onUnarchive: (threadId: string) => Promise<boolean>;
  currentStatus?: ExecutionStatus;
  onCloseSidebar?: () => void;
}

export function ConversationSidebar({
  project,
  sessions,
  selectedId,
  loading,
  connected,
  creating,
  archivedView,
  archiveBusyId,
  error,
  onSelect,
  onCreate,
  onRefresh,
  onArchiveViewChange,
  onArchive,
  onUnarchive,
  currentStatus,
  onCloseSidebar,
}: ConversationSidebarProps) {
  const directory = useProjectDirectory();
  const workspaceName = project?.root.split(/[\\/]/u).filter(Boolean).slice(-1)[0]
    || project?.name
    || "正在读取项目";

  return (
    <aside className={styles.sidebar} aria-label="当前项目会话">
      <SidebarHeader
        project={workspaceName}
        projectTitle={project?.root}
        actions={(
          <>
          <button className={styles.iconButton} type="button" aria-label="新建对话" title="新建对话" disabled={creating} onClick={() => void onCreate()}>
            <SquarePen aria-hidden="true" />
          </button>
          <button className={styles.iconButton} type="button" aria-label="刷新会话" title="刷新会话" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
          </button>
          <button
            className={`${styles.iconButton} ${archivedView ? styles.activeAction : ""}`}
            type="button"
            aria-label={archivedView ? "返回项目会话" : "查看已归档对话"}
            aria-pressed={archivedView}
            title={archivedView ? "返回项目会话" : "已归档对话"}
            onClick={() => void onArchiveViewChange(!archivedView)}
          >
            {archivedView ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
          </button>
          </>
        )}
      />
      <ProjectDirectory
        project={project}
        projects={directory.projects}
        loading={directory.loading}
        error={directory.error}
        selectedId={selectedId}
        currentStatus={currentStatus}
        onOpened={onCloseSidebar}
      />
      <SessionList
        sessions={sessions}
        selectedId={selectedId}
        loading={loading}
        error={error}
        archivedView={archivedView}
        archiveBusyId={archiveBusyId}
        onSelect={onSelect}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        currentStatus={currentStatus}
      />
      <ConnectionStatus connected={connected} />
    </aside>
  );
}
