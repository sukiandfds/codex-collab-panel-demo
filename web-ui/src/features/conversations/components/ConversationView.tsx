import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Clock3 } from "lucide-react";
import { JumpToLatest } from "../../../components/JumpToLatest/JumpToLatest";
import type { ContentSyncState, SessionDetail, SessionMessage } from "../model/types";
import { MessageActions } from "./MessageActions";
import { ContentRenderer } from "../rendering/ContentRenderer";
import { ExecutionTimeline } from "../../execution/components/ExecutionTimeline";
import type { ExecutionStatus } from "../../execution/model/types";
import styles from "./ConversationView.module.css";

const padTimePart = (value: number) => String(value).padStart(2, "0");

const messageTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const monthDayTime = `${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())} ${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}`;
  return date.getFullYear() === new Date().getFullYear()
    ? monthDayTime
    : `${date.getFullYear()}-${monthDayTime}`;
};

const finalMessageMatchesStream = (message: SessionMessage, executionStatus: ExecutionStatus) => (
  message.role === "assistant"
  && Boolean(executionStatus.turnId)
  && message.turnId === executionStatus.turnId
  && (!executionStatus.streamingItemId || message.itemId === executionStatus.streamingItemId)
);

const waitForLayoutToSettle = (root: HTMLDivElement, measure: () => void) => new Promise<void>((resolve) => {
  const deadline = performance.now() + 400;
  let previousHeight = root.scrollHeight;
  let stableFrames = 0;

  const check = () => {
    measure();
    const nextHeight = root.scrollHeight;
    stableFrames = nextHeight === previousHeight ? stableFrames + 1 : 0;
    previousHeight = nextHeight;
    if (stableFrames >= 2 || performance.now() >= deadline) {
      resolve();
      return;
    }
    requestAnimationFrame(check);
  };

  requestAnimationFrame(check);
});

