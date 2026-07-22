import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SessionDetail, SessionMessage } from "../model/types";
import { ContentRenderer } from "../rendering/ContentRenderer";
import styles from "./ConversationView.module.css";

function Message({ message }: { message: SessionMessage }) {
  return (
    <article className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}`}>
      <div className={styles.body}><ContentRenderer message={message} /></div>
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
  onLoadOlder: () => Promise<void>;
}

export function ConversationView({ session, loading, loadingOlder, error, listAvailable, streamingText, onLoadOlder }: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingOlderRef = useRef(false);
  const messages = session?.messages || [];
  const visibleMessages = streamingText
    ? [...messages, { id: "streaming-assistant", role: "assistant" as const, text: streamingText }]
    : messages;
  const virtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => visibleMessages[index]?.role === "user" ? 84 : 160,
    overscan: 6,
    getItemKey: (index) => visibleMessages[index]?.id || index,
  });

  useEffect(() => {
    if (!loading && session && scrollRef.current) {
      requestAnimationFrame(() => virtualizer.scrollToIndex(messages.length - 1, { align: "end" }));
    }
  }, [loading, session?.threadId]);

  useEffect(() => {
    if (!streamingText || !visibleMessages.length) return;
    requestAnimationFrame(() => virtualizer.scrollToIndex(visibleMessages.length - 1, { align: "end" }));
  }, [streamingText]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = async () => {
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
    <div className={styles.scrollArea} ref={scrollRef}>
      <section className={styles.conversation} aria-label="真实项目对话" aria-live="polite">
        {loading ? <div className={styles.loading}>正在读取对话…</div> : null}
        {loadingOlder ? <div className={styles.older}>正在加载更早消息…</div> : null}
        {!loading && error && !session ? <div className={styles.state}>{error}</div> : null}
        {!loading && !error && !session && listAvailable ? <div className={styles.state}>当前项目暂无可显示对话</div> : null}
        {!loading && session ? (
          <div className={styles.virtualList} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                className={styles.virtualRow}
                data-index={virtualRow.index}
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <Message message={visibleMessages[virtualRow.index]} />
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
