import { Folder, LoaderCircle } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { ExecutionStatus } from "../../execution/model/types";
import { openAgentConversation } from "../../agent-sharing/navigation/openAgentConversation";
import { SessionList } from "../../conversations/components/SessionList";
import type { ProjectInfo, SessionSummary } from "../../conversations/model/types";
import type { DirectoryConversation, DirectoryProject, ProjectRuntimeStatus } from "../model/types";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import styles from "./ProjectDirectory.module.css";

const timeValue = (value?: string | null) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const employeeConversations = (entry: DirectoryProject): DirectoryConversation[] => {
  if (entry.conversations?.length) return entry.conversations;
  if (!entry.mainThreadId && !entry.mainConversationId) return [{
    id: `${entry.id}:main`,
    title: "主对话",
    main: true,
    pendingOpen: true,
    lastActivityAt: entry.lastActivityAt,
    status: entry.status,
  }];
  return [{
    id: entry.mainThreadId || entry.mainConversationId || `${entry.id}:main`,
    threadId: entry.mainThreadId,
    conversationId: entry.mainConversationId,
    title: "主对话",
    main: true,
    lastActivityAt: entry.lastActivityAt,
    status: entry.status,
  }];
};

const toSession = (entry: DirectoryProject, conversation: DirectoryConversation): SessionSummary => ({
  threadId: conversation.threadId || conversation.id,
  source: "codex",
  title: conversation.title || (conversation.main ? "主对话" : "附属对话"),
  updatedAt: conversation.lastActivityAt || conversation.updatedAt || entry.lastActivityAt || "",
  messageCount: conversation.messageCount ?? null,
  latestUser: "",
  latestAssistant: "",
  archived: conversation.archived,
  archivable: !conversation.pendingOpen,
});

interface ProjectDirectoryProps {
  project: ProjectInfo | null;
  workspaceName: string;
  projects: DirectoryProject[];
  loading: boolean;
  error: string;
  sessions: SessionSummary[];
  selectedId: string;
  currentStatus?: ExecutionStatus;
  statusByThread: Record<string, ProjectRuntimeStatus>;
  sessionsLoading: boolean;
  sessionsError: string;
  archivedView: boolean;
  archiveBusyId: string;
  onSelect: (threadId: string) => void;
  onArchive: (threadId: string) => Promise<boolean>;
  onUnarchive: (threadId: string) => Promise<boolean>;
  onOpened?: () => void;
  activeProjectId?: string;
  navigationOnly?: boolean;
  onProjectOpen?: (project: DirectoryProject) => void | Promise<void>;
}

