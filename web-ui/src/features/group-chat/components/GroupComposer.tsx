import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Bot, MessagesSquare } from "lucide-react";
import { AttachmentButton, AttachmentPreviews } from "../../attachments/components/AttachmentDraft";
import { useAttachmentDraft } from "../../attachments/hooks/useAttachmentDraft";
import type { GroupAgent, GroupMember, GroupMode } from "../model/types";
import { MentionMenu, type MentionOption } from "./MentionMenu";
import styles from "./GroupComposer.module.css";

interface MentionState { start: number; end: number; query: string }

const findMention = (text: string, caret: number): MentionState | null => {
  const beforeCaret = text.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)@([^\s@\n]*)$/u);
  if (!match) return null;
  const atIndex = beforeCaret.lastIndexOf("@");
  return atIndex >= 0 ? { start: atIndex, end: caret, query: match[1].trim() } : null;
};

const mentionedAgentIds = (text: string, agents: GroupAgent[]) => agents
  .map((agent) => ({ id: agent.id, index: text.indexOf(`@${agent.name}`) }))
  .filter((value) => value.index >= 0)
  .sort((left, right) => left.index - right.index)
  .map((value) => value.id);

export function GroupComposer({ mode, agentId, agents, members, disabled, error, onModeChange, onAgentChange, onSend }: {
  mode: GroupMode;
  agentId: string;
  agents: GroupAgent[];
  members: GroupMember[];
  disabled: boolean;
  error: string;
  onModeChange: (mode: GroupMode) => void;
  onAgentChange: (agentId: string) => void;
  onSend: (text: string, targetAgentIds: string[], attachmentIds?: string[]) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const draft = useAttachmentDraft();
  const [mention, setMention] = useState<MentionState | null>(null);
  const [activeMention, setActiveMention] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const query = mention?.query.toLocaleLowerCase() || "";
    const options: MentionOption[] = [
      ...agents.map((agent) => ({ id: `agent:${agent.id}`, name: agent.name, detail: agent.responsibility, kind: "agent" as const, agentId: agent.id })),
      ...members.map((member) => ({ id: `member:${member.id}`, name: member.name, detail: "在线成员", kind: "member" as const })),
    ];
    return options.filter((option) => !query || option.name.toLocaleLowerCase().includes(query)).slice(0, 8);
  }, [agents, members, mention?.query]);

  const updateMention = (value: string, caret: number) => {
    setMention(findMention(value, caret));
    setActiveMention(0);
  };

  const insertMention = (option: MentionOption) => {
    if (!mention) return;
    const next = `${text.slice(0, mention.start)}@${option.name} ${text.slice(mention.end)}`;
    const caret = mention.start + option.name.length + 2;
    setText(next);
    setMention(null);
    if (option.agentId) onAgentChange(option.agentId);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  };

  const submit = async () => {
    if (submittingRef.current || disabled || draft.uploading || (!text.trim() && !draft.attachments.length)) return;
    submittingRef.current = true;
    const mentioned = mentionedAgentIds(text, agents);
    const targetAgentIds = mentioned.length ? mentioned : [mode === "discussion" ? "manager" : agentId];
    try {
      const uploaded = await draft.uploadAll();
      if (await onSend(text, targetAgentIds, uploaded.map((attachment) => attachment.id))) {
        setText("");
        setMention(null);
        draft.clear();
      }
    } catch {}
    finally { submittingRef.current = false; }
  };
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  }, [text]);
  return (
    <div className={styles.composerArea}>
      {error ? <div className={styles.errorText}>{error}</div> : null}
      {mention ? (
        <MentionMenu options={mentionOptions} activeIndex={activeMention} onActiveChange={setActiveMention} onSelect={insertMention} />
      ) : null}
      <div
        className={styles.composer}
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          draft.addFiles(event.dataTransfer.files);
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          rows={2}
          placeholder={mode === "development" ? "向选中的 Codex Agent 发送真实任务" : "发送到项目群"}
          onChange={(event) => {
            setText(event.target.value);
            updateMention(event.target.value, event.target.selectionStart);
          }}
          onPaste={(event) => {
            if (!event.clipboardData.files.length) return;
            event.preventDefault();
            draft.addFiles(event.clipboardData.files);
          }}
          onClick={(event) => updateMention(event.currentTarget.value, event.currentTarget.selectionStart)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (mention && mentionOptions.length) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                setActiveMention((index) => (index + direction + mentionOptions.length) % mentionOptions.length);
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                insertMention(mentionOptions[activeMention] || mentionOptions[0]);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setMention(null);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          disabled={disabled}
        />
        <AttachmentPreviews
          attachments={draft.attachments}
          error={draft.error}
          uploading={draft.uploading}
          uploadSlow={draft.uploadSlow}
          onRemove={draft.removeFile}
          onCancelUpload={draft.cancelUpload}
        />
        <div className={styles.composerFooter}>
          <AttachmentButton disabled={disabled || draft.uploading} onFiles={draft.addFiles} />
          <div className={styles.modeSwitch}>
            <button className={mode === "discussion" ? styles.activeMode : ""} type="button" onClick={() => onModeChange("discussion")}><MessagesSquare />商讨</button>
            <button className={mode === "development" ? styles.activeMode : ""} type="button" onClick={() => onModeChange("development")}><Bot />开发</button>
          </div>
          {mode === "development" ? (
            <select value={agentId} onChange={(event) => onAgentChange(event.target.value)} aria-label="选择执行 Agent">
              {agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}
            </select>
          ) : <span className={styles.modeHint}>项目经理 Agent</span>}
          <span className={styles.composerSpacer} />
          <button className={styles.sendButton} type="button" title="发送" aria-label="发送" disabled={disabled || draft.uploading || (!text.trim() && !draft.attachments.length)} onClick={() => void submit()}><ArrowUp /></button>
        </div>
      </div>
    </div>
  );
}
