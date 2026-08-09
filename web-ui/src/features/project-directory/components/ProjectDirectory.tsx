import { ChevronDown, ChevronRight, Folder, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { ExecutionStatus } from "../../execution/model/types";
import type { ProjectInfo } from "../../conversations/model/types";
import type { DirectoryProject } from "../model/types";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import styles from "./ProjectDirectory.module.css";

const openProject = async (project: DirectoryProject, onOpened?: () => void) => {
  if (project.employeeId) {
    const currentParams = new URLSearchParams(window.location.search);
    const employeeParams = new URLSearchParams({ employeeId: project.employeeId });
    const token = currentParams.get("token");
    if (token) employeeParams.set("token", token);
    window.location.assign(`/employee.html?${employeeParams.toString()}`);
    return;
  }
  const params = new URLSearchParams(window.location.search);
  params.delete("view");
  params.delete("archived");
  params.delete("thread");
  params.delete("agent");
  params.delete("employee");
  params.delete("conversation");
  const query = params.toString();
  window.history.pushState({ surface: "conversation", projectId: project.id }, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  window.dispatchEvent(new Event("negus:navigate"));
  onOpened?.();
};

interface ProjectDirectoryProps {
  project: ProjectInfo | null;
  projects: DirectoryProject[];
  loading: boolean;
  error: string;
  selectedId: string;
  currentStatus?: ExecutionStatus;
  onOpened?: () => void;
}

export function ProjectDirectory({ project, projects, loading, error, selectedId, currentStatus, onOpened }: ProjectDirectoryProps) {
  const [expanded, setExpanded] = useState(true);
  const [openingId, setOpeningId] = useState("");
  const [openError, setOpenError] = useState("");
  const currentProject = useMemo<DirectoryProject | null>(() => {
    const employeeId = new URLSearchParams(window.location.search).get("agent") || "";
    return projects.find((entry) => entry.employeeId === employeeId)
      || projects.find((entry) => entry.kind === "personal")
      || (project ? { id: "current", name: project.name, root: project.root, kind: "personal" } : null);
  }, [project, projects, selectedId]);
  const visibleProjects = projects.length ? projects : currentProject ? [currentProject] : [];
  const status = currentStatus?.threadId === selectedId
    ? { active: currentStatus.active, phase: currentStatus.phase, label: currentStatus.label, updatedAt: currentStatus.updatedAt }
    : currentProject?.status;

  return (
    <nav className={styles.directory} aria-label="项目目录">
      <button className={styles.groupToggle} type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        <span>我的项目</span>
      </button>
      {expanded ? (
        <div className={styles.projectList}>
          {openError ? <span className={styles.error} role="alert">{openError}</span> : null}
          {loading && !visibleProjects.length ? <span className={styles.muted}>正在读取项目</span> : null}
          {!loading && error && !visibleProjects.length ? <span className={styles.muted}>项目状态暂不可用</span> : null}
          {visibleProjects.map((entry) => (
            <button className={`${styles.project} ${entry.id === currentProject?.id ? styles.active : ""}`} type="button" key={entry.id} disabled={Boolean(openingId)} onClick={() => {
              if (entry.id === currentProject?.id) return;
              setOpeningId(entry.id);
              setOpenError("");
              void openProject(entry, onOpened).catch((reason) => {
                setOpenError(reason instanceof Error ? reason.message : "暂时无法打开项目");
              }).finally(() => setOpeningId(""));
            }}>
              {openingId === entry.id ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Folder aria-hidden="true" />}
              <span className={styles.projectText}>
                <strong>{entry.name || "未命名项目"}</strong>
                {entry.id === currentProject?.id ? <ProjectStatusBadge status={status} /> : <ProjectStatusBadge status={entry.status} compact />}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
