import { useEffect, useState } from "react";
import { FolderKanban } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ViewSwitcher } from "../../components/ViewSwitcher/ViewSwitcher";
import { fetchProjectProgress, type ProjectProgressDocument } from "./data/progressApi";
import styles from "./ProjectProgressApp.module.css";

const visibleSections = (markdown: string) => {
  const start = markdown.indexOf("## 当前功能");
  const end = markdown.indexOf("## 当前优先阅读的普适问题");
  if (start < 0) return markdown;
  return markdown.slice(start, end > start ? end : undefined).trim();
};

const updatedText = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const markdownComponents: Components = {
  a: ({ href, children }) => href?.startsWith("http")
    ? <a href={href} target="_blank" rel="noreferrer">{children}</a>
    : <span>{children}</span>,
};

export function ProjectProgressApp() {
  const [document, setDocument] = useState<ProjectProgressDocument | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchProjectProgress(controller.signal)
      .then(setDocument)
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "项目进度暂时无法读取");
      });
    return () => controller.abort();
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <FolderKanban aria-hidden="true" />
        <div className={styles.heading}>
          <h1>项目进度</h1>
          <span>{document ? `更新于 ${updatedText(document.updatedAt)}` : "读取需求文档"}</span>
        </div>
        <div className={styles.spacer} />
        <ViewSwitcher current="progress" />
      </header>
      <section className={styles.scrollArea} aria-live="polite">
        <div className={styles.content}>
          {error ? <div className={styles.state}>{error}</div> : null}
          {!error && !document ? <div className={styles.state}>正在读取项目进度...</div> : null}
          {document ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {visibleSections(document.markdown)}
            </ReactMarkdown>
          ) : null}
        </div>
      </section>
    </main>
  );
}
