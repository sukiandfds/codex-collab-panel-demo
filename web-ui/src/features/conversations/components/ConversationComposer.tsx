import { useEffect, useRef, useState } from "react";
import { Send, Square, X } from "lucide-react";
import { FollowUpQueue } from "./FollowUpQueue";
import type { FollowUpQueueItem } from "../model/followUpQueue";
import { AttachmentButton, AttachmentPreviews } from "../../attachments/components/AttachmentDraft";
import { useAttachmentDraft } from "../../attachments/hooks/useAttachmentDraft";
import { ContextControl } from "../../context-management/components/ContextControl";
import type { ContextStatus } from "../../context-management/model/types";
import { ExecutionStatus } from "../../execution/components/ExecutionStatus";
import type { ExecutionStatus as ExecutionStatusValue } from "../../execution/model/types";
import { ModelSettingsControl } from "../../models/components/ModelSettingsControl";
import type { CodexModel } from "../../models/model/types";
import type { MediaFile } from "../../../shared/model/media";
import type { SessionMessage } from "../model/types";
import styles from "./ConversationComposer.module.css";

interface ConversationComposerProps {
  connected: boolean;
  selected: boolean;
  archived: boolean;
  sending: boolean;
  sendingSlow: boolean;
  status: ExecutionStatusValue;
  commentary: string;
  contextStatus: ContextStatus;
  models: CodexModel[];
  modelsLoading: boolean;
  modelChanging: boolean;
  modelError: string;
  onSend: (text: string, attachments?: MediaFile[]) => Promise<boolean>;
  onQueue: (text: string, attachments?: MediaFile[]) => Promise<boolean>;
  queueing: boolean;
  queueItems: FollowUpQueueItem[];
  queueError: string;
  onEditQueueItem: (itemId: string, text: string) => Promise<boolean>;
  onRemoveQueueItem: (itemId: string) => Promise<boolean>;
  onMoveQueueItem: (itemId: string, direction: "up" | "down") => Promise<boolean>;
  onRetryQueueItem: (itemId: string) => Promise<boolean>;
  onSendQueueItem: (itemId: string) => Promise<boolean>;
  editingMessage: SessionMessage | null;
  onCancelEdit: () => void;
  onInterrupt: () => Promise<boolean>;
  onCompactContext: () => Promise<boolean>;
  onAutoCompactThresholdChange: (threshold: number | null) => Promise<boolean>;
  onModelChange: (model: string) => Promise<boolean>;
  onReasoningEffortChange: (reasoningEffort: string) => Promise<boolean>;
}

