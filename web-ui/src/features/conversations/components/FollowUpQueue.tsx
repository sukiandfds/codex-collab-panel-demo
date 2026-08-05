import { useState } from "react";
import { Check, ChevronDown, ChevronUp, ListOrdered, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react";
import type { FollowUpQueueItem } from "../model/followUpQueue";
import styles from "./FollowUpQueue.module.css";

interface FollowUpQueueProps {
  items: FollowUpQueueItem[];
  busy: boolean;
  error: string;
  onEdit: (itemId: string, text: string) => Promise<boolean>;
  onRemove: (itemId: string) => Promise<boolean>;
  onMove: (itemId: string, direction: "up" | "down") => Promise<boolean>;
  onRetry: (itemId: string) => Promise<boolean>;
  onSendNow: (itemId: string) => Promise<boolean>;
}

const stateLabel = (item: FollowUpQueueItem) => {
  if (item.state === "dispatching") return "正在发送";
  if (item.state === "failed") return "发送失败";
  return "等待执行";
};

export function FollowUpQueue({ items, busy, error, onEdit, onRemove, onMove, onRetry, onSendNow }: FollowUpQueueProps) {
  const [editingId, setEditingId] = useState("");
  const [editingText, setEditingText] = useState("");

  if (!items.length && !error) return null;

  const beginEdit = (item: FollowUpQueueItem) => {
    setEditingId(item.id);
    setEditingText(item.text);
  };
  const cancelEdit = () => {
    setEditingId("");
    setEditingText("");
  };
  const saveEdit = async () => {
    if (!editingId || !editingText.trim()) return;
    if (await onEdit(editingId, editingText)) cancelEdit();
  };

  return (
    <section className={styles.queue} aria-label="指令等候中">
      <div className={styles.heading}>
        <span className={styles.headingLabel}><ListOrdered aria-hidden="true" /> 指令等候中</span>
        <span className={styles.count}>{items.length}</span>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.items}>
        {items.map((item, index) => {
          const editing = editingId === item.id;
          const locked = busy || item.state === "dispatching";
          return (
            <article className={`${styles.item} ${item.state === "failed" ? styles.failed : ""}`} key={item.id}>
              <div className={styles.position}>{index + 1}</div>
              <div className={styles.content}>
                {editing ? (
                  <textarea
                    className={styles.editor}
                    value={editingText}
                    rows={2}
                    autoFocus
                    onChange={(event) => setEditingText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        void saveEdit();
                      }
                      if (event.key === "Escape") cancelEdit();
                    }}
                  />
                ) : (
                  <p className={styles.text}>{item.text || "附件指令"}</p>
                )}
                <div className={styles.meta}>
                  <span>{stateLabel(item)}</span>
                  {item.attachments.length > 0 && <span>附件 {item.attachments.length}</span>}
                  {item.error && <span className={styles.failureText}>{item.error}</span>}
                </div>
              </div>
              <div className={styles.actions}>
                {editing ? (
                  <>
                    <button type="button" title="保存编辑" aria-label="保存编辑" disabled={busy || !editingText.trim()} onClick={() => void saveEdit()}>
                      <Check aria-hidden="true" />
                    </button>
                    <button type="button" title="取消编辑" aria-label="取消编辑" disabled={busy} onClick={cancelEdit}>
                      <X aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" title="直接发送" aria-label="直接发送" disabled={locked} onClick={() => void onSendNow(item.id)}><Send aria-hidden="true" /></button>
                    {item.state === "failed" && <button type="button" title="重试" aria-label="重试" disabled={locked} onClick={() => void onRetry(item.id)}><RotateCcw aria-hidden="true" /></button>}
                    <button type="button" title="编辑" aria-label="编辑" disabled={locked} onClick={() => beginEdit(item)}><Pencil aria-hidden="true" /></button>
                    <button type="button" title="上移" aria-label="上移" disabled={locked || index === 0} onClick={() => void onMove(item.id, "up")}><ChevronUp aria-hidden="true" /></button>
                    <button type="button" title="下移" aria-label="下移" disabled={locked || index === items.length - 1} onClick={() => void onMove(item.id, "down")}><ChevronDown aria-hidden="true" /></button>
                    <button type="button" title="删除" aria-label="删除" disabled={locked} onClick={() => void onRemove(item.id)}><Trash2 aria-hidden="true" /></button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
