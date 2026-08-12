import { Fragment, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot } from "lucide-react";
import { JumpToLatest } from "../../../components/JumpToLatest/JumpToLatest";
import { useReturnToBottom } from "../../../components/JumpToLatest/useReturnToBottom";
import { AttachmentDisplay } from "../../attachments/components/AttachmentDisplay";
import { ArtifactCollection } from "../../artifacts/components/ArtifactCollection";
import type { Artifact, ArtifactReviewDecision } from "../../artifacts/model/types";
import type { GroupAgent, GroupMember, GroupMessage, GroupProfile, GroupStreamingMessage } from "../model/types";
import styles from "./MessageTimeline.module.css";

const timeText = (value: string) => new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
}).format(new Date(value));
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
  currentMemberId,
  streaming,
  artifacts,
  artifactLoadErrors,
  reviewingArtifactIds,
  reviewerName,
  onRetryArtifact,
  onReviewArtifact,
  onOpenProfile,
  localSendVersion,
}: {
  messages: GroupMessage[];
  agents: GroupAgent[];
  members: GroupMember[];
  currentMemberId: string;
  streaming: Record<string, GroupStreamingMessage>;
  artifacts: Record<string, Artifact>;
  artifactLoadErrors: Record<string, boolean>;
  reviewingArtifactIds: Set<string>;
  reviewerName: string;
  onRetryArtifact: (artifactId: string) => Promise<void>;
  onReviewArtifact: (artifactId: string, decision: ArtifactReviewDecision, note: string, reviewedBy: string) => Promise<void>;
  onOpenProfile: (profile: GroupProfile) => void;
  localSendVersion: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const streams = Object.entries(streaming).filter(([, value]) => value.text);
  const messageWorkIds = new Set(messages.map((message) => message.workId).filter(Boolean));
  const orphanStreams = streams.filter(([workId]) => !messageWorkIds.has(workId));
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const scrollToBottom = useCallback(() => {
    const root = scrollRef.current;
    if (root) root.scrollTop = root.scrollHeight;
  }, []);
  const {
    visible: showReturnToBottom,
    onScroll: updateReturnToBottom,
    contentChanged,
    returnToBottom,
  } = useReturnToBottom({
    isStreaming: streams.length > 0,
    localSendVersion,
    getScrollElement,
    scrollToBottom,
  });

  useEffect(() => {
    contentChanged();
  }, [contentChanged, messages.length, streaming]);

  return (
    <div className={styles.timelineShell}>
      <div className={styles.timeline} ref={scrollRef} onScroll={(event) => {
        updateReturnToBottom(event.currentTarget);
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
          const liveStream = message.workId ? streaming[message.workId] : undefined;
          const pendingAgent = message.type === "agent" && message.pending;
          const authorName = agent?.name || message.authorName;
          const ownMessage = message.type === "human" && Boolean(currentMemberId) && message.authorId === currentMemberId;
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
                  {message.type === "agent" ? "AI" : authorName.slice(0, 1)}
                </button>
              ) : <span className={`${styles.messageAvatar} ${message.type === "agent" ? styles.agentMessageAvatar : ""}`}>{message.type === "agent" ? "AI" : message.type === "system" ? "!" : authorName.slice(0, 1)}</span>}
              <div className={styles.messageContent}>
                <div className={styles.messageMeta}><strong>{authorName}</strong><span>{pendingAgent ? "..." : timeText(message.createdAt)}</span>{message.mode === "development" ? <em>开发</em> : null}</div>
                <div className={`${styles.messageBubble} ${ownMessage ? styles.ownMessageBubble : ""}`}>
                  {message.type === "agent"
                    ? pendingAgent
                      ? <p className={styles.streamingText}>{liveStream?.text || message.text}<i className={styles.cursor} /></p>
                      : <div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div>
                    : message.text ? <p>{message.text}</p> : null}
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
              </div>
            </article>
          </Fragment>
          );
        })}
        {orphanStreams.map(([workId, value]) => {
          const agent = agents.find((item) => item.id === value.agentId);
          return (
            <article className={styles.message} key={workId}>
              {agent ? (
                <button className={`${styles.messageAvatar} ${styles.agentMessageAvatar}`} type="button" aria-label={`查看${agent.name}的个人信息`} onClick={() => onOpenProfile({ kind: "agent", profile: agent })}>AI</button>
              ) : <span className={`${styles.messageAvatar} ${styles.agentMessageAvatar}`}>AI</span>}
              <div className={styles.messageContent}>
                <div className={styles.messageMeta}><strong>{agent?.name || "Codex Agent"}</strong><span>...</span></div>
                <div className={styles.messageBubble}>
                  <p className={styles.streamingText}>{value.text}<i className={styles.cursor} /></p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <JumpToLatest visible={showReturnToBottom} className={styles.jumpToLatest} onClick={returnToBottom} />
    </div>
  );
}
