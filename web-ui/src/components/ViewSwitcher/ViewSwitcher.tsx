import { Bot, ListChecks, MessagesSquare } from "lucide-react";
import type { MouseEvent } from "react";
import { ProjectStatusControl } from "../../features/project-status/ProjectStatusControl";
import styles from "./ViewSwitcher.module.css";

export type ViewSurface = "conversation" | "group" | "progress";

const surfaceHref = (surface: ViewSurface) => {
  const params = new URLSearchParams(window.location.search);
  params.delete("view");
  if (surface === "group") params.set("view", "group");
  const query = params.toString();
  const path = surface === "progress" ? "/progress" : "/";
  return `${path}${query ? `?${query}` : ""}`;
};

export function ViewSwitcher({ current, onViewChange, projectId = "", projectRoot = "", currentSourceId = "" }: {
  current: ViewSurface;
  onViewChange?: (surface: "conversation" | "group") => void;
  projectId?: string;
  projectRoot?: string;
  currentSourceId?: string;
}) {
  const handleView = (surface: "conversation" | "group") => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onViewChange || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onViewChange(surface);
  };
  return (
    <nav className={styles.root} aria-label="切换对话模式">
      <a className={current === "conversation" ? styles.active : ""} href={surfaceHref("conversation")} onClick={handleView("conversation")} title="单人 Codex 对话" aria-label="单人 Codex 对话">
        <Bot aria-hidden="true" /><span>对话</span>
      </a>
      <a className={current === "group" ? styles.active : ""} href={surfaceHref("group")} onClick={handleView("group")} title="项目群聊" aria-label="项目群聊">
        <MessagesSquare aria-hidden="true" /><span>群聊</span>
      </a>
      {current === "progress" ? (
        <a className={styles.active} href={surfaceHref("progress")} title="项目管理" aria-label="项目管理">
          <ListChecks aria-hidden="true" /><span>进度</span>
        </a>
      ) : <ProjectStatusControl projectId={projectId} projectRoot={projectRoot} currentSourceId={currentSourceId} />}
    </nav>
  );
}
