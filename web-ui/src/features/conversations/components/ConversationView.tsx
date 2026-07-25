import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { JumpToLatest } from "../../../components/JumpToLatest/JumpToLatest";
import type { SessionDetail, SessionMessage } from "../model/types";
import { ContentRenderer } from "../rendering/ContentRenderer";
import { ExecutionTimeline } from "../../execution/components/ExecutionTimeline";
import type { ExecutionStatus } from "../../execution/model/types";
import styles from "./ConversationView.module.css";

function Message({ message, streaming = false }: { message: SessionMessage; streaming?: boolean }) {
  return (
    <article className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}`}>
      <div className={styles.body}>
        {streaming ? <div className={styles.streamingText}>{message.text}<i className={styles.cursor} /></div> : <ContentRenderer message={message} />}
      </div>
    </article>
  );
}

interface ConversationViewProps {
  session: SessionDetail | null;
  loading: boolean;
  loadingOlder: boolean;
  error: string;
  listAvailable: boolean;
  streamingText: string;
  executionStatus: ExecutionStatus;
  onLoadOlder: () => Promise<void>;
}

type ConversationItem =
  | { id: string; type: "message"; message: SessionMessage; streaming: boolean }
  | { id: string; type: "execution" };

export function ConversationView({ session, loading, loadingOlder, error, listAvailable, streamingText, executionStatus, onLoadOlder }: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingOlderRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const messages = session?.messages || [];
  const executionMatchesSession = executionStatus.threadId === session?.threadId;
  const showExecution = executionMatchesSession && (executionStatus.active || executionStatus.activities.length > 0);
  const visibleStreamingText = executionMatchesSession ? streamingText : "";
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
      message: { id: "streaming-assistant", role: "assistant" as const, text: visibleStreamingText },
      streaming: true,
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
    const onScroll = async () => {
      const nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 120;
      stickToBottomRef.current = nearBottom;
      if (nearBottom) setHasNewActivity(false);
      if (root.scrollTop > 140 || !session?.hasMore || loadingOlderRef.current) return;
      loadingOlderRef.current = true;
      const previousHeight = root.scrollHeight;
      await onLoadOlder();
      requestAnimationFrame(() => { root.scrollTop += root.scrollHeight - previousHeight; });
      loadingOlderRef.current = false;
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [onLoadOlder, session?.hasMore]);

  return (
    <div className={styles.viewport}>
      <div className={styles.scrollArea} ref={scrollRef}>
        <section className={styles.conversation} aria-label="真实项目对话" aria-live="polite">
        {loading ? <div className={styles.loading}>正在读取对话…</div> : null}
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
                    : <Message message={item.message} streaming={item.streaming} />}
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
