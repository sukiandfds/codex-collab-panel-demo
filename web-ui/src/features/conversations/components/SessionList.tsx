import { Archive, ArchiveRestore } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { SessionSummary } from "../model/types";
import type { ExecutionStatus } from "../../execution/model/types";
import { ProjectStatusBadge } from "../../project-directory/components/ProjectStatusBadge";
import type { ProjectRuntimeStatus } from "../../project-directory/model/types";
import { formatCompactTimestamp as formatUpdatedAt } from "../../../shared/format/dateTime";
import styles from "./SessionList.module.css";

interface SessionListProps {
  sessions: SessionSummary[];
  selectedId: string;
  loading: boolean;
  error: string;
  archivedView: boolean;
  archiveBusyId: string;
  onSelect: (threadId: string) => void;
  onArchive: (threadId: string) => Promise<boolean>;
  onUnarchive: (threadId: string) => Promise<boolean>;
  currentStatus?: ExecutionStatus;
  statusByThread?: Record<string, ProjectRuntimeStatus>;
}

export function SessionList({
  sessions,
  selectedId,
  loading,
  error,
  archivedView,
  archiveBusyId,
  onSelect,
  onArchive,
  onUnarchive,
  currentStatus,
  statusByThread = {},
}: SessionListProps) {
  const [revealedId, setRevealedId] = useState("");
  const swipeRef = useRef<{
    pointerId: number;
    threadId: string;
    startX: number;
    startY: number;
    horizontal: boolean;
  } | null>(null);
  const suppressClickRef = useRef("");
  const suppressClickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setRevealedId("");
    swipeRef.current = null;
    suppressClickRef.current = "";
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = null;
  }, [archivedView, selectedId]);

  useEffect(() => () => {
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
  }, []);

  useEffect(() => {
    if (!revealedId) return undefined;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-session-revealed="true"]')) return;
      setRevealedId("");
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [revealedId]);

  const startSwipe = (event: ReactPointerEvent<HTMLButtonElement>, threadId: string) => {
    if (event.pointerType !== "touch") return;
    swipeRef.current = {
      pointerId: event.pointerId,
      threadId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSwipe = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    if (!swipe.horizontal && Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) swipe.horizontal = true;
    if (swipe.horizontal) event.preventDefault();
  };

  const finishSwipe = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!swipe.horizontal) return;
    suppressClickRef.current = swipe.threadId;
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
    const suppressedThreadId = swipe.threadId;
    suppressClickTimerRef.current = window.setTimeout(() => {
      if (suppressClickRef.current === suppressedThreadId) suppressClickRef.current = "";
      suppressClickTimerRef.current = null;
    }, 250);
    const deltaX = event.clientX - swipe.startX;
    if (Math.abs(deltaX) < 24) return;
    if (deltaX < 0) setRevealedId(swipe.threadId);
    else setRevealedId((current) => current === swipe.threadId ? "" : current);
  };

  const cancelSwipe = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (swipeRef.current?.pointerId === event.pointerId) swipeRef.current = null;
  };

  const runArchiveAction = async (threadId: string) => {
    try {
      await (archivedView ? onUnarchive(threadId) : onArchive(threadId));
    } finally {
      setRevealedId((current) => current === threadId ? "" : current);
    }
  };

  return (
    <div className={styles.root}>
      {archivedView ? <h2>已归档对话</h2> : null}
      {loading ? <div className={styles.loading}><span /><span /><span /></div> : null}
      {!loading && error ? <p className={styles.error}>{error}</p> : null}
      {!loading && !sessions.length && !error ? <p className={styles.empty}>当前项目暂无可显示会话</p> : null}
      {sessions.map((session) => {
        const revealed = session.threadId === revealedId;
        const metadata = [
          session.source === "happy" ? "Happy" : "",
          formatUpdatedAt(session.updatedAt),
          session.messageCount === null ? "" : `${session.messageCount} 条`,
        ].filter(Boolean).join(" · ");
        return (
          <div
            className={`${styles.itemRow} ${session.threadId === selectedId ? styles.activeRow : ""} ${revealed ? styles.revealed : ""}`}
            data-session-revealed={revealed ? "true" : undefined}
            key={session.threadId}
          >
            <button
              className={styles.item}
              type="button"
              onPointerDown={(event) => startSwipe(event, session.threadId)}
              onPointerMove={moveSwipe}
              onPointerUp={finishSwipe}
              onPointerCancel={cancelSwipe}
              onClick={(event) => {
                if (suppressClickRef.current === session.threadId) {
                  suppressClickRef.current = "";
                  if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
                  suppressClickTimerRef.current = null;
                  event.preventDefault();
                  return;
                }
                if (revealed) {
                  setRevealedId("");
                  return;
                }
                onSelect(session.threadId);
              }}
            >
              <span className={styles.content}>
                <span className={styles.textColumn}>
                  <span className={styles.title}>{session.title}</span>
                  {metadata ? <span className={styles.meta}>{metadata}</span> : null}
                </span>
                <span className={styles.statusSlot}>
                  <ProjectStatusBadge status={statusByThread[session.threadId] || (session.threadId === currentStatus?.threadId ? currentStatus : null)} compact />
                </span>
              </span>
            </button>
            {session.archivable !== false ? (
            <button
              className={styles.itemAction}
              type="button"
              aria-label={archivedView ? `恢复 ${session.title}` : `归档 ${session.title}`}
              title={archivedView ? "恢复对话" : "归档对话"}
              disabled={archiveBusyId === session.threadId}
              onClick={() => void runArchiveAction(session.threadId)}
            >
              {archivedView ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
            </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
