import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { ExecutionStatus } from "../../features/execution/components/ExecutionStatus";
import type { ExecutionStatus as ExecutionStatusValue } from "../../features/execution/model/types";
import styles from "./Composer.module.css";

interface ComposerProps {
  connected: boolean;
  selected: boolean;
  sending: boolean;
  status: ExecutionStatusValue;
  onSend: (text: string) => Promise<boolean>;
}

export function Composer({ connected, selected, sending, status, onSend }: ComposerProps) {
  const [text, setText] = useState("");
  const disabled = !connected || !selected || sending || status.active;
  const submit = async () => {
    if (disabled || !text.trim()) return;
    if (await onSend(text)) setText("");
  };

  return (
    <div className={styles.positioner}>
      <div className={styles.composer} aria-label="Codex 对话输入">
        <label className={styles.srOnly} htmlFor="prompt">给 Codex 发送指令</label>
        <textarea
          id="prompt"
          rows={2}
          value={text}
          placeholder={!selected ? "请选择一个对话" : status.active ? "Codex 正在处理当前任务" : "给 Codex 发送指令"}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className={styles.footer}>
          <ExecutionStatus connected={connected} status={status} />
          <span className={styles.spacer} />
          <button
            className={styles.sendButton}
            type="button"
            aria-label="发送指令"
            title="发送指令"
            disabled={disabled || !text.trim()}
            onClick={() => void submit()}
          >
            <ArrowUp aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
