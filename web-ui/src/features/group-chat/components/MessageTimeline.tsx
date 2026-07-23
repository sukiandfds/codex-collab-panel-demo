import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot } from "lucide-react";
import type { GroupAgent, GroupMessage } from "../model/types";
import styles from "../GroupChat.module.css";

const timeText = (value: string) => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export function MessageTimeline({ messages, agents, streaming }: {
  messages: GroupMessage[];
  agents: GroupAgent[];
  streaming: Record<string, { itemId: string; text: string }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const streams = Object.entries(streaming).filter(([, value]) => value.text);
  useEffect(() => {
    const root = scrollRef.current;
    if (root) root.scrollTop = root.scrollHeight;
  }, [messages.length, streams.map(([, value]) => value.text).join("")]);

  return (
    <div className={styles.timeline} ref={scrollRef}>
      {!messages.length && !streams.length ? (
        <div className={styles.emptyRoom}><Bot /><strong>暂无消息</strong></div>
      ) : null}
      {messages.map((message) => (
        <article className={`${styles.message} ${message.type === "system" ? styles.systemMessage : ""}`} key={message.id}>
          <span className={`${styles.messageAvatar} ${message.type === "agent" ? styles.agentMessageAvatar : ""}`}>{message.type === "agent" ? "AI" : message.type === "system" ? "!" : message.authorName.slice(0, 1)}</span>
          <div className={styles.messageContent}>
            <div className={styles.messageMeta}><strong>{message.authorName}</strong><span>{timeText(message.createdAt)}</span>{message.mode === "development" ? <em>开发</em> : null}</div>
            {message.type === "agent" ? <div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div> : <p>{message.text}</p>}
          </div>
        </article>
      ))}
      {streams.map(([agentId, value]) => {
        const agent = agents.find((item) => item.id === agentId);
        return (
          <article className={styles.message} key={`${agentId}-${value.itemId}`}>
            <span className={`${styles.messageAvatar} ${styles.agentMessageAvatar}`}>AI</span>
            <div className={styles.messageContent}>
              <div className={styles.messageMeta}><strong>{agent?.name || "Codex Agent"}</strong><span>正在回复</span></div>
              <div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{value.text}</ReactMarkdown><i className={styles.cursor} /></div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
