import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, ChevronDown, MessagesSquare, Send, Sparkles } from "lucide-react";
import { AttachmentButton, AttachmentPreviews } from "../../attachments/components/AttachmentDraft";
import { useAttachmentDraft } from "../../attachments/hooks/useAttachmentDraft";
import { SlashCommandMenu, type SlashCommandOption } from "../../conversations/components/SlashCommandMenu";
import { goalCapabilityOptions } from "../../goals/model/capability";
import type { GroupAgent, GroupMember } from "../model/types";
import { mentionedAgentIds } from "../model/agentMentions";
import { MentionMenu, type MentionOption } from "./MentionMenu";
import styles from "./GroupComposer.module.css";

interface MentionState { start: number; end: number; query: string }

const capabilityOptions: SlashCommandOption[] = [
  { id: "stop", command: "/stop", group: "会话", label: "停止当前任务", detail: "终止当前群聊正在运行和排队的任务" },
  ...goalCapabilityOptions,
  { id: "file", command: "/file", group: "文件", label: "读取附件", detail: "按问题读取并处理已上传文件" },
  { id: "image", command: "/image", group: "MCP 工具", label: "生成或修改图片", detail: "调用已配置的图片能力" },
  { id: "skill", command: "/skill", group: "Skills", label: "使用 Skill", detail: "选择并遵循匹配的 Skill" },
  { id: "app", command: "/app", group: "Apps", label: "使用 App", detail: "选择当前可用连接器" },
];

const findMention = (text: string, caret: number): MentionState | null => {
  const beforeCaret = text.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)@([^\s@\n]*)$/u);
  if (!match) return null;
  const atIndex = beforeCaret.lastIndexOf("@");
  return atIndex >= 0 ? { start: atIndex, end: caret, query: match[1].trim() } : null;
};

