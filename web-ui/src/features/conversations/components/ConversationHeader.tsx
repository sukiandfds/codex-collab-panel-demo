import { useCallback, useState, type ReactNode } from "react";
import { Check, Edit3, Folder, PanelLeft, Share2, X } from "lucide-react";
import { ViewSwitcher } from "../../../components/ViewSwitcher/ViewSwitcher";
import { ShareConversationDialog } from "../../conversation-sharing/components/ShareConversationDialog";
import { DeviceStatus } from "../../device/components/DeviceStatus";
import type { ProjectInfo, SessionDetail } from "../model/types";
import styles from "./ConversationHeader.module.css";

interface ConversationHeaderProps {
  project: ProjectInfo | null;
  session: SessionDetail | null;
  deviceName?: string;
  connected: boolean;
  onOpenSidebar: () => void;
  onRename: (name: string) => Promise<boolean>;
  renaming: boolean;
  usage?: ReactNode;
}

export function ConversationHeader({ project, session, deviceName, connected, onOpenSidebar, onRename, renaming, usage }: ConversationHeaderProps) {
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState("");
  const closeSharing = useCallback(() => setSharing(false), []);
  const title = session?.title || project?.name || "当前对话";
  const startEditing = () => {
    if (!session || renaming) return;
    setDraft(session.title || "");
    setRenameError("");
    setEditing(true);
  };
  const cancelEditing = () => {
    if (renaming) return;
    setEditing(false);
    setRenameError("");
  };
  const saveEditing = async () => {
    const name = draft.trim();
    if (!name || name.length > 120 || renaming) return;
    if (await onRename(name)) {
      setEditing(false);
      setRenameError("");
    } else {
      setRenameError("重命名失败，请稍后重试");
    }
  };

  return (
    <>
      <header className={styles.header}>
        <div className={styles.topbar}>
          <button className={`${styles.iconButton} ${styles.mobileOnly}`} type="button" aria-label="打开侧栏" title="打开侧栏" onClick={onOpenSidebar}>
            <PanelLeft aria-hidden="true" />
          </button>
          <Folder className={styles.titleIcon} aria-hidden="true" />
          <div className={styles.heading}>
            <div className={styles.titleRow}>
              {editing ? (
                <input
                  className={styles.titleInput}
                  value={draft}
                  maxLength={120}
                  autoFocus
                  aria-label="对话名称"
                  onChange={(event) => { setDraft(event.target.value); setRenameError(""); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); void saveEditing(); }
                    if (event.key === "Escape") { event.preventDefault(); cancelEditing(); }
                  }}
                />
              ) : (
                <h1 className={styles.title}>{session?.title || project?.name || "正在读取会话"}</h1>
              )}
              {session && !editing ? (
                <button className={styles.titleEdit} type="button" aria-label="重命名对话" title="重命名对话" disabled={renaming} onClick={startEditing}>
                  <Edit3 aria-hidden="true" />
                </button>
              ) : null}
              {editing ? (
                <div className={styles.titleActions}>
                  <button className={styles.titleEdit} type="button" aria-label="保存对话名称" title="保存" disabled={renaming || !draft.trim()} onClick={() => void saveEditing()}>
                    <Check aria-hidden="true" />
                  </button>
                  <button className={styles.titleEdit} type="button" aria-label="取消重命名" title="取消" disabled={renaming} onClick={cancelEditing}>
                    <X aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
            {session ? <span className={styles.meta}>{session.source === "happy" ? "Happy Coder" : "Codex Desktop"}{session.messageCount === null ? "" : ` · ${session.messageCount} 条消息`}</span> : null}
            {renameError ? <span className={styles.renameError}>{renameError}</span> : null}
          </div>
          <span className={styles.spacer} />
          <button className={styles.iconButton} type="button" aria-label="分享当前对话" title="分享" onClick={() => setSharing(true)}>
            <Share2 aria-hidden="true" />
          </button>
          <ViewSwitcher current="conversation" />
        </div>
        <div className={styles.statusbar}>
          <DeviceStatus name={deviceName} connected={connected} />
          <span className={styles.statusDivider} aria-hidden="true">·</span>
          {usage}
        </div>
      </header>
      <ShareConversationDialog open={sharing} title={title} onClose={closeSharing} />
    </>
  );
}
