import { useAppUpdate } from "../hooks/useAppUpdate";
import styles from "./AppUpdateNotice.module.css";

interface AppUpdateNoticeProps {
  surface: "conversation" | "group";
}

export function AppUpdateNotice({ surface }: AppUpdateNoticeProps) {
  const update = useAppUpdate();
  if (!update.updateAvailable) return null;

  return (
    <aside className={`${styles.notice} ${styles[surface]}`} role="status" aria-live="polite">
      <div className={styles.copy}>
        <strong>网页已更新</strong>
        <span>不会自动刷新；刷新后会重新连接当前任务。</span>
      </div>
      <button type="button" disabled={update.applying} onClick={update.applyUpdate}>
        {update.applying ? "正在刷新…" : "刷新网页"}
      </button>
    </aside>
  );
}
