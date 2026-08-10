import { Folder, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { postJson } from "../../../shared/api/http";
import type { ExecutionStatus } from "../../execution/model/types";
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
}

interface OpenEmployeeConversationResponse {
  conversationId: string;
  runtimeKind: string;
  threadId: string | null;
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
}: ProjectDirectoryProps) {
  const params = new URLSearchParams(window.location.search);
  const routeEmployeeId = params.get("employeeId") || params.get("agent") || "";
  const routeThreadId = params.get("thread") || selectedId;
  const routeConversationId = params.get("conversation") || "";
  const namedProjects = useMemo(() => projects.map((entry) => entry.kind === "personal"
    ? { ...entry, name: workspaceName, root: project?.root || entry.root }
    : entry), [project?.root, projects, workspaceName]);
  const currentProject = useMemo<DirectoryProject | null>(() => namedProjects.find((entry) => entry.employeeId === routeEmployeeId)
    || namedProjects.find((entry) => entry.mainThreadId === routeThreadId
      || entry.mainConversationId === routeConversationId
      || entry.conversations?.some((conversation) => (
        conversation.threadId === routeThreadId
        || conversation.conversationId === routeConversationId
        || conversation.id === selectedId
      )))
    || namedProjects.find((entry) => entry.kind === "personal")
    || (project ? { id: "current", name: workspaceName, root: project.root, kind: "personal", lastActivityAt: sessions[0]?.updatedAt } : null), [namedProjects, project, routeConversationId, routeEmployeeId, routeThreadId, selectedId, sessions, workspaceName]);
  const [selectedProjectId, setSelectedProjectId] = useState(currentProject?.id || "");
  const [openingProjectId, setOpeningProjectId] = useState("");
  const [openError, setOpenError] = useState("");
  const visibleProjects = useMemo(() => {
    const source = namedProjects.length ? namedProjects : currentProject ? [currentProject] : [];
    return source.map((entry, index) => ({ entry, index })).sort((left, right) => (
      timeValue(right.entry.lastActivityAt) - timeValue(left.entry.lastActivityAt)
      || left.index - right.index
    )).map(({ entry }) => entry);
  }, [currentProject, namedProjects]);

  useEffect(() => {
    if (currentProject?.id) setSelectedProjectId(currentProject.id);
  }, [currentProject?.id, routeConversationId, routeEmployeeId, routeThreadId, selectedId]);

  const navigateEmployeeConversation = (entry: DirectoryProject, conversation: DirectoryConversation) => {
    const params = new URLSearchParams(window.location.search);
    params.delete("view");
    params.delete("archived");
    params.delete("employee");
    params.delete("employeeId");
    params.set("agent", entry.employeeId || "");
    if (conversation.threadId) params.set("thread", conversation.threadId);
    else params.delete("thread");
    if (conversation.conversationId) params.set("conversation", conversation.conversationId);
    else params.delete("conversation");
    const query = params.toString();
    window.history.pushState({ surface: "conversation", agentId: entry.employeeId, threadId: conversation.threadId }, "", `/${query ? `?${query}` : ""}`);
    window.dispatchEvent(new Event("negus:navigate"));
    onOpened?.();
  };

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
      if (!conversation.pendingOpen) {
        navigateEmployeeConversation(entry, conversation);
        return;
      }
      const result = await postJson<OpenEmployeeConversationResponse>("/api/agent-conversations/open", { agentId: entry.employeeId });
      if (!result.threadId) throw new Error("当前 Runtime 暂不支持此单聊页面");
      navigateEmployeeConversation(entry, {
        ...conversation,
        pendingOpen: false,
        threadId: result.threadId,
        conversationId: result.conversationId || null,
        id: result.threadId,
      });
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
        {visibleProjects.map((entry) => {
          const isCurrent = entry.id === currentProject?.id;
          const isSelected = entry.id === selectedProjectId;
          const isPersonal = entry.kind === "personal";
          const usesSessionFallback = isPersonal && !entry.conversations?.length;
          const conversations = isPersonal
            ? entry.conversations?.length ? entry.conversations : sessions.map((session, index) => ({ id: session.threadId, threadId: session.threadId, title: session.title, main: index === 0, lastActivityAt: session.updatedAt, messageCount: session.messageCount, archived: session.archived }))
            : employeeConversations(entry);
          const projectSessions = conversations.map((conversation) => toSession(entry, conversation));
          const projectStatus = isCurrent && currentStatus?.threadId
            ? statusByThread[currentStatus.threadId] || currentStatus
            : entry.mainThreadId ? statusByThread[entry.mainThreadId] || entry.status : entry.status;
          return (
            <div className={styles.projectBlock} key={entry.id}>
              <button className={`${styles.project} ${isSelected ? styles.active : ""}`} type="button" aria-expanded={isSelected} onClick={() => setSelectedProjectId((current) => current === entry.id ? "" : entry.id)}>
                {openingProjectId === entry.id ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Folder aria-hidden="true" />}
                <span className={styles.projectText}><strong>{entry.name || "未命名项目"}</strong></span>
                <ProjectStatusBadge status={projectStatus} compact />
              </button>
              {isSelected ? (
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
          );
        })}
      </div>
    </nav>
  );
}
