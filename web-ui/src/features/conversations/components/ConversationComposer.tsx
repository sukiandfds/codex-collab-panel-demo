import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Square, X } from "lucide-react";
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
import { GoalControl } from "../../goals/components/GoalControl";
import type { EditableGoalStatus, ThreadGoal } from "../../goals/model/types";
import { goalCapabilityOptions } from "../../goals/model/capability";
import { SlashCommandMenu, type SlashCommandOption } from "./SlashCommandMenu";
import styles from "./ConversationComposer.module.css";

interface SlashState { start: number; end: number; query: string; replaceDraft?: boolean }

const slashCommands: SlashCommandOption[] = [
  { id: "compact", command: "/compact", group: "会话", label: "压缩上下文", detail: "整理当前对话上下文" },
  { id: "stop", command: "/stop", group: "会话", label: "停止任务", detail: "停止当前正在运行的任务" },
  { id: "review", command: "/review", group: "Codex", label: "审查当前项目", detail: "调用原生 Codex reviewer" },
  ...goalCapabilityOptions,
  { id: "file", command: "/file", group: "文件", label: "读取附件", detail: "按问题读取并处理已上传文件" },
  { id: "image", command: "/image", group: "MCP 工具", label: "生成或修改图片", detail: "调用已配置的 Negus image MCP" },
  { id: "skill", command: "/skill", group: "Skills", label: "使用 Skill", detail: "让 Codex 选择并遵循匹配的 Skill" },
  { id: "app", command: "/app", group: "Apps", label: "使用 App", detail: "让 Codex 选择当前可用连接器" },
];

