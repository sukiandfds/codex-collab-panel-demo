import type { ReactNode } from "react";
import styles from "./AppShell.module.css";

interface AppShellProps {
  chrome: ReactNode;
  sidebar: ReactNode;
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  header: ReactNode;
  conversation: ReactNode;
  composer: ReactNode;
}

export function AppShell({ chrome, sidebar, sidebarOpen, onCloseSidebar, header, conversation, composer }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.chrome}>{chrome}</div>
      <button
        className={`${styles.backdrop} ${sidebarOpen ? styles.backdropOpen : ""}`}
        type="button"
        aria-label="关闭侧栏"
        onClick={onCloseSidebar}
      />
      <div className={`${styles.sidebarSlot} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        {sidebar}
      </div>
      <section className={styles.workspace}>
        {header}
        <main className={styles.main}>
          {conversation}
          {composer}
        </main>
      </section>
    </div>
  );
}
