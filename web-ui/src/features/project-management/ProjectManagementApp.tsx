import { ClipboardList, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewSwitcher } from "../../components/ViewSwitcher/ViewSwitcher";
import { formatRecordedTimestamp as formatProjectManagementTimestamp } from "../../shared/format/dateTime";
import { fetchProjectManagement, fetchProjectManagementEntry, readProjectManagementCache } from "./data/projectManagementApi";
import { EntryDetailPanel } from "./components/EntryDetailPanel";
import { EntrySummaryRow } from "./components/EntrySummaryRow";
import { UpdateLogPanel } from "./components/UpdateLogPanel";
import type { ProjectManagementDocument, ProjectManagementEntry } from "./model/types";
import styles from "./ProjectManagementApp.module.css";

export function ProjectManagementApp() {
  const [document, setDocument] = useState<ProjectManagementDocument | null>(() => readProjectManagementCache());
  const [selectedEntry, setSelectedEntry] = useState<ProjectManagementEntry | null>(null);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const summaryRequestRef = useRef<AbortController | null>(null);
  const detailRequestRef = useRef<AbortController | null>(null);

  const load = useCallback((force = false) => {
    summaryRequestRef.current?.abort();
    const controller = new AbortController();
    summaryRequestRef.current = controller;
    setLoading(true);
    setError("");
    fetchProjectManagement(controller.signal, { force })
      .then(setDocument)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "项目管理数据读取失败");
      })
      .finally(() => {
        if (summaryRequestRef.current === controller) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const cleanup = load();
    return () => {
      cleanup?.();
      detailRequestRef.current?.abort();
    };
  }, [load]);

  const entryMap = useMemo(
    () => new Map((document?.entries || []).map((entry) => [entry.id, entry])),
    [document],
  );

  const openEntry = useCallback((entry: ProjectManagementEntry) => {
    detailRequestRef.current?.abort();
    const controller = new AbortController();
    detailRequestRef.current = controller;
    setSelectedEntry(entry);
    setDetailLoading(true);
    setDetailError("");
    fetchProjectManagementEntry(entry.id, controller.signal)
      .then(setSelectedEntry)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setDetailError(reason instanceof Error ? reason.message : "条目详情读取失败");
      })
      .finally(() => {
        if (detailRequestRef.current === controller) setDetailLoading(false);
      });
  }, []);

  const closeEntry = useCallback(() => {
    detailRequestRef.current?.abort();
    detailRequestRef.current = null;
    setSelectedEntry(null);
    setDetailLoading(false);
    setDetailError("");
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <ClipboardList aria-hidden="true" />
        <div className={styles.heading}>
          <h1>项目管理</h1>
          <span>独立数据源 · 摘要优先，详情下钻</span>
        </div>
        <span className={styles.headerSpacer} />
        <ViewSwitcher current="progress" />
        <button className={styles.refreshButton} type="button" onClick={() => load(true)} disabled={loading} title="重新读取项目管理文件">
          <RefreshCw aria-hidden="true" />
          <span>{loading ? "读取中" : "刷新"}</span>
        </button>
      </header>

      <section className={styles.scrollArea}>
        <div className={styles.content}>
          {loading && !document ? <p className={styles.state}>正在读取项目管理目录...</p> : null}
          {error ? (
            <div className={styles.errorState} role="alert">
              <strong>项目管理数据暂时不可用</strong>
              <span>{error}</span>
              <button type="button" onClick={() => load(true)}>重试</button>
            </div>
          ) : null}

          {document ? (
            <>
              <section className={styles.projectOverview}>
                <div className={styles.projectCopy}>
                  <span className={styles.eyebrow}>单项目控制台</span>
                  <h2>{document.project.title}</h2>
                  <p>{document.project.goal}</p>
                </div>
                <div className={styles.projectFacts}>
                  <span><small>阶段</small><strong>{document.project.phase}</strong></span>
                  <span><small>健康</small><strong className={styles[`health-${document.project.health}`] || styles.healthNormal}>{document.project.statusLabel}</strong></span>
                  <span><small>数据更新</small><strong>{formatProjectManagementTimestamp(document.updatedAt)}</strong></span>
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div><h2>当前计划</h2><p>只显示目录中明确列出的计划条目。</p></div>
                  <span className={styles.sectionCount}>{document.plan.length}</span>
                </div>
                {document.plan.length ? (
                  <div className={styles.entryList}>{document.plan.map((entry) => <EntrySummaryRow key={entry.id} entry={entry} onOpen={openEntry} />)}</div>
                ) : <p className={styles.empty}>暂无明确计划。</p>}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div><h2>当前进行中</h2><p>只显示目录中明确标记为正在进行的条目。</p></div>
                  <span className={styles.sectionCount}>{document.inProgress.length}</span>
                </div>
                {document.inProgress.length ? (
                  <div className={styles.entryList}>{document.inProgress.map((entry) => <EntrySummaryRow key={entry.id} entry={entry} onOpen={openEntry} />)}</div>
                ) : <p className={styles.empty}>暂无明确进行中的条目。</p>}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div><h2>最近更新</h2><p>每条记录保留时间、变化和用户影响；点击可查看完整条目。</p></div>
                  <span className={styles.sectionCount}>{document.recentUpdates.length}</span>
                </div>
                <UpdateLogPanel updates={document.recentUpdates} entries={entryMap} onOpen={openEntry} />
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHeading}>
                  <div><h2>按分类查看</h2><p>分类默认收起，避免把详情、日志和证据堆在首屏。</p></div>
                  <span className={styles.sectionCount}>{document.stats.total}</span>
                </div>
                <div className={styles.categoryList}>
                  {document.categories.map((category) => (
                    <details key={category.name} className={styles.category}>
                      <summary><span>{category.name}</span><small>{category.entries.length} 条目</small></summary>
                      <div className={styles.entryList}>{category.entries.map((entry) => <EntrySummaryRow key={entry.id} entry={entry} onOpen={openEntry} />)}</div>
                    </details>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </section>

      {selectedEntry ? (
        <EntryDetailPanel
          entry={selectedEntry}
          entries={entryMap}
          onOpenRelated={openEntry}
          onClose={closeEntry}
          loading={detailLoading}
          error={detailError}
        />
      ) : null}
    </main>
  );
}