export function GroupComposer({ agents, members, disabled, error, onSend, onInterrupt }: {
  agents: GroupAgent[];
  members: GroupMember[];
  disabled: boolean;
  error: string;
  onSend: (text: string, attachmentIds?: string[]) => Promise<boolean>;
  onInterrupt: () => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const draft = useAttachmentDraft();
  const [mention, setMention] = useState<MentionState | null>(null);
  const [personnelOpen, setPersonnelOpen] = useState(false);
  const [capabilityOpen, setCapabilityOpen] = useState(false);
  const [activeMention, setActiveMention] = useState(0);
  const [activeCapability, setActiveCapability] = useState(0);
  const [collapsedCapabilityGroups, setCollapsedCapabilityGroups] = useState<Record<string, boolean>>({});
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const query = mention?.query.toLocaleLowerCase() || "";
    // Human mentions are reserved for future multi-user notifications; only Agent mentions route work today.
    const options: MentionOption[] = [
      ...agents.map((agent) => ({ id: `agent:${agent.id}`, name: agent.name, detail: agent.responsibility, kind: "agent" as const, agentId: agent.id })),
      ...members.map((member) => ({ id: `member:${member.id}`, name: member.name, detail: "在线成员", kind: "member" as const })),
    ];
    return options.filter((option) => !query || option.name.toLocaleLowerCase().includes(query)).slice(0, 8);
  }, [agents, members, mention?.query]);
  const selectedAgentIds = useMemo(() => mentionedAgentIds(text, agents), [agents, text]);
  const personnelOptions = useMemo<MentionOption[]>(() => agents
    .filter((agent) => !selectedAgentIds.includes(agent.id))
    .map((agent) => ({
      id: `agent:${agent.id}`,
      name: agent.name,
      detail: agent.responsibility,
      kind: "agent" as const,
      agentId: agent.id,
    })), [agents, selectedAgentIds]);

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
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  };

  const insertPersonnel = (option: MentionOption) => {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? text.length;
    const prefix = caret > 0 && !/\s$/u.test(text.slice(0, caret)) ? " " : "";
    const insertion = `${prefix}@${option.name} `;
    const next = `${text.slice(0, caret)}${insertion}${text.slice(caret)}`;
    const nextCaret = caret + insertion.length;
    setText(next);
    setMention(null);
    setActiveMention(0);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const insertCapability = (option: SlashCommandOption) => {
    if (option.id === "stop") {
      setCapabilityOpen(false);
      void onInterrupt();
      return;
    }
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? text.length;
    const prefix = caret > 0 && !/\s$/u.test(text.slice(0, caret)) ? " " : "";
    const insertion = `${prefix}${option.command} `;
    const next = `${text.slice(0, caret)}${insertion}${text.slice(caret)}`;
    const nextCaret = caret + insertion.length;
    setText(next);
    setCapabilityOpen(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const submit = async () => {
    if (submittingRef.current || disabled || draft.uploading || (!text.trim() && !draft.attachments.length)) return;
    submittingRef.current = true;
    try {
      const uploaded = await draft.uploadAll();
      if (await onSend(text, uploaded.map((attachment) => attachment.id))) {
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
  useEffect(() => {
    if (!personnelOpen && !capabilityOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) {
        setPersonnelOpen(false);
        setCapabilityOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPersonnelOpen(false);
        setCapabilityOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [capabilityOpen, personnelOpen]);
  return (
    <div className={styles.composerArea} ref={composerRef}>
      {error ? <div className={styles.errorText} role="alert">{error}</div> : null}
      {mention ? (
        <MentionMenu options={mentionOptions} activeIndex={activeMention} onActiveChange={setActiveMention} onSelect={insertMention} />
      ) : personnelOpen ? (
        <div className={styles.personnelMenu}>
          {/* Reserved product entry: selected Agents discuss in rounds, then the manager publishes one consolidated result. */}
          <div className={styles.discussionOption}>
            <MessagesSquare aria-hidden="true" />
            <span><strong>商讨</strong><small>员工相互讨论，最终由项目经理汇总结论</small></span>
          </div>
          <MentionMenu options={personnelOptions} activeIndex={activeMention} onActiveChange={setActiveMention} onSelect={insertPersonnel} />
        </div>
      ) : capabilityOpen ? (
        <SlashCommandMenu
          options={capabilityOptions}
          collapsedGroups={collapsedCapabilityGroups}
          activeIndex={activeCapability}
          onActiveChange={setActiveCapability}
          onToggleGroup={(group) => {
            setCollapsedCapabilityGroups((current) => ({ ...current, [group]: !current[group] }));
            setActiveCapability(0);
          }}
          onSelect={insertCapability}
        />
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
        <AttachmentPreviews
          attachments={draft.attachments}
          error={draft.error}
          uploading={draft.uploading}
          uploadSlow={draft.uploadSlow}
          onRemove={draft.removeFile}
          onCancelUpload={draft.cancelUpload}
        />
        <textarea
          ref={textareaRef}
          value={text}
          rows={2}
          placeholder="发送到项目群"
          onChange={(event) => {
            setText(event.target.value);
            setPersonnelOpen(false);
            setCapabilityOpen(false);
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
        <div className={styles.footer}>
          <div className={styles.leadingControls}>
            <AttachmentButton disabled={disabled || draft.uploading} onFiles={draft.addFiles} />
            <button
              className={styles.commandButton}
              type="button"
              aria-label="打开能力菜单"
              title="打开能力菜单"
              disabled={disabled}
              onClick={() => {
                setMention(null);
                setPersonnelOpen(false);
                setActiveCapability(0);
                setCapabilityOpen((value) => !value);
              }}
            >
              <Sparkles aria-hidden="true" />
            </button>
            <button
              className={styles.commandButton}
              type="button"
              aria-expanded={personnelOpen}
              aria-haspopup="listbox"
              aria-label="指定参与商讨的员工"
              title={selectedAgentIds.length ? `已指定 ${selectedAgentIds.length} 人` : "指定人员"}
              disabled={disabled}
              onClick={() => {
                setMention(null);
                setCapabilityOpen(false);
                setActiveMention(0);
                setPersonnelOpen((value) => !value);
              }}
            >
              <AtSign aria-hidden="true" />
            </button>
          </div>
          <span className={styles.composerSpacer} />
          <div className={styles.settingsControls}>
            {/* Reserved for group context management similar to conversation context compaction. */}
            <button className={styles.settingTrigger} type="button" disabled title="上下文功能暂未启用">
              <span>上下文 --</span>
              <ChevronDown aria-hidden="true" />
            </button>
          </div>
          <button className={styles.sendButton} type="button" title="发送" aria-label="发送" disabled={disabled || draft.uploading || (!text.trim() && !draft.attachments.length)} onClick={() => void submit()}><Send aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
}
