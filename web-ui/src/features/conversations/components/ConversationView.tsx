import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Clock3, LoaderCircle } from "lucide-react";
import { JumpToLatest } from "../../../components/JumpToLatest/JumpToLatest";
import { isNearBottom, useReturnToBottom } from "../../../components/JumpToLatest/useReturnToBottom";
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
  forkDisabled = false,
  forking = false,
  onFork,
  editable = false,
  editDisabled = false,
  editing = false,
  onEdit,
  retryable = false,
  retrying = false,
  onRetry,
  shareable = false,
  threadId = "",
}: {
  message: SessionMessage;
  streaming?: boolean;
  forkable?: boolean;
  forkDisabled?: boolean;
  forking?: boolean;
  onFork: () => Promise<boolean>;
  editable?: boolean;
  editDisabled?: boolean;
  editing?: boolean;
  onEdit: () => void;
  retryable?: boolean;
  retrying?: boolean;
  onRetry?: () => Promise<boolean>;
  shareable?: boolean;
  threadId?: string;
}) {
  const formattedTime = messageTime(message.createdAt);
  const reserveTimestamp = message.role === "assistant";
  return (
    <article className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}`}>
      {formattedTime || reserveTimestamp ? (
        <time className={styles.timestamp} dateTime={message.createdAt} aria-hidden={!formattedTime}>
          {formattedTime || "\u00a0"}
        </time>
      ) : null}
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
            forkDisabled={forkDisabled}
            forking={forking}
            onFork={onFork}
            editable={editable}
            editDisabled={editDisabled}
            editing={editing}
            onEdit={onEdit}
            retryable={retryable}
            retrying={retrying}
            onRetry={onRetry}
            shareable={shareable}
            threadId={threadId}
            messageId={message.id}
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
  localSendVersion: number;
}

type ConversationItem =
  | { id: string; type: "message"; message: SessionMessage; streaming: boolean }
  | { id: string; type: "execution" };

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
  const scrollPositionsRef = useRef(new Map<string, number>());
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
  const executionIndex = finalMessageLoaded ? Math.max(0, messages.length - 1) : messages.length;
  const displayMessages = messages.map((message) => (
    !message.createdAt
      && completedExecution
      && finalMessageLoaded
      && message.role === "assistant"
      && message.turnId === executionStatus.turnId
      ? { ...message, createdAt: executionStatus.updatedAt || executionStatus.startedAt || undefined }
      : message
  ));
  const visibleItems: ConversationItem[] = [
    ...displayMessages.slice(0, executionIndex).map((message) => ({ id: `message:${message.itemId || message.id}`, type: "message" as const, message, streaming: false })),
    ...(showExecution ? [{ id: "latest-execution", type: "execution" as const }] : []),
    ...displayMessages.slice(executionIndex).map((message) => ({ id: `message:${message.itemId || message.id}`, type: "message" as const, message, streaming: false })),
    ...(visibleStreamingText ? [{
      id: `message:${executionStatus.streamingItemId || "streaming-assistant"}`,
      type: "message" as const,
      message: {
        id: "streaming-assistant",
        role: "assistant" as const,
        text: visibleStreamingText,
        createdAt: completedExecution ? executionStatus.updatedAt || undefined : undefined,
        turnId: executionStatus.turnId || undefined,
        itemId: executionStatus.streamingItemId || undefined,
      },
      streaming: executionStatus.active && !completedExecution,
    }] : []),
  ];
  const hasVisibleItems = visibleItems.length > 0;
  const latestFollowIndex = Math.max(0, visibleItems.length - 1);
  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => visibleItems[index]?.type === "execution"
      ? 120
      : visibleItems[index]?.message.role === "user" ? 84 : 160,
    overscan: 6,
    getItemKey: (index) => visibleItems[index]?.id || index,
    anchorTo: "end",
    followOnAppend: "auto",
    scrollEndThreshold: 120,
  });
  const rememberScrollPosition = useCallback((root = scrollRef.current, threadId = currentSessionRef.current?.threadId) => {
    if (!root || !threadId) return;
    scrollPositionsRef.current.set(threadId, root.scrollTop);
  }, []);

  const scheduleFollowLatest = useCallback(() => {
    window.cancelAnimationFrame(followLatestFrameRef.current);
    followLatestFrameRef.current = window.requestAnimationFrame(() => {
      if (!active || !visibleItems.length) return;
      virtualizer.scrollToIndex(latestFollowIndex, { align: "end" });
      rememberScrollPosition();
    });
  }, [active, latestFollowIndex, rememberScrollPosition, virtualizer, visibleItems.length]);

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
      const savedTop = scrollPositionsRef.current.get(session.threadId);
      const threadId = session.threadId;
      if (positionedThreadIdRef.current === threadId) return;
      positionedThreadIdRef.current = threadId;
      resetReturnToBottom();
      window.cancelAnimationFrame(followLatestFrameRef.current);
      const root = scrollRef.current;
      if (savedTop !== undefined) {
        virtualizer.scrollToOffset(savedTop, { align: "start" });
        resetReturnToBottom(isNearBottom(root, 0));
        rememberScrollPosition(root, threadId);
      }
    }
  }, [active, loading, rememberScrollPosition, resetReturnToBottom, session?.threadId, virtualizer]);

  useEffect(() => {
    if (active || !session?.threadId) return;
    rememberScrollPosition();
  }, [active, rememberScrollPosition, session?.threadId]);

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
      rememberScrollPosition(root);
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
  }, [active, contentSyncState, onLoadOlder, rememberScrollPosition, session, session?.hasMore, updateReturnToBottom]);

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
                  ref={(element) => {
                    virtualizer.measureElement(element);
                  }}
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
                          && !session?.archived}
                        forkDisabled={executionStatus.active}
                        forking={forkingMessageId === item.message.id}
                        onFork={() => onForkMessage(item.message)}
                        editable={item.message.role === "user"
                          && Boolean(item.message.turnId)
                          && !session?.archived}
                        editDisabled={executionStatus.active}
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
      <JumpToLatest visible={showReturnToBottom} className={styles.jumpToLatest} onClick={returnToBottom} />
    </div>
  );
}