export function ConversationComposer({
  connected, selected, archived, sending, sendingSlow, status, commentary, contextStatus,
  models, modelsLoading, modelChanging, modelError,
  onSend, onQueue, queueing, queueItems, queueError, onEditQueueItem, onRemoveQueueItem, onMoveQueueItem, onRetryQueueItem,
  onSendQueueItem,
  editingMessage, onCancelEdit,
  onInterrupt, onCompactContext, onAutoCompactThresholdChange, onModelChange,
  onReasoningEffortChange,
}: ConversationComposerProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const draft = useAttachmentDraft();
  const inputDisabled = !selected || archived || sending || queueing || draft.uploading
    || status.phase === "recovering" || status.phase === "unknown";
  const editing = Boolean(editingMessage);
  const inheritedAttachments = editingMessage?.blocks?.flatMap((block) => (
    "file" in block && block.file ? [block.file] : []
  )) || [];
  const hasContent = Boolean(text.trim() || draft.attachments.length || inheritedAttachments.length);

  useEffect(() => {
    if (!editingMessage) return;
    setText(editingMessage.text);
    draft.clear();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [draft.clear, editingMessage?.id]);

  const submit = async () => {
    const disabled = inputDisabled || !hasContent;
    if (disabled || submittingRef.current) return;
    submittingRef.current = true;
    const submittedText = text;
    setText("");
    try {
      const uploaded = draft.attachments.length ? await draft.uploadAll() : [];
      const submittedAttachments = editing
        ? [...inheritedAttachments, ...uploaded.filter((attachment) => !inheritedAttachments.some((item) => item.id === attachment.id))]
        : uploaded;
      const accepted = editing || !status.active
        ? await onSend(submittedText, submittedAttachments)
        : await onQueue(submittedText, submittedAttachments);
      if (accepted) draft.clear();
      else setText((current) => current || submittedText);
    } catch {
      setText((current) => current || submittedText);
    } finally {
      submittingRef.current = false;
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [text]);

  return (
    <div className={styles.positioner}>
      <FollowUpQueue
        items={queueItems}
        busy={queueing}
        error={queueError}
        onEdit={onEditQueueItem}
        onRemove={onRemoveQueueItem}
        onMove={onMoveQueueItem}
        onRetry={onRetryQueueItem}
        onSendNow={onSendQueueItem}
      />
      <div
        className={`${styles.composer} ${focused ? styles.focused : ""}`}
        aria-label="Codex 对话输入"
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          draft.addFiles(event.dataTransfer.files);
        }}
      >
        {editingMessage ? (
          <div className={styles.editingBar}>
            <span><strong>重新编辑</strong><span className={styles.editingPreview}>{editingMessage.text || "附件指令"}</span></span>
            <button type="button" aria-label="取消重新编辑" title="取消重新编辑" onClick={() => { setText(""); draft.clear(); onCancelEdit(); }}>
              <X aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <AttachmentPreviews
          attachments={draft.attachments}
          error={draft.error}
          uploading={draft.uploading}
          uploadSlow={draft.uploadSlow}
          onRemove={draft.removeFile}
        />
        <label className={styles.srOnly} htmlFor="prompt">给 Codex 发送指令</label>
        <textarea
          id="prompt"
          ref={textareaRef}
          rows={2}
          value={text}
          placeholder={!selected ? "请选择一个对话" : archived ? "已归档，请先恢复对话" : status.active ? "追加指令，引导当前任务" : "给 Codex 发送指令"}
          disabled={inputDisabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            if (!event.clipboardData.files.length) return;
            event.preventDefault();
            draft.addFiles(event.clipboardData.files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className={styles.footer}>
          <div className={styles.leadingControls}>
            <AttachmentButton disabled={inputDisabled} onFiles={draft.addFiles} />
            <ExecutionStatus connected={connected} status={status} contextStatus={contextStatus} commentary={commentary} sendingSlow={sendingSlow} />
          </div>
          <span className={styles.spacer} />
          <div className={styles.settingsControls}>
            <ModelSettingsControl
              currentModel={contextStatus.model}
              currentEffort={contextStatus.reasoningEffort}
              models={models}
              loading={modelsLoading}
              changing={modelChanging}
              error={modelError}
              disabled={!connected || !selected || archived || status.active}
              onModelChange={onModelChange}
              onReasoningEffortChange={onReasoningEffortChange}
            />
            <ContextControl
              status={contextStatus}
              disabled={!connected || !selected || archived}
              onCompact={onCompactContext}
              onThresholdChange={onAutoCompactThresholdChange}
            />
          </div>
          {draft.uploading ? (
            <button
              className={styles.sendButton}
              type="button"
              aria-label="取消图片上传"
              title="取消图片上传"
              onClick={draft.cancelUpload}
            >
              <Square className={styles.stopIcon} aria-hidden="true" />
            </button>
          ) : status.active && !hasContent ? (
            <button
              className={styles.sendButton}
              type="button"
              aria-label="停止当前任务"
              title="停止当前任务"
              disabled={inputDisabled}
              onClick={() => void onInterrupt()}
            >
              <Square className={styles.stopIcon} aria-hidden="true" />
            </button>
          ) : (
            <button
              className={styles.sendButton}
              type="button"
              title={editing ? "重新发送" : status.active ? "加入等候队列" : "发送"}
              aria-label={editing ? "重新发送" : status.active ? "加入等候队列" : "发送"}
              disabled={inputDisabled || !hasContent}
              onClick={() => void submit()}
            >
              <Send aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
