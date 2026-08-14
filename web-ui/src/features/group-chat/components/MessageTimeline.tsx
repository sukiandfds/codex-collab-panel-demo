import { Fragment, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Bot } from "lucide-react";
import { JumpToLatest } from "../../../components/JumpToLatest/JumpToLatest";
import { useReturnToBottom } from "../../../components/JumpToLatest/useReturnToBottom";
import { AttachmentDisplay } from "../../attachments/components/AttachmentDisplay";
import { ArtifactCollection } from "../../artifacts/components/ArtifactCollection";
import type { Artifact, ArtifactReviewDecision } from "../../artifacts/model/types";
import { MarkdownContent } from "../../conversations/rendering/ContentRenderer";
import type { GroupAgent, GroupMember, GroupMessage, GroupMessageHistory, GroupProfile, GroupStreamingMessage } from "../model/types";
import { formatClockTime, formatDayLabel, localDateKey } from "../../../shared/format/dateTime";
import styles from "./MessageTimeline.module.css";

export function MessageTimeline({
  active,
  roomId,
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
  history,
  historyLoading,
  historyNavigation,
  onLoadOlder,
  onLoadNewer,
  onReturnToLatest,
}: {
  active: boolean;
  roomId: string;
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
  history?: GroupMessageHistory;
  historyLoading: boolean;
  historyNavigation: { version: number; align: "top" | "bottom" };
  onLoadOlder: () => Promise<boolean>;
  onLoadNewer: () => Promise<boolean>;
  onReturnToLatest: () => Promise<boolean>;
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
  const historyPositionRef = useRef(historyNavigation.version);
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const oldestSequenceRef = useRef(messages[0]?.sequence || 0);
  const {
    visible: showReturnToBottom,
    onScroll: updateReturnToBottom,
    contentChanged,
    returnToBottom,
    reset: resetReturnToBottom,
  } = useReturnToBottom({
    active,
    isStreaming: streams.length > 0,
    localSendVersion,
    getScrollElement,
    scrollToBottom,
  });

  useLayoutEffect(() => {
    if (!active) return;
    resetReturnToBottom(true);
    scrollToBottom();
  }, [active, resetReturnToBottom, roomId, scrollToBottom]);

  useEffect(() => {
    contentChanged();
  }, [contentChanged, messages.length, streaming]);

  useLayoutEffect(() => {
    if (historyNavigation.version === historyPositionRef.current) return;
    historyPositionRef.current = historyNavigation.version;
    const root = scrollRef.current;
    if (!root) return;
    root.scrollTop = historyNavigation.align === "top" ? 0 : root.scrollHeight;
    resetReturnToBottom(historyNavigation.align === "bottom");
  }, [historyNavigation, resetReturnToBottom]);

  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    const oldestSequence = messages[0]?.sequence || 0;
    if (anchor && oldestSequence && oldestSequence < oldestSequenceRef.current) {
      const root = scrollRef.current;
      if (root) root.scrollTop = anchor.top + root.scrollHeight - anchor.height;
    }
    prependAnchorRef.current = null;
    oldestSequenceRef.current = oldestSequence;
  }, [messages]);

  const onTimelineScroll = (root: HTMLDivElement) => {
    updateReturnToBottom(root);
    if (historyLoading) return;
    if (root.scrollTop < 80 && history?.hasOlder) {
      prependAnchorRef.current = { height: root.scrollHeight, top: root.scrollTop };
      void onLoadOlder();
    }
    if (root.scrollHeight - root.scrollTop - root.clientHeight < 80 && history?.hasNewer) void onLoadNewer();
  };

  return (
    <div className={styles.timelineShell}>
      <div className={styles.timeline} ref={scrollRef} onScroll={(event) => onTimelineScroll(event.currentTarget)}>
        {history?.hasOlder ? <div className={styles.historyMarker}>继续向上加载更早消息</div> : null}
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
            {index === 0 || localDateKey(messages[index - 1].createdAt) !== localDateKey(message.createdAt)
              ? <div className={styles.dateDivider}><span>{formatDayLabel(message.createdAt)}</span></div>
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
                <div className={styles.messageMeta}><strong>{authorName}</strong><span>{pendingAgent ? "..." : formatClockTime(message.createdAt)}</span></div>
                <div className={`${styles.messageBubble} ${ownMessage ? styles.ownMessageBubble : ""}`}>
                  {message.type === "agent"
                    ? pendingAgent
                      ? <p className={styles.streamingText}>{liveStream?.text || message.text}<i className={styles.cursor} /></p>
                      : <MarkdownContent text={message.text} className={styles.markdown} />
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
        {history?.hasNewer ? <div className={styles.historyMarker}>继续向下加载更新消息</div> : null}
      </div>
      <JumpToLatest visible={showReturnToBottom} className={styles.jumpToLatest} onClick={() => void onReturnToLatest().then((moved) => { if (!moved) returnToBottom(); })} />
    </div>
  );
}
