import type { ReactNode } from "react";
import { Folder } from "lucide-react";
import styles from "./SidebarHeader.module.css";

export function SidebarHeader({ project, projectTitle, actions }: {
  project?: string;
  projectTitle?: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <div className={styles.brandRow}>
        <div className={styles.brand}>NEGUS</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {project ? (
        <div className={styles.projectHeader} title={projectTitle || project}>
          <Folder aria-hidden="true" />
          <span>{project}</span>
        </div>
      ) : null}
    </>
  );
}
