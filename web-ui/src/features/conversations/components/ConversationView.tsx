import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Clock3, LoaderCircle } from "lucide-react";
import { JumpToLatest } from "../../../components/JumpToLatest/JumpToLatest";
import { useReturnToBottom } from "../../../components/JumpToLatest/useReturnToBottom";
import { RefreshNotice } from "../../app-update/components/AppUpdateNotice";
import type { ContentSyncState, SessionDetail, SessionMessage } from "../model/types";
import { MessageActions } from "./MessageActions";
import { ContentRenderer } from "../rendering/ContentRenderer";
import { ExecutionTimeline } from "../../execution/components/ExecutionTimeline";
import type { ExecutionStatus } from "../../execution/model/types";
import type { ContextStatus } from "../../context-management/model/types";
import { formatConversationTimestamp } from "../../../shared/format/dateTime";
import styles from "./ConversationView.module.css";

const normalizedText = (value: string) => value.replace(/\s+/gu, " ").trim();

const messageListKey = (message: SessionMessage) => (
  message.role === "user" && message.submissionId
    ? `submission:${message.submissionId}`
    : message.itemId || message.id
);

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
  forkDisabled = false,
  forking = false,
  onFork,
  editable = false,
  editing = false,
  onEdit,
  retryable = false,
  retrying = false,
  onRetry,
  shareable = false,
  threadId = "",
  executionStatus,
  contextStatus,
  executionPlaceholder = false,
}: {
  message: SessionMessage;
  streaming?: boolean;
  forkable?: boolean;
  forkDisabled?: boolean;
  forking?: boolean;
  onFork: () => Promise<boolean>;
  editable?: boolean;
  editing?: boolean;
  onEdit: () => void;
  retryable?: boolean;
  retrying?: boolean;
  onRetry?: () => Promise<boolean>;
  shareable?: boolean;
  threadId?: string;
  executionStatus?: ExecutionStatus;
  contextStatus?: ContextStatus;
  executionPlaceholder?: boolean;
}) {
  const formattedTime = formatConversationTimestamp(message.createdAt);
  const reserveTimestamp = message.role === "assistant";
  return (
    <article className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}`}>
      {executionStatus && contextStatus ? (
        <ExecutionTimeline status={executionStatus} contextStatus={contextStatus} timestamp={formattedTime} />
      ) : formattedTime || reserveTimestamp ? (
        <time className={styles.timestamp} dateTime={message.createdAt} aria-hidden={!formattedTime}>
          {formattedTime || "\u00a0"}
        </time>
      ) : null}
      {!executionPlaceholder ? <div className={styles.body}>
        {streaming ? <div className={styles.streamingText}>{message.text}<i className={styles.cursor} /></div> : <ContentRenderer message={message} />}
        {message.deliveryState === "pending" ? (
          <span className={styles.deliveryState} title="正在确认指令是否已送达" aria-label="正在确认指令是否已送达">
            <Clock3 aria-hidden="true" />
          </span>
        ) : null}
      </div> : null}
      {!executionPlaceholder ? (
        <div className={styles.actionRow}>
          {!streaming ? <MessageActions
            text={message.text}
            forkable={forkable}
            forkDisabled={forkDisabled}
            forking={forking}
            onFork={onFork}
            editable={editable}
            editing={editing}
            onEdit={onEdit}
            retryable={retryable}
            retrying={retrying}
            onRetry={onRetry}
            shareable={shareable}
            threadId={threadId}
            messageId={message.id}
          /> : null}
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
  localSendVersion: number;
}

type ConversationItem =
  { id: string; message: SessionMessage; streaming: boolean; execution: boolean; executionPlaceholder?: boolean };

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
  localSendVersion,
  }: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingOlderThreadsRef = useRef(new Set<string>());
  const olderLoadTimersRef = useRef(new Map<string, number>());
  const positionedThreadIdRef = useRef("");
  const followLatestFrameRef = useRef(0);
  const messages = session?.messages || [];
  const currentSessionRef = useRef(session);
  currentSessionRef.current = session;
  const locationParams = new URLSearchParams(window.location.search);
  const agentScoped = Boolean(locationParams.get("agent"));
  const employeeScoped = Boolean(locationParams.get("employee"));
  const executionMatchesSession = executionStatus.threadId === session?.threadId;
  const completedExecution = ["completed", "failed", "interrupted", "systemError"].includes(executionStatus.phase);
  const showExecution = executionMatchesSession
    && Boolean(executionStatus.startedAt)
    && executionStatus.phase !== "idle";
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const finalMessageLoaded = executionMatchesSession && (
    messages.some((message) => finalMessageMatchesStream(message, executionStatus, streamingText))
    || (completedExecution
      && Boolean(latestAssistant)
      && Boolean(executionStatus.turnId)
      && latestAssistant?.turnId === executionStatus.turnId)
  );
  const visibleStreamingText = executionMatchesSession && !finalMessageLoaded ? streamingText : "";
  const isAnswerStreaming = Boolean(visibleStreamingText) && executionStatus.active && !completedExecution;
  const displayMessages = messages.map((message) => (
    !message.createdAt
      && completedExecution
      && finalMessageLoaded
      && message.role === "assistant"
      && message.turnId === executionStatus.turnId
      ? { ...message, createdAt: executionStatus.updatedAt || executionStatus.startedAt || undefined }
      : message
  ));
  const executionMessage = finalMessageLoaded
    ? [...displayMessages].reverse().find((message) => message.role === "assistant" && message.turnId === executionStatus.turnId)
    : undefined;
  const visibleItems: ConversationItem[] = [
    ...displayMessages.map((message) => ({
      id: `message:${messageListKey(message)}`,
      message,
      streaming: false,
      execution: showExecution && message.id === executionMessage?.id,
    })),
    ...(showExecution && executionStatus.active && !finalMessageLoaded && !visibleStreamingText ? [{
      id: "message:execution-placeholder",
      message: {
        id: "execution-placeholder",
        role: "assistant" as const,
        text: "",
        createdAt: executionStatus.startedAt || undefined,
        turnId: executionStatus.turnId || undefined,
      },
      streaming: false,
      execution: true,
      executionPlaceholder: true,
    }] : []),
    ...(visibleStreamingText ? [{
      id: `message:${executionStatus.streamingItemId || "streaming-assistant"}`,
      message: {
        id: "streaming-assistant",
        role: "assistant" as const,
        text: visibleStreamingText,
        createdAt: completedExecution
          ? executionStatus.updatedAt || executionStatus.startedAt || undefined
          : executionStatus.startedAt || undefined,
        turnId: executionStatus.turnId || undefined,
        itemId: executionStatus.streamingItemId || undefined,
      },
      streaming: executionStatus.active && !completedExecution,
      execution: showExecution,
    }] : []),
  ];
  const hasVisibleItems = visibleItems.length > 0;
  const latestFollowIndex = Math.max(0, visibleItems.length - 1);
  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => visibleItems[index]?.message.role === "user" ? 84 : 160,
    overscan: 6,
    getItemKey: (index) => visibleItems[index]?.id || index,
    anchorTo: "end",
    scrollEndThreshold: 120,
  });
  const scheduleFollowLatest = useCallback(() => {
    window.cancelAnimationFrame(followLatestFrameRef.current);
    followLatestFrameRef.current = window.requestAnimationFrame(() => {
      if (!active || !visibleItems.length) return;
      virtualizer.scrollToIndex(latestFollowIndex, { align: "end" });
    });
  }, [active, latestFollowIndex, virtualizer, visibleItems.length]);

  const getScrollElement = useCallback(() => scrollRef.current, []);
  const getTrailingContentHeight = useCallback(() => 0, []);
  const {
    visible: showReturnToBottom,
    stickToBottomRef,
    onScroll: updateReturnToBottom,
    returnToBottom,
    reset: resetReturnToBottom,
  } = useReturnToBottom({
    active,
    isStreaming: isAnswerStreaming,
    localSendVersion,
    getScrollElement,
    getTrailingContentHeight,
    scrollToBottom: scheduleFollowLatest,
  });

  useLayoutEffect(() => {
    if (!active) {
      window.cancelAnimationFrame(followLatestFrameRef.current);
      positionedThreadIdRef.current = "";
    }
  }, [active]);

  useLayoutEffect(() => {
    if (!active) return;
    if (!loading && session && scrollRef.current) {
      const threadId = session.threadId;
      if (positionedThreadIdRef.current === threadId) return;
      positionedThreadIdRef.current = threadId;
      window.cancelAnimationFrame(followLatestFrameRef.current);
      resetReturnToBottom(true);
      virtualizer.scrollToIndex(latestFollowIndex, { align: "end" });
    }
  }, [active, latestFollowIndex, loading, resetReturnToBottom, session?.threadId, virtualizer]);

  useEffect(() => {
    if (!active) return undefined;
    const root = scrollRef.current;
    if (!root || typeof ResizeObserver === "undefined") return undefined;
    let previousHeight = root.clientHeight;
    let previousViewportHeight = Math.round(window.visualViewport?.height || window.innerHeight);
    let frame = 0;
    const observer = new ResizeObserver(() => {
      const nextHeight = root.clientHeight;
      const nextViewportHeight = Math.round(window.visualViewport?.height || window.innerHeight);
      const viewportChanged = nextViewportHeight !== previousViewportHeight;
      previousViewportHeight = nextViewportHeight;
      if (nextHeight === previousHeight) return;
      previousHeight = nextHeight;
      if (!viewportChanged) return;
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
      const currentSession = currentSessionRef.current;
      const threadId = currentSession?.threadId || "";
      updateReturnToBottom(root);
      const pendingTimer = threadId ? olderLoadTimersRef.current.get(threadId) : undefined;
      if (pendingTimer !== undefined && root.scrollTop > 140) {
        window.clearTimeout(pendingTimer);
        olderLoadTimersRef.current.delete(threadId);
        loadingOlderThreadsRef.current.delete(threadId);
        return;
      }
      if (threadId && loadingOlderThreadsRef.current.has(threadId)) {
        return;
      }
      if (
        !threadId
        || root.scrollTop > 140
        || !currentSession?.hasMore
        || contentSyncState === "recovering"
      ) return;
      loadingOlderThreadsRef.current.add(threadId);
      const timer = window.setTimeout(() => {
        olderLoadTimersRef.current.delete(threadId);
        const latestSession = currentSessionRef.current;
        if (disposed || !active || latestSession?.threadId !== threadId || root.scrollTop > 140 || !latestSession?.hasMore) {
          loadingOlderThreadsRef.current.delete(threadId);
          return;
        }
        void onLoadOlder().finally(() => {
          loadingOlderThreadsRef.current.delete(threadId);
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
  }, [active, contentSyncState, onLoadOlder, session, session?.hasMore, updateReturnToBottom]);

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
                    data-message-id={item.message.id}
                  key={virtualRow.key}
                  ref={(element) => {
                    virtualizer.measureElement(element);
                  }}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <Message
                        message={item.message}
                        streaming={item.streaming}
                        forkable={item.message.role === "assistant"
                          && Boolean(item.message.turnId)
                          && !session?.archived}
                        forkDisabled={executionStatus.active}
                        forking={forkingMessageId === item.message.id}
                        onFork={() => onForkMessage(item.message)}
                        editable={item.message.role === "user"
                          && Boolean(item.message.turnId)
                          && !session?.archived}
                        editing={editingMessageId === item.message.id}
                        onEdit={() => onEditMessage(item.message)}
                        retryable={item.message.deliveryState === "pending"}
                        retrying={retryingMessageId === item.message.id}
                        onRetry={() => onRetryMessage(item.message)}
                        shareable={agentScoped
                          && !employeeScoped
                          && item.message.role === "assistant"
                          && Boolean(item.message.text?.trim())
                          && Boolean(item.message.turnId)
                          && !item.streaming
                          && !(executionStatus.active && executionStatus.turnId === item.message.turnId)
                          && !session?.archived}
                        threadId={session.threadId}
                        executionStatus={item.execution ? executionStatus : undefined}
                        contextStatus={item.execution ? contextStatus : undefined}
                        executionPlaceholder={item.executionPlaceholder}
                      />
                </div>
              );
            })}
          </div>
        ) : null}
        </section>
      </div>
      {loadingOlder ? <div className={styles.older} role="status" aria-label="正在加载更早消息"><LoaderCircle aria-hidden="true" /></div> : null}
      <JumpToLatest visible={showReturnToBottom} className={styles.jumpToLatest} onClick={returnToBottom} />
    </div>
  );
}