const findSlash = (value: string, caret: number): SlashState | null => {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/^\s*\/([^\s/]*)$/u);
  if (!match) return null;
  const start = beforeCaret.search(/\//u);
  return start >= 0 ? { start, end: caret, query: match[1] || "" } : null;
};

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
  onReview: () => Promise<boolean>;
  goal: ThreadGoal | null;
  goalBusy: boolean;
  goalError: string;
  onStartGoal: (objective: string) => Promise<boolean>;
  onChangeGoalStatus: (status: EditableGoalStatus) => Promise<boolean>;
  onClearGoal: () => Promise<boolean>;
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
  onInterrupt, onReview, goal, goalBusy, goalError, onStartGoal, onChangeGoalStatus, onClearGoal,
  onCompactContext, onAutoCompactThresholdChange, onModelChange,
  onReasoningEffortChange,
}: ConversationComposerProps) {
  const [text, setText] = useState("");
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [activeSlash, setActiveSlash] = useState(0);
  const [collapsedSlashGroups, setCollapsedSlashGroups] = useState<Record<string, boolean>>({});
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
  const slashOptions = slash
    ? slashCommands.filter((option) => option.command.slice(1).startsWith(slash.query.toLocaleLowerCase()))
    : [];
  const visibleSlashOptions = slashOptions.filter((option) => !collapsedSlashGroups[option.group]);

  const updateSlash = (value: string, caret: number) => {
    setSlash(findSlash(value, caret));
    setActiveSlash(0);
  };

  const insertSlashCommand = (option: SlashCommandOption) => {
    if (!slash) return;
    if (option.id === "stop") {
      setSlash(null);
      void onInterrupt();
      return;
    }
    const next = slash.replaceDraft
      ? `${option.command} ${text.trim()}`
      : `${text.slice(0, slash.start)}${option.command} ${text.slice(slash.end)}`;
    const caret = slash.replaceDraft ? next.length : slash.start + option.command.length + 1;
    setText(next);
    setSlash(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  };

  const toggleSlashGroup = (group: string) => {
    setCollapsedSlashGroups((current) => ({ ...current, [group]: !current[group] }));
    setActiveSlash(0);
  };

  const openSlashMenu = () => {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? text.length;
    const hasDraft = Boolean(text.trim());
    setSlash({ start: hasDraft ? 0 : caret, end: hasDraft ? text.length : caret, query: "", replaceDraft: hasDraft });
    setActiveSlash(0);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(hasDraft ? text.length : caret, hasDraft ? text.length : caret);
    });
  };

  useEffect(() => {
    if (!editingMessage) return;
    setText(editingMessage.text);
    setSlash(null);
    draft.clear();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [draft.clear, editingMessage?.id]);

  useEffect(() => {
    if (activeSlash >= visibleSlashOptions.length) setActiveSlash(0);
  }, [activeSlash, visibleSlashOptions.length]);

  const submit = async () => {
    const disabled = inputDisabled || !hasContent;
    if (disabled || submittingRef.current) return;
    submittingRef.current = true;
    const submittedText = text;
    setText("");
    setSlash(null);
    if (!editing && !draft.attachments.length && !inheritedAttachments.length) {
      const command = submittedText.trim().toLocaleLowerCase();
      const goalMatch = /^\/goal(?:\s+([\s\S]*))?$/iu.exec(submittedText.trim());
      if (goalMatch) {
        const objective = String(goalMatch[1] || "").trim();
        if (!objective) {
          setText(submittedText);
          submittingRef.current = false;
          return;
        }
        try {
          const accepted = await onStartGoal(objective);
          if (!accepted) setText(submittedText);
        } catch {
          setText(submittedText);
        } finally {
          submittingRef.current = false;
        }
        return;
      }
      if (command === "/compact" || command === "/stop" || command === "/review") {
        try {
          const accepted = command === "/compact"
            ? await onCompactContext()
            : command === "/stop" ? await onInterrupt() : await onReview();
          if (!accepted) setText(submittedText);
        } catch {
          setText(submittedText);
        } finally {
          submittingRef.current = false;
        }
        return;
      }
    }
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
    textarea.style.height = `${textarea.scrollHeight}px`;
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
        className={styles.composer}
        aria-label="Codex 对话输入"
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          draft.addFiles(event.dataTransfer.files);
        }}
      >
        <SlashCommandMenu
          options={slashOptions}
          collapsedGroups={collapsedSlashGroups}
          activeIndex={activeSlash}
          onActiveChange={setActiveSlash}
          onToggleGroup={toggleSlashGroup}
          onSelect={insertSlashCommand}
        />
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
          onChange={(event) => {
            setText(event.target.value);
            updateSlash(event.target.value, event.target.selectionStart);
          }}
          onPaste={(event) => {
            if (!event.clipboardData.files.length) return;
            event.preventDefault();
            draft.addFiles(event.clipboardData.files);
          }}
          onClick={(event) => updateSlash(event.currentTarget.value, event.currentTarget.selectionStart)}
          onKeyDown={(event) => {
            if (slash && visibleSlashOptions.length) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                setActiveSlash((index) => (index + direction + visibleSlashOptions.length) % visibleSlashOptions.length);
                return;
              }
              if (event.key === "Enter") {
                const exactCommand = slashOptions.some((option) => option.command.slice(1).toLocaleLowerCase() === slash.query.toLocaleLowerCase());
                if (exactCommand) {
                  setSlash(null);
                } else {
                  event.preventDefault();
                  insertSlashCommand(visibleSlashOptions[activeSlash] || visibleSlashOptions[0]);
                  return;
                }
              } else if (event.key === "Tab") {
                event.preventDefault();
                insertSlashCommand(visibleSlashOptions[activeSlash] || visibleSlashOptions[0]);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setSlash(null);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className={styles.footer}>
          <div className={styles.leadingControls}>
            <AttachmentButton disabled={inputDisabled} onFiles={draft.addFiles} />
            <button
              className={styles.commandButton}
              type="button"
              aria-label="打开能力菜单"
              title="打开能力菜单"
              disabled={inputDisabled}
              onClick={openSlashMenu}
            >
              <Sparkles aria-hidden="true" />
            </button>
            <ExecutionStatus connected={connected} status={status} contextStatus={contextStatus} commentary={commentary} sendingSlow={sendingSlow} />
          </div>
          <span className={styles.spacer} />
          <div className={styles.settingsControls}>
            <GoalControl
              goal={goal}
              busy={goalBusy}
              error={goalError}
              disabled={!connected || !selected || archived}
              onStatusChange={onChangeGoalStatus}
              onClear={onClearGoal}
            />
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
