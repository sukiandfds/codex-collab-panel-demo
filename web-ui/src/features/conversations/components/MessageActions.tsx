import { useEffect, useRef, useState } from "react";
import { Check, Copy, GitBranch } from "lucide-react";
import styles from "./MessageActions.module.css";

interface MessageActionsProps {
  text: string;
  forkable: boolean;
  forking: boolean;
  onFork: () => Promise<boolean>;
}

const copyWithFallback = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("clipboard unavailable");
};

export function MessageActions({ text, forkable, forking, onFork }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  const handleCopy = async () => {
    if (!text.trim()) return;
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    try {
      await copyWithFallback(text);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 1600);
  };

  return (
    <div className={styles.actions} aria-label="消息操作">
      <button
        className={styles.button}
        type="button"
        aria-label={copyFailed ? "复制失败" : copied ? "已复制" : "复制内容"}
        title={copyFailed ? "复制失败" : copied ? "已复制" : "复制内容"}
        disabled={!text.trim()}
        onClick={() => void handleCopy()}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      {forkable ? (
        <button
          className={styles.button}
          type="button"
          aria-label="从这里继续"
          title={forking ? "正在创建分支" : "从这里继续"}
          disabled={forking}
          onClick={() => void onFork()}
        >
          <GitBranch aria-hidden="true" className={forking ? styles.spinning : undefined} />
        </button>
      ) : null}
    </div>
  );
}
