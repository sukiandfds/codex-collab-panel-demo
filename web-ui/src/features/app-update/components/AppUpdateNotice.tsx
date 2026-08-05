import { useAppUpdate } from "../hooks/useAppUpdate";
import styles from "./AppUpdateNotice.module.css";

interface AppUpdateNoticeProps {
  surface: "conversation" | "group";
}

interface RefreshNoticeProps extends AppUpdateNoticeProps {
  title: string;
  detail: string;
  actionLabel: string;
  actionPending?: boolean;
  onAction: () => void;
}

export function RefreshNotice({
  surface,
  title,
  detail,
  actionLabel,
  actionPending = false,
  onAction,
}: RefreshNoticeProps) {
  return (
    <aside className={`${styles.notice} ${styles[surface]}`} role="alert" aria-live="polite">
      <div className={styles.copy}>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <button type="button" disabled={actionPending} onClick={onAction}>
        {actionLabel}
      </button>
    </aside>
  );
}

export function AppUpdateNotice({ surface }: AppUpdateNoticeProps) {
  const update = useAppUpdate();
  if (!update.updateAvailable) return null;

  return (
    <RefreshNotice
      surface={surface}
      title="网页已更新"
      detail="不会自动刷新；刷新后会重新连接当前任务。"
      actionLabel={update.applying ? "正在刷新…" : "刷新网页"}
      actionPending={update.applying}
      onAction={update.applyUpdate}
    />
  );
}
