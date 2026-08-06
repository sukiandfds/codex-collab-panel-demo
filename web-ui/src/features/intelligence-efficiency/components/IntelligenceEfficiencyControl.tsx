import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Radar, RefreshCw, RotateCcw, X } from "lucide-react";
import { readIntelligenceEfficiency } from "../data/intelligenceEfficiencyApi";
import type { IntelligenceEfficiencyPoint, IntelligenceEfficiencySnapshot } from "../model/types";
import styles from "./IntelligenceEfficiencyControl.module.css";

let cachedSnapshot: IntelligenceEfficiencySnapshot | null = null;
const FILTER_STORAGE_KEY = "negus:intelligence-efficiency-models";
const COMMON_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"];
const MODEL_LABELS: Record<string, string> = {
  "gpt-5.6-sol": "Sol",
  "gpt-5.6-terra": "Terra",
  "gpt-5.6-luna": "Luna",
  "gpt-5.5": "5.5",
  "deepseek-v4-flash": "DeepSeek V4 Flash",
};
const MODEL_TONES: Record<string, string> = {
  "gpt-5.6-sol": "sol",
  "gpt-5.6-terra": "terra",
  "gpt-5.6-luna": "luna",
  "gpt-5.5": "fiveFive",
  "deepseek-v4-flash": "deepseek",
};
type SortKey = "iq" | "average_minutes" | "average_price_usd";

const readStoredModels = () => {
  try {
    const value = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || "null");
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : COMMON_MODELS;
  } catch {
    return COMMON_MODELS;
  }
};

const formatUpdatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新时间未知";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
};

const modelLabel = (model: string) => MODEL_LABELS[model] || model;
const filterLabel = (model: string) => model === "deepseek-v4-flash" ? "DeepSeek" : modelLabel(model);

const sortedPoints = (points: IntelligenceEfficiencyPoint[], sortKey: SortKey, direction: "asc" | "desc") => {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...points].sort((left, right) => (left[sortKey] - right[sortKey]) * multiplier);
};

export function IntelligenceEfficiencyControl() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<IntelligenceEfficiencySnapshot | null>(cachedSnapshot);
  const [selectedModels, setSelectedModels] = useState<string[]>(readStoredModels);
  const [sortKey, setSortKey] = useState<SortKey>("iq");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const availableModels = useMemo(() => snapshot ? [...new Set(snapshot.points.map((point) => point.model))] : [], [snapshot]);
  const visibleModels = availableModels.filter((model) => selectedModels.includes(model));
  const allSelected = availableModels.length > 0 && visibleModels.length === availableModels.length;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  const load = async (force = false) => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const next = await readIntelligenceEfficiency(force);
      cachedSnapshot = next;
      setSnapshot(next);
    } catch {
      setError("智力效率数据暂时无法读取");
    } finally {
      setLoading(false);
    }
  };

  const persistModels = (models: string[]) => {
    setSelectedModels(models);
    try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(models)); } catch { /* private mode may block storage */ }
  };
  const reset = () => {
    persistModels(availableModels.filter((model) => COMMON_MODELS.includes(model)));
    setSortKey("iq");
    setDirection("desc");
  };
  const toggleModel = (model: string) => {
    persistModels(selectedModels.includes(model) ? selectedModels.filter((item) => item !== model) : [...selectedModels, model]);
  };
  const showAll = () => persistModels(availableModels);
  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !snapshot && !loading) void load();
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button className={styles.trigger} type="button" aria-label="查看智力效率" title="智力效率" aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
        <Radar aria-hidden="true" />
      </button>
      {open ? (
        <section className={styles.popover} role="dialog" aria-label="智力效率">
          <header className={styles.header}>
            <div><h2>智力效率</h2><p>{snapshot ? `${formatUpdatedAt(snapshot.source_updated_at)} 更新` : "Codex Radar 社区众测数据"}</p></div>
            <div className={styles.headerActions}>
              <button className={styles.actionButton} type="button" aria-label="刷新智力效率" title="刷新" disabled={loading} onClick={() => void load(true)}><RefreshCw className={loading ? styles.spinning : ""} aria-hidden="true" /></button>
              <button className={styles.closeButton} type="button" aria-label="关闭" title="关闭" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
            </div>
          </header>
          {snapshot ? (
            <>
              <div className={styles.controls}>
                <div className={styles.filterRow}>
                  <span className={styles.controlLabel}>模型</span>
                  <button className={`${styles.filterButton} ${allSelected ? styles.active : ""}`} type="button" aria-pressed={allSelected} onClick={showAll}>全部</button>
                  {availableModels.map((model) => <button key={model} className={`${styles.filterButton} ${selectedModels.includes(model) ? styles.active : ""}`} type="button" aria-pressed={selectedModels.includes(model)} onClick={() => toggleModel(model)}>{filterLabel(model)}</button>)}
                </div>
                <div className={styles.sortRow}>
                  <label className={styles.sortLabel} htmlFor="intelligence-efficiency-sort">排序</label>
                  <select id="intelligence-efficiency-sort" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}><option value="iq">IQ</option><option value="average_minutes">用时</option><option value="average_price_usd">成本</option></select>
                  <button className={styles.actionButton} type="button" aria-label={direction === "desc" ? "降序" : "升序"} title={direction === "desc" ? "降序" : "升序"} onClick={() => setDirection((value) => value === "desc" ? "asc" : "desc")}>{direction === "desc" ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}</button>
                  <button className={styles.textButton} type="button" onClick={reset}><RotateCcw aria-hidden="true" />重置</button>
                </div>
              </div>
              <div className={styles.cardViewport}>
                {visibleModels.length ? visibleModels.map((model) => (
                  <section className={`${styles.modelGroup} ${styles[MODEL_TONES[model] || "defaultTone"]}`} key={model}>
                    <h3>{modelLabel(model)}</h3>
                    <div className={styles.cardGrid}>
                      {sortedPoints(snapshot.points.filter((point) => point.model === model), sortKey, direction).map((point) => (
                        <article className={styles.card} key={`${point.model}:${point.effort}`}>
                          <div className={styles.cardHead}><strong>{modelLabel(point.model)} {point.effort}</strong>{point.valid_tasks ? <span>{point.valid_tasks}</span> : null}</div>
                          <div className={styles.cardMain}>{point.iq.toFixed(1)}</div>
                          <div className={styles.cardMeta}><span>${point.average_price_usd.toFixed(2)}</span><span>{point.average_minutes.toFixed(0)} 分钟</span></div>
                        </article>
                      ))}
                    </div>
                  </section>
                )) : <div className={styles.empty}>请至少选择一个模型</div>}
              </div>
            </>
          ) : <div className={styles.state}><p>{loading ? "正在读取智力效率数据..." : error || "暂无数据"}</p>{error ? <button type="button" onClick={() => void load()}>重试</button> : null}</div>}
          <footer className={styles.footer}><span>数据仅供模型选择参考</span><a href="https://codexradar.com" target="_blank" rel="noreferrer">Codex Radar</a></footer>
        </section>
      ) : null}
    </div>
  );
}
