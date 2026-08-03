import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { FushengUsageSnapshot } from "../model/types";
import styles from "./UsageSummaryControl.module.css";

interface UsageSummaryControlProps {
  snapshot: FushengUsageSnapshot | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

const shanghaiParts = (value: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
}).formatToParts(value).map((part) => [part.type, part.value]));

const shanghaiDateKey = (value: Date) => {
  const parts = shanghaiParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const formatUpdatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新时间未知";
  const parts = shanghaiParts(date);
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

const compactAmount = (value: number | null) => value === null ? "--" : `$${value.toFixed(2)}`;
const preciseAmount = (value: number) => `$${value.toFixed(6)}`;
const formatRatio = (value: number | null) => value === null ? "--" : `${value.toFixed(2)}×`;
const formatCount = (value: number) => new Intl.NumberFormat("en-US").format(value);

export function UsageSummaryControl({ snapshot, loading, error, onRefresh }: UsageSummaryControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentTodayAmount = snapshot?.queryDate === shanghaiDateKey(new Date())
    ? snapshot.today.amountUsd
    : null;

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const updatedAt = snapshot ? formatUpdatedAt(snapshot.updatedAt) : "未更新";
  const featuredRatio = snapshot?.featuredGroup.ratio ?? null;
  const groupEntries = Object.entries(snapshot?.groupRatios || {}).sort(([left], [right]) => left.localeCompare(right, "zh-CN"));

  const toggleDetails = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !snapshot && !loading) onRefresh();
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        className={styles.summaryButton}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="查看今日用量和分组倍率"
        onClick={toggleDetails}
      >
        <span className={styles.summaryValues}>
          <span className={styles.metric}>
            <span className={styles.metricLabel}>今日</span>
            <strong>{compactAmount(currentTodayAmount)}</strong>
          </span>
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.metric}>
            <span className={`${styles.metricLabel} ${styles.desktopGroupLabel}`}>gpt 易燃易爆炸</span>
            <span className={`${styles.metricLabel} ${styles.compactGroupLabel}`}>倍率</span>
            <strong>{formatRatio(featuredRatio)}</strong>
          </span>
        </span>
        {loading ? <span className={styles.loadingText}>更新中</span> : null}
      </button>

      {open ? (
        <section className={styles.popover} role="dialog" aria-label="浮生云算用量详情">
          <header className={styles.popoverHeader}>
            <div>
              <h2>浮生云算</h2>
              <p>{updatedAt} 更新</p>
            </div>
            <button className={styles.refreshButton} type="button" aria-label="刷新用量" title="刷新用量" disabled={loading} onClick={onRefresh}>
              <RefreshCw className={loading ? styles.spinning : ""} aria-hidden="true" />
            </button>
          </header>

          {snapshot ? (
            <>
              <dl className={styles.metrics}>
                <div><dt>今日金额</dt><dd>{snapshot.queryDate === shanghaiDateKey(new Date()) ? preciseAmount(snapshot.today.amountUsd) : "今日尚未更新"}</dd></div>
                <div><dt>今日请求</dt><dd>{snapshot.queryDate === shanghaiDateKey(new Date()) ? formatCount(snapshot.today.requests) : "--"}</dd></div>
                <div><dt>今日 Token</dt><dd>{snapshot.queryDate === shanghaiDateKey(new Date()) ? formatCount(snapshot.today.tokens) : "--"}</dd></div>
                <div><dt>账户余额</dt><dd>{preciseAmount(snapshot.account.balanceUsd)}</dd></div>
                <div><dt>历史用量</dt><dd>{preciseAmount(snapshot.account.historicalUsageUsd)}</dd></div>
                <div><dt>历史请求</dt><dd>{formatCount(snapshot.account.historicalRequests)}</dd></div>
              </dl>
              <div className={styles.groups}>
                <h3>分组倍率</h3>
                <div className={styles.featuredGroup}>
                  <span>{snapshot.featuredGroup.name}</span><strong>{formatRatio(snapshot.featuredGroup.ratio)}</strong>
                </div>
                {groupEntries.filter(([name]) => name !== snapshot.featuredGroup.name).map(([name, ratio]) => (
                  <div key={name}><span>{name}</span><strong>{formatRatio(ratio)}</strong></div>
                ))}
              </div>
            </>
          ) : <p className={styles.empty}>{loading ? "正在读取真实用量..." : "回复完成后自动更新，也可以点击右上角刷新。"}</p>}
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
