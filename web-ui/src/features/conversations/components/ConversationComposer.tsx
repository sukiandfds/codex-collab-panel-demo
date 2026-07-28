import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { AttachmentButton, AttachmentPreviews } from "../../attachments/components/AttachmentDraft";
import { useAttachmentDraft } from "../../attachments/hooks/useAttachmentDraft";
import { ContextControl } from "../../context-management/components/ContextControl";
import type { ContextStatus } from "../../context-management/model/types";
import { ExecutionStatus } from "../../execution/components/ExecutionStatus";
import type { ExecutionStatus as ExecutionStatusValue } from "../../execution/model/types";
import { ModelSelect } from "../../models/components/ModelSelect";
import type { CodexModel } from "../../models/model/types";
import type { MediaFile } from "../../../shared/model/media";
import styles from "./ConversationComposer.module.css";

interface ConversationComposerProps {
  connected: boolean;
  selected: boolean;
  sending: boolean;
  status: ExecutionStatusValue;
  commentary: string;
  contextStatus: ContextStatus;
  models: CodexModel[];
  modelsLoading: boolean;
  modelChanging: boolean;
  modelError: string;
  onSend: (text: string, attachments?: MediaFile[]) => Promise<boolean>;
  onInterrupt: () => Promise<boolean>;
  onCompactContext: () => Promise<boolean>;
  onAutoCompactThresholdChange: (threshold: number | null) => Promise<boolean>;
  onModelChange: (model: string) => Promise<boolean>;
}

export function ConversationComposer({
  connected, selected, sending, status, commentary, contextStatus,
  models, modelsLoading, modelChanging, modelError,
  onSend, onInterrupt, onCompactContext, onAutoCompactThresholdChange, onModelChange,
}: ConversationComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const draft = useAttachmentDraft();
  const inputDisabled = !selected || sending || draft.uploading;
  const hasContent = Boolean(text.trim() || draft.attachments.length);
  const sendDisabled = inputDisabled || !hasContent;
  const submit = async () => {
    if (sendDisabled || submittingRef.current) return;
    submittingRef.current = true;
    const submittedText = text;
    try {
      const uploaded = await draft.uploadAll();
      setText("");
      if (await onSend(submittedText, uploaded)) draft.clear();
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
          <ModelSelect
            currentModel={contextStatus.model}
            models={models}
            loading={modelsLoading}
            changing={modelChanging}
            error={modelError}
            disabled={!connected || !selected || status.active}
            onChange={onModelChange}
          />
          <ContextControl
            status={contextStatus}
            disabled={!connected || !selected}
            onCompact={onCompactContext}
            onThresholdChange={onAutoCompactThresholdChange}
          />
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
