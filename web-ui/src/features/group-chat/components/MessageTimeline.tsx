import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot } from "lucide-react";
import { JumpToLatest } from "../../../components/JumpToLatest/JumpToLatest";
import { AttachmentDisplay } from "../../attachments/components/AttachmentDisplay";
import { ArtifactCollection } from "../../artifacts/components/ArtifactCollection";
import type { Artifact, ArtifactReviewDecision } from "../../artifacts/model/types";
import type { GroupAgent, GroupMember, GroupMessage, GroupProfile } from "../model/types";
import styles from "./MessageTimeline.module.css";

const timeText = (value: string) => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const dayKey = (value: string) => new Date(value).toLocaleDateString("zh-CN");
const dayText = (value: string) => {
  const date = new Date(value);
  if (date.toDateString() === new Date().toDateString()) return "今天";
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(date);
};

export function MessageTimeline({
  messages,
  agents,
  members,
  streaming,
  artifacts,
  artifactLoadErrors,
  reviewingArtifactIds,
  reviewerName,
  onRetryArtifact,
  onReviewArtifact,
  onOpenProfile,
}: {
  messages: GroupMessage[];
  agents: GroupAgent[];
  members: GroupMember[];
  streaming: Record<string, { itemId: string; text: string }>;
  artifacts: Record<string, Artifact>;
  artifactLoadErrors: Record<string, boolean>;
  reviewingArtifactIds: Set<string>;
  reviewerName: string;
  onRetryArtifact: (artifactId: string) => Promise<void>;
  onReviewArtifact: (artifactId: string, decision: ArtifactReviewDecision, note: string, reviewedBy: string) => Promise<void>;
  onOpenProfile: (profile: GroupProfile) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const streams = Object.entries(streaming).filter(([, value]) => value.text);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    if (stickToBottomRef.current) root.scrollTop = root.scrollHeight;
    else setHasNewActivity(true);
  }, [messages.length, streaming]);

  const scrollToLatest = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    stickToBottomRef.current = true;
    setHasNewActivity(false);
    root.scrollTop = root.scrollHeight;
  }, []);

  return (
    <div className={styles.timelineShell}>
      <div className={styles.timeline} ref={scrollRef} onScroll={(event) => {
        const root = event.currentTarget;
        const nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 120;
        stickToBottomRef.current = nearBottom;
        if (nearBottom) setHasNewActivity(false);
      }}>
        {!messages.length && !streams.length ? (
          <div className={styles.emptyRoom}><Bot /><strong>暂无消息</strong></div>
        ) : null}
        {messages.map((message, index) => {
          const agent = message.type === "agent"
            ? agents.find((item) => item.id === message.agentId || item.id === message.authorId)
            : null;
          const member = message.type === "human"
            ? members.find((item) => item.id === message.authorId)
              || { id: message.authorId, name: message.authorName, lastSeenAt: message.createdAt }
            : null;
          const profile: GroupProfile | null = agent
            ? { kind: "agent", profile: agent }
            : member ? { kind: "member", profile: member } : null;
          return (
          <Fragment key={message.id}>
            {index === 0 || dayKey(messages[index - 1].createdAt) !== dayKey(message.createdAt)
              ? <div className={styles.dateDivider}><span>{dayText(message.createdAt)}</span></div>
              : null}
            <article className={`${styles.message} ${message.type === "system" ? styles.systemMessage : ""}`}>
              {profile ? (
                <button
                  className={`${styles.messageAvatar} ${message.type === "agent" ? styles.agentMessageAvatar : ""}`}
                  type="button"
                  aria-label={`查看${profile.profile.name}的个人信息`}
                  onClick={() => onOpenProfile(profile)}
                >
                  {message.type === "agent" ? "AI" : message.authorName.slice(0, 1)}
                </button>
              ) : <span className={`${styles.messageAvatar} ${message.type === "agent" ? styles.agentMessageAvatar : ""}`}>{message.type === "agent" ? "AI" : message.type === "system" ? "!" : message.authorName.slice(0, 1)}</span>}
              <div className={styles.messageContent}>
                <div className={styles.messageMeta}><strong>{message.authorName}</strong><span>{timeText(message.createdAt)}</span>{message.mode === "development" ? <em>开发</em> : null}</div>
                {message.type === "agent" ? <div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div> : message.text ? <p>{message.text}</p> : null}
                <AttachmentDisplay files={message.attachments || []} />
                <ArtifactCollection
                  artifactIds={message.artifactIds || []}
                  artifacts={artifacts}
                  loadErrors={artifactLoadErrors}
                  reviewingIds={reviewingArtifactIds}
                  reviewerName={reviewerName}
                  onRetry={onRetryArtifact}
                  onReview={onReviewArtifact}
                />
              </div>
            </article>
          </Fragment>
          );
        })}
        {streams.map(([agentId, value]) => {
          const agent = agents.find((item) => item.id === agentId);
          return (
            <article className={styles.message} key={`${agentId}-${value.itemId}`}>
              {agent ? (
                <button className={`${styles.messageAvatar} ${styles.agentMessageAvatar}`} type="button" aria-label={`查看${agent.name}的个人信息`} onClick={() => onOpenProfile({ kind: "agent", profile: agent })}>AI</button>
              ) : <span className={`${styles.messageAvatar} ${styles.agentMessageAvatar}`}>AI</span>}
              <div className={styles.messageContent}>
                <div className={styles.messageMeta}><strong>{agent?.name || "Codex Agent"}</strong><span>正在回复</span></div>
                <p className={styles.streamingText}>{value.text}<i className={styles.cursor} /></p>
              </div>
            </article>
          );
        })}
      </div>
      <JumpToLatest visible={hasNewActivity} className={styles.jumpToLatest} onClick={scrollToLatest} />
    </div>
  );
}