export function ProjectDirectory({
  project,
  workspaceName,
  projects,
  loading,
  error,
  sessions,
  selectedId,
  currentStatus,
  statusByThread,
  sessionsLoading,
  sessionsError,
  archivedView,
  archiveBusyId,
  onSelect,
  onArchive,
  onUnarchive,
  onOpened,
  activeProjectId,
  navigationOnly = false,
  onProjectOpen,
}: ProjectDirectoryProps) {
  const params = new URLSearchParams(window.location.search);
  const routeEmployeeId = params.get("employeeId") || params.get("agent") || "";
  const routeThreadId = params.get("thread") || selectedId;
  const routeConversationId = params.get("conversation") || "";
  const namedProjects = useMemo(() => projects.map((entry) => entry.kind === "personal"
    ? { ...entry, name: workspaceName, root: project?.root || entry.root }
    : entry), [project?.root, projects, workspaceName]);
  const currentProject = useMemo<DirectoryProject | null>(() => namedProjects.find((entry) => entry.id === activeProjectId)
    || namedProjects.find((entry) => entry.employeeId === routeEmployeeId)
    || namedProjects.find((entry) => entry.mainThreadId === routeThreadId
      || entry.mainConversationId === routeConversationId
      || entry.conversations?.some((conversation) => (
        conversation.threadId === routeThreadId
        || conversation.conversationId === routeConversationId
        || conversation.id === selectedId
      )))
    || namedProjects.find((entry) => entry.kind === "personal")
    || (project ? { id: "current", name: workspaceName, root: project.root, kind: "personal", lastActivityAt: sessions[0]?.updatedAt } : null), [activeProjectId, namedProjects, project, routeConversationId, routeEmployeeId, routeThreadId, selectedId, sessions, workspaceName]);
  const [selectedProjectId, setSelectedProjectId] = useState(currentProject?.id || "");
  const [openingProjectId, setOpeningProjectId] = useState("");
  const [openError, setOpenError] = useState("");
  const visibleProjects = useMemo(() => {
    const source = namedProjects.length ? namedProjects : currentProject ? [currentProject] : [];
    return source.map((entry, index) => ({ entry, index })).sort((left, right) => (
      Number(left.entry.kind === "employee") - Number(right.entry.kind === "employee")
      || timeValue(right.entry.lastActivityAt) - timeValue(left.entry.lastActivityAt)
      || left.index - right.index
    )).map(({ entry }) => entry);
  }, [currentProject, namedProjects]);

  useEffect(() => {
    if (currentProject?.id) setSelectedProjectId(currentProject.id);
  }, [currentProject?.id, routeConversationId, routeEmployeeId, routeThreadId, selectedId]);

  const openConversation = async (entry: DirectoryProject, conversation: DirectoryConversation) => {
    if (!entry.employeeId) {
      onSelect(conversation.threadId || conversation.id);
      onOpened?.();
      return;
    }
    if (openingProjectId) return;
    setOpenError("");
    setOpeningProjectId(entry.id);
    try {
      await openAgentConversation({
        agentId: entry.employeeId,
        threadId: conversation.pendingOpen ? "" : conversation.threadId,
        conversationId: conversation.pendingOpen ? "" : conversation.conversationId,
      });
      onOpened?.();
    } catch (reason) {
      setOpenError(reason instanceof Error ? reason.message : "暂时无法进入单聊");
    } finally {
      setOpeningProjectId("");
    }
  };

  return (
    <nav className={styles.directory} aria-label="项目目录">
      <div className={styles.projectList}>
        {openError ? <span className={styles.error} role="alert">{openError}</span> : null}
        {loading && !visibleProjects.length ? <span className={styles.muted}>正在读取项目</span> : null}
        {!loading && error && !visibleProjects.length ? <span className={styles.muted}>项目状态暂不可用</span> : null}
        {visibleProjects.map((entry, index) => {
          const isCurrent = entry.id === currentProject?.id;
          const isSelected = entry.id === selectedProjectId;
          const isPersonal = entry.kind === "personal";
          const isEmployee = entry.kind === "employee";
          const startsSection = index === 0 || isEmployee !== (visibleProjects[index - 1]?.kind === "employee");
          const usesSessionFallback = isPersonal && !entry.conversations?.length;
          const conversations = isPersonal
            ? entry.conversations?.length ? entry.conversations : sessions.map((session, index) => ({ id: session.threadId, threadId: session.threadId, title: session.title, main: index === 0, lastActivityAt: session.updatedAt, messageCount: session.messageCount, archived: session.archived }))
            : employeeConversations(entry);
          const projectSessions = conversations.map((conversation) => toSession(entry, conversation));
          const projectStatus = isCurrent && currentStatus?.threadId
            ? statusByThread[currentStatus.threadId] || currentStatus
            : entry.mainThreadId ? statusByThread[entry.mainThreadId] || entry.status : entry.status;
          return (
            <Fragment key={entry.id}>
              {startsSection ? (
                <div className={`${styles.sectionLabel} ${isEmployee ? styles.employeeSectionLabel : ""}`}>
                  {isEmployee ? "员工项目" : "项目"}
                </div>
              ) : null}
              <div className={styles.projectBlock}>
              <button
                className={`${styles.project} ${isSelected ? styles.active : ""}`}
                type="button"
                aria-expanded={navigationOnly ? undefined : isSelected}
                onClick={() => {
                  if (!navigationOnly) {
                    setSelectedProjectId((current) => current === entry.id ? "" : entry.id);
                    return;
                  }
                  if (isEmployee) {
                    const mainConversation = conversations.find((conversation) => conversation.main) || conversations[0];
                    if (mainConversation) void openConversation(entry, mainConversation);
                    return;
                  }
                  setSelectedProjectId(entry.id);
                  void onProjectOpen?.(entry);
                  onOpened?.();
                }}
              >
                {openingProjectId === entry.id ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Folder aria-hidden="true" />}
                <span className={styles.projectText}><strong>{entry.name || "未命名项目"}</strong></span>
                <ProjectStatusBadge status={projectStatus} compact />
              </button>
              {!navigationOnly && isSelected ? (
                <div className={styles.sessionSlot}>
                  <SessionList
                    sessions={projectSessions}
                    selectedId={isCurrent ? selectedId : ""}
                    loading={usesSessionFallback ? sessionsLoading : false}
                    error={usesSessionFallback ? sessionsError : ""}
                    archivedView={archivedView}
                    archiveBusyId={archiveBusyId}
                    onSelect={(threadId) => {
                      const conversation = conversations.find((item) => (item.threadId || item.id) === threadId);
                      if (conversation) void openConversation(entry, conversation);
                    }}
                    onArchive={onArchive}
                    onUnarchive={onUnarchive}
                    currentStatus={currentStatus}
                    statusByThread={statusByThread}
                  />
                </div>
              ) : null}
              </div>
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}

const unavailableArchiveAction = async () => false;

export function ProjectNavigationDirectory({ workspaceName, projects, activeProjectId, loading = false, error = "", onProjectOpen, onOpened }: {
  workspaceName: string;
  projects: DirectoryProject[];
  activeProjectId?: string;
  loading?: boolean;
  error?: string;
  onProjectOpen: (project: DirectoryProject) => void | Promise<void>;
  onOpened?: () => void;
}) {
  return (
    <ProjectDirectory
      project={null}
      workspaceName={workspaceName}
      projects={projects}
      loading={loading}
      error={error}
      sessions={[]}
      selectedId=""
      statusByThread={{}}
      sessionsLoading={false}
      sessionsError=""
      archivedView={false}
      archiveBusyId=""
      onSelect={() => {}}
      onArchive={unavailableArchiveAction}
      onUnarchive={unavailableArchiveAction}
      onOpened={onOpened}
      activeProjectId={activeProjectId}
      navigationOnly
      onProjectOpen={onProjectOpen}
    />
  );
}