function Message({
  message,
  streaming = false,
  forkable = false,
  forking = false,
  onFork,
  editable = false,
  editing = false,
  onEdit,
  retryable = false,
  retrying = false,
  onRetry,
}: {
  message: SessionMessage;
  streaming?: boolean;
  forkable?: boolean;
  forking?: boolean;
  onFork: () => Promise<boolean>;
  editable?: boolean;
  editing?: boolean;
  onEdit: () => void;
  retryable?: boolean;
  retrying?: boolean;
  onRetry?: () => Promise<boolean>;
}) {
  const formattedTime = messageTime(message.createdAt);
  return (
    <article className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}`}>
      {formattedTime ? <time className={styles.timestamp} dateTime={message.createdAt}>{formattedTime}</time> : null}
      <div className={styles.body}>
        {streaming ? <div className={styles.streamingText}>{message.text}<i className={styles.cursor} /></div> : <ContentRenderer message={message} />}
        {message.deliveryState === "pending" ? (
          <span className={styles.deliveryState} title="正在确认指令是否已送达" aria-label="正在确认指令是否已送达">
            <Clock3 aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {!streaming ? (
        <div className={styles.actionRow}>
          <MessageActions
            text={message.text}
            forkable={forkable}
            forking={forking}
            onFork={onFork}
            editable={editable}
            editing={editing}
            onEdit={onEdit}
            retryable={retryable}
            retrying={retrying}
            onRetry={onRetry}
          />
        </div>
      ) : null}
    </article>
  );
}

interface ConversationViewProps {
  session: SessionDetail | null;
  loading: boolean;
  contentSyncState: ContentSyncState;
  loadingOlder: boolean;
  error: string;
  listAvailable: boolean;
  streamingText: string;
  executionStatus: ExecutionStatus;
  onLoadOlder: () => Promise<void>;
  onForkMessage: (message: SessionMessage) => Promise<boolean>;
  forkingMessageId: string;
  onEditMessage: (message: SessionMessage) => void;
  editingMessageId: string;
  onRetryMessage: (message: SessionMessage) => Promise<boolean>;
  retryingMessageId: string;
}

type ConversationItem =
  | { id: string; type: "message"; message: SessionMessage; streaming: boolean }
  | { id: string; type: "execution" };

export function ConversationView({
  session,
  loading,
  contentSyncState,
  loadingOlder,
  error,
  listAvailable,
  streamingText,
  executionStatus,
  onLoadOlder,
  onForkMessage,
  forkingMessageId,
  onEditMessage,
  editingMessageId,
  onRetryMessage,
  retryingMessageId,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingOlderRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const messages = session?.messages || [];
  const executionMatchesSession = executionStatus.threadId === session?.threadId;
  const completedExecution = ["completed", "failed", "interrupted", "systemError"].includes(executionStatus.phase);
  const showExecution = executionMatchesSession && (
    executionStatus.active
    || executionStatus.activities.length > 0
    || (completedExecution && Boolean(executionStatus.startedAt))
  );
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const finalMessageLoaded = executionMatchesSession && (
    messages.some((message) => finalMessageMatchesStream(message, executionStatus))
    || (completedExecution
      && Boolean(latestAssistant)
      && Boolean(executionStatus.turnId)
      && latestAssistant?.turnId === executionStatus.turnId
      && (!executionStatus.streamingItemId || latestAssistant.itemId === executionStatus.streamingItemId))
  );
  const visibleStreamingText = executionMatchesSession && !finalMessageLoaded ? streamingText : "";
  const executionIndex = !executionStatus.active && messages.at(-1)?.role === "assistant"
    ? messages.length - 1
    : messages.length;
  const visibleItems: ConversationItem[] = [
    ...messages.slice(0, executionIndex).map((message) => ({ id: message.id, type: "message" as const, message, streaming: false })),
    ...(showExecution ? [{ id: "latest-execution", type: "execution" as const }] : []),
    ...messages.slice(executionIndex).map((message) => ({ id: message.id, type: "message" as const, message, streaming: false })),
    ...(visibleStreamingText ? [{
      id: "streaming-assistant",
      type: "message" as const,
      message: {
        id: "streaming-assistant",
        role: "assistant" as const,
        text: visibleStreamingText,
        createdAt: executionStatus.startedAt || undefined,
        turnId: executionStatus.turnId || undefined,
        itemId: executionStatus.streamingItemId || undefined,
      },
      streaming: executionStatus.active && !completedExecution,
    }] : []),
  ];
  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => visibleItems[index]?.type === "execution"
      ? 120
      : visibleItems[index]?.message.role === "user" ? 84 : 160,
    overscan: 6,
    getItemKey: (index) => visibleItems[index]?.id || index,
  });

  useEffect(() => {
    if (!loading && session && scrollRef.current) {
      stickToBottomRef.current = true;
      setHasNewActivity(false);
      requestAnimationFrame(() => virtualizer.scrollToIndex(visibleItems.length - 1, { align: "end" }));
    }
  }, [loading, session?.threadId]);

  useEffect(() => {
    if (!streamingText || !visibleItems.length) return;
    if (!stickToBottomRef.current) {
      setHasNewActivity(true);
      return;
    }
    requestAnimationFrame(() => virtualizer.scrollToIndex(visibleItems.length - 1, { align: "end" }));
  }, [streamingText]);

  useEffect(() => {
    if (!executionStatus.active || !visibleItems.length) return;
    if (!stickToBottomRef.current) {
      setHasNewActivity(true);
      return;
    }
    requestAnimationFrame(() => virtualizer.scrollToIndex(visibleItems.length - 1, { align: "end" }));
  }, [executionStatus.active, executionStatus.activities.length, executionStatus.label]);

  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!lastMessageId) return;
    if (!stickToBottomRef.current) {
      setHasNewActivity(true);
      return;
    }
    requestAnimationFrame(() => virtualizer.scrollToIndex(visibleItems.length - 1, { align: "end" }));
  }, [lastMessageId, messages.length]);

  const scrollToLatest = useCallback(() => {
    stickToBottomRef.current = true;
    setHasNewActivity(false);
    virtualizer.scrollToIndex(Math.max(0, visibleItems.length - 1), { align: "end" });
  }, [virtualizer, visibleItems.length]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let disposed = false;
    const onScroll = async () => {
      const nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 120;
      stickToBottomRef.current = nearBottom;
      if (nearBottom) setHasNewActivity(false);
      if (root.scrollTop > 140 || !session?.hasMore || loadingOlderRef.current || contentSyncState === "recovering") return;
      loadingOlderRef.current = true;
      const previousHeight = root.scrollHeight;
      const previousScrollTop = root.scrollTop;
      try {
        await onLoadOlder();
        await waitForLayoutToSettle(root, () => virtualizer.measure());
        if (!disposed) root.scrollTop = previousScrollTop + root.scrollHeight - previousHeight;
      } finally {
        loadingOlderRef.current = false;
      }
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      disposed = true;
      root.removeEventListener("scroll", onScroll);
    };
  }, [contentSyncState, onLoadOlder, session?.hasMore, virtualizer]);

  return (
    <div className={styles.viewport}>
      <div className={styles.scrollArea} ref={scrollRef}>
        <section className={styles.conversation} aria-label="真实项目对话" aria-live="polite">
        {loading ? <div className={styles.loading}>正在读取对话…</div> : null}
        {!loading && session && (error || contentSyncState === "syncing" || contentSyncState === "recovering" || contentSyncState === "degraded") ? (
          <div className={styles.older}>{error || (contentSyncState === "recovering"
            ? "正在恢复最新内容…"
            : contentSyncState === "degraded"
              ? "当前显示上次稳定内容，最新内容暂未确认"
              : "正在同步最新内容…")}</div>
        ) : null}
        {loadingOlder ? <div className={styles.older}>正在加载更早消息…</div> : null}
        {!loading && error && !session ? <div className={styles.state}>{error}</div> : null}
        {!loading && !error && !session && listAvailable ? <div className={styles.state}>当前项目暂无可显示对话</div> : null}
        {!loading && session ? (
          <div className={styles.virtualList} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = visibleItems[virtualRow.index];
              return (
                <div
                  className={styles.virtualRow}
                  data-index={virtualRow.index}
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {item.type === "execution"
                    ? <ExecutionTimeline status={executionStatus} />
                    : (
                      <Message
                        message={item.message}
                        streaming={item.streaming}
                        forkable={item.message.role === "assistant"
                          && Boolean(item.message.turnId)
                          && !executionStatus.active
                          && !session?.archived}
                        forking={forkingMessageId === item.message.id}
                        onFork={() => onForkMessage(item.message)}
                        editable={item.message.role === "user"
                          && Boolean(item.message.turnId)
                          && !executionStatus.active
                          && !session?.archived}
                        editing={editingMessageId === item.message.id}
                        onEdit={() => onEditMessage(item.message)}
                        retryable={item.message.deliveryState === "pending"}
                        retrying={retryingMessageId === item.message.id}
                        onRetry={() => onRetryMessage(item.message)}
                      />
                    )}
                </div>
              );
            })}
          </div>
        ) : null}
        </section>
      </div>
      <JumpToLatest visible={hasNewActivity} className={styles.jumpToLatest} onClick={scrollToLatest} />
    </div>
  );
}
