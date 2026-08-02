import { useEffect, useMemo, useState } from "react";
import { FolderKanban } from "lucide-react";
import { ViewSwitcher } from "../../components/ViewSwitcher/ViewSwitcher";
import { ProgressEntryDetail } from "./components/ProgressEntryDetail";
import { ProgressEntryRow } from "./components/ProgressEntryRow";
import { ProgressLogList } from "./components/ProgressLogList";
import { fetchProjectProgress, type ProjectProgressDocument } from "./data/progressApi";
import { formatProgressTimestamp } from "./model/format";
import styles from "./ProjectProgressApp.module.css";

const readSelectedId = () => new URLSearchParams(window.location.search).get("item");

export function ProjectProgressApp() {
  const [document, setDocument] = useState<ProjectProgressDocument | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(readSelectedId);

  useEffect(() => {
    const controller = new AbortController();
    fetchProjectProgress(controller.signal)
      .then(setDocument)
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "项目进度暂时无法读取");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedId) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeEntry();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const entryMap = useMemo(() => new Map(document?.entries.map((entry) => [entry.id, entry]) || []), [document]);
  const selectedEntry = selectedId ? entryMap.get(selectedId) : undefined;

  function openEntry(id: string) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("item", id);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  function closeEntry() {
    setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("item");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <FolderKanban aria-hidden="true" />
        <div className={styles.heading}>
          <h1>项目进度</h1>
          <span>{document ? `更新于 ${formatProgressTimestamp(document.updatedAt)}` : "读取项目记录"}</span>
        </div>
        <div className={styles.spacer} />
        <ViewSwitcher current="progress" />
      </header>

      <section className={styles.scrollArea} aria-live="polite">
        <div className={styles.content}>
          {error ? <div className={styles.state}>{error}</div> : null}
          {!error && !document ? <div className={styles.state}>正在读取项目进度...</div> : null}
          {document ? (
            <>
              <section className={styles.projectIntro}>
                <div>
                  <span className={styles.eyebrow}>项目概览</span>
                  <h2>{document.project}</h2>
                  <p>以真实功能文档为来源，集中查看当前计划、执行状态和最近变化。</p>
                </div>
                <div className={styles.overviewStats}>
                  <span><strong>{document.entries.length}</strong>个条目</span>
                  <span><strong>{document.inProgress.length}</strong>项进行中</span>
                  <span><strong>{document.logs.length}</strong>条更新</span>
                </div>
              </section>

              <section className={styles.prioritySection}>
                <div className={styles.sectionHeading}>
                  <div><h2>今日计划</h2><p>来自功能索引中已经明确记录的待办。</p></div>
                </div>
                {document.plan.length ? (
                  <div className={styles.entryList}>{document.plan.map((entry) => <ProgressEntryRow key={entry.id} entry={entry} onOpen={openEntry} />)}</div>
                ) : <p className={styles.empty}>暂无明确计划。</p>}
              </section>

              <section className={styles.prioritySection}>
                <div className={styles.sectionHeading}>
                  <div><h2>当前进行中</h2><p>只显示功能记录中明确标记为进行中的条目。</p></div>
                </div>
                {document.inProgress.length ? (
                  <div className={styles.entryList}>{document.inProgress.map((entry) => <ProgressEntryRow key={entry.id} entry={entry} onOpen={openEntry} />)}</div>
                ) : <p className={styles.empty}>当前没有明确标记为进行中的条目。</p>}
              </section>

              <section className={styles.logSection}>
                <div className={styles.sectionHeading}>
                  <div><h2>最近更新</h2><p>每条记录说明具体发生了什么变化。</p></div>
                </div>
                <ProgressLogList logs={document.logs} onOpen={openEntry} />
              </section>

              <section className={styles.categorySection}>
                <div className={styles.sectionHeading}>
                  <div><h2>全部工作</h2><p>按工作类型收纳，点击条目查看完整内容。</p></div>
                </div>
                <div className={styles.categoryList}>
                  {document.categories.map((category) => (
                    <details className={styles.category} key={category.name}>
                      <summary><span>{category.name}</span><small>{category.entries.length} 个条目</small></summary>
                      <div className={styles.entryList}>{category.entries.map((entry) => <ProgressEntryRow key={entry.id} entry={entry} onOpen={openEntry} />)}</div>
                    </details>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </section>

      {selectedEntry ? (
        <ProgressEntryDetail
          entry={selectedEntry}
          relatedEntries={entryMap}
          onOpenRelated={openEntry}
          onClose={closeEntry}
        />
      ) : null}
    </main>
  );
}
