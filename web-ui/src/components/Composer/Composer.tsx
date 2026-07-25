import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { AttachmentButton, AttachmentPreviews } from "../../features/attachments/components/AttachmentDraft";
import { useAttachmentDraft } from "../../features/attachments/hooks/useAttachmentDraft";
import { ExecutionStatus } from "../../features/execution/components/ExecutionStatus";
import type { ExecutionStatus as ExecutionStatusValue } from "../../features/execution/model/types";
import styles from "./Composer.module.css";

interface ComposerProps {
  connected: boolean;
  selected: boolean;
  sending: boolean;
  status: ExecutionStatusValue;
  commentary: string;
  onSend: (text: string, attachmentIds?: string[]) => Promise<boolean>;
  onInterrupt: () => Promise<boolean>;
}

export function Composer({ connected, selected, sending, status, commentary, onSend, onInterrupt }: ComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const draft = useAttachmentDraft();
  const inputDisabled = !connected || !selected || sending || draft.uploading;
  const hasContent = Boolean(text.trim() || draft.attachments.length);
  const sendDisabled = inputDisabled || !hasContent;
  const submit = async () => {
    if (sendDisabled || submittingRef.current) return;
    submittingRef.current = true;
    try {
      const uploaded = await draft.uploadAll();
      if (await onSend(text, uploaded.map((attachment) => attachment.id))) {
        setText("");
        draft.clear();
      }
    } catch {}
    finally { submittingRef.current = false; }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [text]);

  return (
    <div className={styles.positioner}>
      <div
        className={styles.composer}
        aria-label="Codex 对话输入"
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          draft.addFiles(event.dataTransfer.files);
        }}
      >
        <label className={styles.srOnly} htmlFor="prompt">给 Codex 发送指令</label>
        <textarea
          id="prompt"
          ref={textareaRef}
          rows={2}
          value={text}
          placeholder={!selected ? "请选择一个对话" : status.active ? "追加指令，引导当前任务" : "给 Codex 发送指令"}
          disabled={inputDisabled}
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
        <AttachmentPreviews attachments={draft.attachments} error={draft.error} uploading={draft.uploading} onRemove={draft.removeFile} />
        <div className={styles.footer}>
          <AttachmentButton disabled={inputDisabled} onFiles={draft.addFiles} />
          <ExecutionStatus connected={connected} status={status} commentary={commentary} />
          <span className={styles.spacer} />
          <button
            className={styles.sendButton}
            type="button"
            aria-label={status.active && !hasContent ? "停止当前任务" : "发送指令"}
            title={status.active && !hasContent ? "停止当前任务" : "发送指令"}
            disabled={status.active && !hasContent ? inputDisabled : sendDisabled}
            onClick={() => status.active && !hasContent ? void onInterrupt() : void submit()}
          >
            {status.active && !hasContent ? <Square className={styles.stopIcon} aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}
