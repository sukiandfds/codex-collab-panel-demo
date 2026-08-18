import { Activity, ChevronDown, MessageSquare, MessagesSquare, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../../shared/api/http";
import styles from "./ProjectStatusControl.module.css";

interface ProjectEvent {
  id: string;
  dayKey: string;
  title: string;
  summary: string;
  startMessageId: string;
  startAt: string;
  updatedAt: string;
  projectItem?: { id: string; title: string };
}

interface StatusConversation {
  id: string;
  kind: "conversation" | "group";
  label: string;
  latestAt: string;
  events: ProjectEvent[];
}

interface ProjectStatus {
  project: { id: string; name: string };
  dayKey: string;
  todayProgress: string[];
  progressDay: string | null;
  progressUpdatedAt: string | null;
  conversations: StatusConversation[];
}

interface ProjectStatusControlProps {
  projectId?: string;
  projectRoot?: string;
  currentSourceId?: string;
}

const cachePrefix = "negus:project-status:v2:";
const expandedPrefix = "negus:project-status:expanded:";
const validStatus = (value: unknown): value is ProjectStatus => Boolean(
  value
  && typeof value === "object"
  && Array.isArray((value as ProjectStatus).todayProgress)
  && Array.isArray((value as ProjectStatus).conversations),
);
const readCache = (key: string) => {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(`${cachePrefix}${key}`) || "null");
    return validStatus(value) ? value : null;
  } catch {
    return null;
  }
};
const writeCache = (key: string, value: ProjectStatus) => {
  try { window.localStorage.setItem(`${cachePrefix}${key}`, JSON.stringify(value)); } catch {}
};
const readExpanded = (key: string): string[] | null => {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(`${expandedPrefix}${key}`) || "null");
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
  } catch {
    return null;
  }
};
const writeExpanded = (key: string, value: string[]) => {
  try { window.localStorage.setItem(`${expandedPrefix}${key}`, JSON.stringify(value)); } catch {}
};

const formatTimestamp = (value: string | null, includeSeconds = false) => {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "暂无时间";
  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const timePart = [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    ...(includeSeconds ? [String(date.getSeconds()).padStart(2, "0")] : []),
  ].join(":");
  return `${datePart} ${timePart}`;
};

const formatRange = (startAt: string, updatedAt: string) => {
  const start = formatTimestamp(startAt);
  const end = formatTimestamp(updatedAt);
  return start === end ? start : `${start} - ${end}`;
};

const addCalendarDays = (date: string, amount: number) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
};

const removeConversation = (status: ProjectStatus, sourceId: string): ProjectStatus => {
  const conversations = status.conversations.filter((conversation) => conversation.id !== sourceId);
  if (conversations.length === status.conversations.length) return status;
  const currentEvents = conversations.flatMap((conversation) => conversation.events)
    .filter((event) => event.dayKey === status.dayKey)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const previousDay = addCalendarDays(status.dayKey, -1);
  const fallbackEvents = conversations.flatMap((conversation) => conversation.events)
    .filter((event) => event.dayKey === previousDay)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const selected = currentEvents.length ? currentEvents : fallbackEvents.slice(0, 1);
  return {
    ...status,
    conversations,
    todayProgress: [...new Set(selected.map((event) => event.title).filter(Boolean))].slice(0, 6),
    progressDay: selected[0]?.dayKey || null,
    progressUpdatedAt: selected[0]?.updatedAt || null,
  };
};

