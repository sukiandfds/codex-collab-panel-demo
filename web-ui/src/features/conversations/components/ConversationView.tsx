import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Clock3, LoaderCircle } from "lucide-react";
import { JumpToLatest } from "../../../components/JumpToLatest/JumpToLatest";
import { RefreshNotice } from "../../app-update/components/AppUpdateNotice";
import type { ContentSyncState, SessionDetail, SessionMessage } from "../model/types";
import { MessageActions } from "./MessageActions";
import { ContentRenderer } from "../rendering/ContentRenderer";
import { ExecutionTimeline } from "../../execution/components/ExecutionTimeline";
import type { ExecutionStatus } from "../../execution/model/types";
import type { ContextStatus } from "../../context-management/model/types";
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

const normalizedText = (value: string) => value.replace(/\s+/gu, " ").trim();

const finalMessageMatchesStream = (message: SessionMessage, executionStatus: ExecutionStatus, streamingText: string) => (
  message.role === "assistant"
  && Boolean(executionStatus.turnId)
  && message.turnId === executionStatus.turnId
  && (
    !executionStatus.streamingItemId
    || message.itemId === executionStatus.streamingItemId
    || (Boolean(streamingText.trim()) && normalizedText(message.text) === normalizedText(streamingText))
  )
);

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
  active?: boolean;
  session: SessionDetail | null;
  loading: boolean;
  contentSyncState: ContentSyncState;
  loadingOlder: boolean;
  error: string;
  listAvailable: boolean;
  streamingText: string;
  executionStatus: ExecutionStatus;
  contextStatus: ContextStatus;
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

type OlderAnchor = {
  id: string;
  top: number;
  firstMessageId: string;
  messageCount: number;
  scrollTop: number;
  scrollHeight: number;
  threadId: string;
};

export function ConversationView({
  active = true,
  session,
  loading,
  contentSyncState,
  loadingOlder,
  error,
  listAvailable,
  streamingText,
  executionStatus,
  contextStatus,
  onLoadOlder,
  onForkMessage,
  forkingMessageId,
  onEditMessage,
  editingMessageId,
  onRetryMessage,
  retryingMessageId,
  }: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingOlderThreadsRef = useRef(new Set<string>());
  const olderLoadTimersRef = useRef(new Map<string, number>());
  const olderAnchorRef = useRef<OlderAnchor | null>(null);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const followLatestFrameRef = useRef(0);
  const initialPositionFrameRef = useRef(0);
  const observedActiveThreadsRef = useRef(new Set<string>());
  const stickToBottomRef = useRef(true);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const messages = session?.messages || [];
  const firstMessageId = messages[0]?.id || "";
  const executionMatchesSession = executionStatus.threadId === session?.threadId;
  const completedExecution = ["completed", "failed", "interrupted", "systemError"].includes(executionStatus.phase);
  if (executionMatchesSession && executionStatus.active && executionStatus.threadId) {
    observedActiveThreadsRef.current.add(executionStatus.threadId);
  }
  const terminalExecutionWasObserved = observedActiveThreadsRef.current.has(executionStatus.threadId);
  const showExecution = executionMatchesSession && (
    executionStatus.active
    || (!completedExecution && executionStatus.activities.length > 0)
    || (completedExecution && terminalExecutionWasObserved && Boolean(executionStatus.startedAt))
  );
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const finalMessageLoaded = executionMatchesSession && (
    messages.some((message) => finalMessageMatchesStream(message, executionStatus, streamingText))
    || (completedExecution
      && Boolean(latestAssistant)
      && Boolean(executionStatus.turnId)
      && latestAssistant?.turnId === executionStatus.turnId)
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
  const visibleItemsLengthRef = useRef(visibleItems.length);
  visibleItemsLengthRef.current = visibleItems.length;
  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => visibleItems[index]?.type === "execution"
      ? 120
      : visibleItems[index]?.message.role === "user" ? 84 : 160,
    overscan: 6,
    getItemKey: (index) => visibleItems[index]?.id || index,
  });

  const rememberScrollPosition = useCallback((root = scrollRef.current, threadId = session?.threadId) => {
    if (!root || !threadId) return;
    scrollPositionsRef.current.set(threadId, root.scrollTop);
  }, [session?.threadId]);

  const captureOlderAnchor = useCallback((root: HTMLDivElement, threadId: string) => {
    const rootTop = root.getBoundingClientRect().top;
    const anchor = Array.from(root.querySelectorAll<HTMLElement>("[data-message-id]"))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .find(({ rect }) => rect.bottom > rootTop);
    if (!anchor) return;
    olderAnchorRef.current = {
      id: anchor.element.dataset.messageId || "",
      top: anchor.rect.top,
      firstMessageId,
      messageCount: messages.length,
      scrollTop: root.scrollTop,
      scrollHeight: root.scrollHeight,
      threadId,
    };
  }, [firstMessageId, messages.length]);

  const scheduleFollowLatest = useCallback(() => {
    window.cancelAnimationFrame(followLatestFrameRef.current);
    followLatestFrameRef.current = window.requestAnimationFrame(() => {
      if (!active || !stickToBottomRef.current || !visibleItems.length) return;
      virtualizer.scrollToIndex(visibleItems.length - 1, { align: "end" });
      rememberScrollPosition();
    });
  }, [active, rememberScrollPosition, virtualizer, visibleItems.length]);

  useLayoutEffect(() => {
    if (!active) window.cancelAnimationFrame(followLatestFrameRef.current);
  }, [active]);

  useLayoutEffect(() => {
    if (!active) return;
    const anchor = olderAnchorRef.current;
    const root = scrollRef.current;
    if (!anchor || !root || session?.threadId !== anchor.threadId) return;
    if (messages.length <= anchor.messageCount || firstMessageId === anchor.firstMessageId) return;

    const restoreAnchor = () => {
      const nextAnchor = Array.from(root.querySelectorAll<HTMLElement>("[data-message-id]"))
        .find((element) => element.dataset.messageId === anchor.id);
      if (nextAnchor) {
        root.scrollTop += nextAnchor.getBoundingClientRect().top - anchor.top;
      } else {
        root.scrollTop = anchor.scrollTop + Math.max(0, root.scrollHeight - anchor.scrollHeight);
      }
      rememberScrollPosition(root, anchor.threadId);
    };

    restoreAnchor();
    window.requestAnimationFrame(() => {
      if (olderAnchorRef.current !== anchor || !scrollRef.current) return;
      restoreAnchor();
      olderAnchorRef.current = null;
    });
  }, [active, firstMessageId, messages.length, rememberScrollPosition, session?.threadId, virtualizer]);

  useLayoutEffect(() => {
    if (!active) return;
    if (!loading && session && scrollRef.current) {
      const savedTop = scrollPositionsRef.current.get(session.threadId);
      const threadId = session.threadId;
      setHasNewActivity(false);
      window.cancelAnimationFrame(followLatestFrameRef.current);
      window.cancelAnimationFrame(initialPositionFrameRef.current);
      initialPositionFrameRef.current = window.requestAnimationFrame(() => {
        const root = scrollRef.current;
        if (!root) return;
        if (savedTop !== undefined) {
          virtualizer.scrollToOffset(savedTop, { align: "start" });
          stickToBottomRef.current = root.scrollHeight - root.scrollTop - root.clientHeight < 120;
          rememberScrollPosition(root, threadId);
          return;
        }
        stickToBottomRef.current = true;
        virtualizer.scrollToIndex(Math.max(0, visibleItemsLengthRef.current - 1), { align: "end" });
        rememberScrollPosition(root, threadId);
      });
    }
    return () => window.cancelAnimationFrame(initialPositionFrameRef.current);
  }, [active, loading, rememberScrollPosition, session?.threadId, virtualizer]);

  useEffect(() => {
    if (active || !session?.threadId) return;
    rememberScrollPosition();
  }, [active, rememberScrollPosition, session?.threadId]);

  useEffect(() => {
    if (!active) return;
    if (!streamingText || !visibleItems.length) return;
    if (!stickToBottomRef.current) {
      setHasNewActivity(true);
      return;
    }
    scheduleFollowLatest();
  }, [active, scheduleFollowLatest, streamingText, visibleItems.length]);

  useEffect(() => {
    if (!active) return;
    if (!executionStatus.active || !visibleItems.length) return;
    if (!stickToBottomRef.current) {
      setHasNewActivity(true);
      return;
    }
    scheduleFollowLatest();
  }, [active, executionStatus.active, executionStatus.activities.length, executionStatus.label, scheduleFollowLatest, visibleItems.length]);

  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!active) return;
    if (!lastMessageId) return;
    if (!stickToBottomRef.current) {
      setHasNewActivity(true);
      return;
    }
    scheduleFollowLatest();
  }, [active, lastMessageId, scheduleFollowLatest]);

  const scrollToLatest = useCallback(() => {
    if (!active) return;
    stickToBottomRef.current = true;
    setHasNewActivity(false);
    scheduleFollowLatest();
  }, [active, scheduleFollowLatest]);

  useEffect(() => {
    if (!active) return undefined;
    const root = scrollRef.current;
    if (!root || typeof ResizeObserver === "undefined") return undefined;
    let previousHeight = root.clientHeight;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      const nextHeight = root.clientHeight;
      if (nextHeight === previousHeight) return;
      previousHeight = nextHeight;
      if (!stickToBottomRef.current) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(scheduleFollowLatest);
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [active, scheduleFollowLatest]);

  useEffect(() => {
    if (!active) return undefined;
    const root = scrollRef.current;
    if (!root) return;
    let disposed = false;
    const onScroll = () => {
      const threadId = session?.threadId || "";
      const nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 120;
      stickToBottomRef.current = nearBottom;
      rememberScrollPosition(root);
      if (nearBottom) setHasNewActivity(false);
      const pendingTimer = threadId ? olderLoadTimersRef.current.get(threadId) : undefined;
      if (pendingTimer !== undefined && root.scrollTop > 140) {
        window.clearTimeout(pendingTimer);
        olderLoadTimersRef.current.delete(threadId);
        loadingOlderThreadsRef.current.delete(threadId);
        if (olderAnchorRef.current?.threadId === threadId) olderAnchorRef.current = null;
        return;
      }
      if (threadId && loadingOlderThreadsRef.current.has(threadId)) {
        captureOlderAnchor(root, threadId);
        return;
      }
      if (
        !threadId
        || root.scrollTop > 140
        || !session?.hasMore
        || contentSyncState === "recovering"
      ) return;
      loadingOlderThreadsRef.current.add(threadId);
      captureOlderAnchor(root, threadId);
      const timer = window.setTimeout(() => {
        olderLoadTimersRef.current.delete(threadId);
        if (disposed || !active || session?.threadId !== threadId || root.scrollTop > 140 || !session?.hasMore) {
          loadingOlderThreadsRef.current.delete(threadId);
          if (olderAnchorRef.current?.threadId === threadId) olderAnchorRef.current = null;
          return;
        }
        void onLoadOlder().finally(() => {
          loadingOlderThreadsRef.current.delete(threadId);
          if (!disposed) {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                if (olderAnchorRef.current?.threadId === threadId) olderAnchorRef.current = null;
              });
            });
          }
        });
      }, 140);
      olderLoadTimersRef.current.set(threadId, timer);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      disposed = true;
      root.removeEventListener("scroll", onScroll);
      const threadId = session?.threadId || "";
      const pending = threadId ? olderLoadTimersRef.current.get(threadId) : undefined;
      if (pending !== undefined) {
        window.clearTimeout(pending);
        olderLoadTimersRef.current.delete(threadId);
        loadingOlderThreadsRef.current.delete(threadId);
      }
    };
  }, [active, captureOlderAnchor, contentSyncState, onLoadOlder, rememberScrollPosition, session, session?.hasMore, virtualizer]);

  return (
    <div className={styles.viewport}>
      {error ? (
        <RefreshNotice
          surface="conversation"
          title="内容暂时未更新"
          detail="连接长时间没有响应，请刷新网页后重试。"
          actionLabel="刷新网页"
          onAction={() => window.location.reload()}
        />
      ) : null}
      <div className={styles.scrollArea} ref={scrollRef}>
        <section className={styles.conversation} aria-label="真实项目对话" aria-live="polite">
        {loading && !session ? <div className={styles.loading} role="status" aria-label="正在读取对话"><LoaderCircle aria-hidden="true" /></div> : null}
        {!loading && !error && !session && listAvailable ? <div className={styles.state}>当前项目暂无可显示对话</div> : null}
        {session ? (
          <div className={styles.virtualList} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = visibleItems[virtualRow.index];
              return (
                <div
                  className={styles.virtualRow}
                  data-index={virtualRow.index}
                  data-message-id={item.type === "message" ? item.message.id : undefined}
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {item.type === "execution"
                    ? <ExecutionTimeline status={executionStatus} contextStatus={contextStatus} />
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
      {loadingOlder ? <div className={styles.older} role="status" aria-label="正在加载更早消息"><LoaderCircle aria-hidden="true" /></div> : null}
      <JumpToLatest visible={hasNewActivity} className={styles.jumpToLatest} onClick={scrollToLatest} />
    </div>
  );
}