export function ProjectStatusControl({
  projectId = "",
  projectRoot = "",
  currentSourceId = "",
}: ProjectStatusControlProps) {
  const identityKey = projectId || projectRoot;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProjectStatus | null>(() => readCache(identityKey));
  const [expandedIds, setExpandedIds] = useState<string[] | null>(() => readExpanded(identityKey));
  const controlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatus(readCache(identityKey));
    setExpandedIds(readExpanded(identityKey));
  }, [identityKey]);

  useEffect(() => {
    const onArchived = (event: Event) => {
      const threadId = (event as CustomEvent<{ threadId?: string }>).detail?.threadId;
      if (!threadId) return;
      setStatus((current) => {
        if (!current) return current;
        const next = removeConversation(current, `conversation:${threadId}`);
        if (next !== current) writeCache(identityKey, next);
        return next;
      });
    };
    window.addEventListener("negus:conversation-archived", onArchived);
    return () => window.removeEventListener("negus:conversation-archived", onArchived);
  }, [identityKey]);

  useEffect(() => {
    if (!open || !identityKey) return undefined;
    let active = true;
    const controller = new AbortController();
    const load = () => {
      const query = new URLSearchParams(projectId ? { projectId } : { projectRoot });
      void fetchJson<ProjectStatus>(`/api/project-status?${query}`, controller.signal)
        .then((next) => {
          if (!active || !validStatus(next)) return;
          setStatus(next);
          writeCache(identityKey, next);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 2500);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [identityKey, open, projectId, projectRoot]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const conversations = useMemo(() => [...(status?.conversations || [])]
    .sort((left, right) => {
      if (left.id === currentSourceId) return -1;
      if (right.id === currentSourceId) return 1;
      return right.latestAt.localeCompare(left.latestAt);
    })
    .slice(0, 3), [currentSourceId, status?.conversations]);

  const isExpanded = (sourceId: string) => expandedIds === null
    ? sourceId === currentSourceId
    : expandedIds.includes(sourceId);

  const toggleExpanded = (sourceId: string) => {
    setExpandedIds((stored) => {
      const current = stored ?? (currentSourceId ? [currentSourceId] : []);
      const next = current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId];
      writeExpanded(identityKey, next);
      return next;
    });
  };

  const locateMessage = (messageId: string) => {
    if (!messageId || typeof CSS === "undefined" || !CSS.escape) return;
    const target = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!target) return;
    setOpen(false);
    window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const usingPreviousDay = Boolean(status?.progressDay && status.progressDay !== status.dayKey);

  return (
    <div className={styles.control} ref={controlRef}>
      <button
        className={open ? styles.activeButton : ""}
        type="button"
        title="项目状态"
        aria-label="项目状态"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Activity aria-hidden="true" /><span>状态</span>
      </button>
      {open ? (
        <aside className={styles.panel} aria-label="项目状态">
          <header className={styles.header}>
            <div>
              <strong>{status?.project.name || "项目状态"}</strong>
              <span>项目日 04:00 更新</span>
            </div>
            <button className={styles.closeButton} type="button" title="关闭" aria-label="关闭项目状态" onClick={() => setOpen(false)}>
              <X aria-hidden="true" />
            </button>
          </header>
          <div className={styles.body}>
            <section className={styles.progress}>
              <h2>今日进度</h2>
              {status?.todayProgress.length ? (
                <ul>{status.todayProgress.map((item) => <li key={item}>{item}</li>)}</ul>
              ) : <p className={styles.empty}>暂无最新内容</p>}
              {status?.progressUpdatedAt ? (
                <time dateTime={status.progressUpdatedAt}>
                  {usingPreviousDay ? "沿用最近内容" : "最后更新"} · {formatTimestamp(status.progressUpdatedAt, true)}
                </time>
              ) : null}
            </section>
            <section className={styles.conversations}>
              <h2>最近会话</h2>
              {conversations.length ? conversations.map((conversation) => {
                const expanded = isExpanded(conversation.id);
                const SourceIcon = conversation.kind === "group" ? MessagesSquare : MessageSquare;
                return (
                  <section className={styles.conversation} key={conversation.id}>
                    <button
                      className={styles.conversationHeader}
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggleExpanded(conversation.id)}
                    >
                      <SourceIcon aria-hidden="true" />
                      <span>{conversation.label}</span>
                      <time dateTime={conversation.latestAt}>{formatTimestamp(conversation.latestAt)}</time>
                      <ChevronDown className={expanded ? styles.expandedChevron : ""} aria-hidden="true" />
                    </button>
                    {expanded ? (
                      <div className={styles.events}>
                        {conversation.events.slice().reverse().map((event) => {
                          const content = (
                            <>
                              <div className={styles.eventHeading}>
                                <strong>{event.title}</strong>
                                <time dateTime={event.updatedAt}>{formatRange(event.startAt, event.updatedAt)}</time>
                              </div>
                              <p>{event.summary}</p>
                              {event.projectItem ? <span className={styles.projectItem}>{event.projectItem.id} · {event.projectItem.title}</span> : null}
                            </>
                          );
                          return conversation.id === currentSourceId && event.startMessageId ? (
                            <button className={styles.event} type="button" key={event.id} title="定位到这条指令" onClick={() => locateMessage(event.startMessageId)}>
                              {content}
                            </button>
                          ) : <article className={styles.event} key={event.id}>{content}</article>;
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              }) : <p className={styles.empty}>暂无最新内容</p>}
            </section>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
