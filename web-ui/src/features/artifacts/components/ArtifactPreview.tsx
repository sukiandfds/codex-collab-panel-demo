import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { withAccessToken } from "../../../shared/api/http";
import type { Artifact } from "../model/types";
import styles from "./ArtifactCard.module.css";

export function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  const source = withAccessToken(artifact.previewUrl || artifact.sourceUrl);
  const [markdown, setMarkdown] = useState("");
  const [markdownError, setMarkdownError] = useState(false);

  useEffect(() => {
    if (artifact.previewType !== "markdown") {
      setMarkdown("");
      setMarkdownError(false);
      return;
    }
    const controller = new AbortController();
    setMarkdownError(false);
    fetch(source, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then(setMarkdown)
      .catch((error) => {
        if (error?.name !== "AbortError") setMarkdownError(true);
      });
    return () => controller.abort();
  }, [artifact.id, artifact.version, artifact.previewType, source]);

  if (artifact.previewType === "markdown") {
    if (markdownError) return <p className={styles.previewNotice}>预览暂不可用，请下载原文件。</p>;
    return <div className={styles.markdownPreview}><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown></div>;
  }
  if (artifact.previewType === "image") {
    return <a className={styles.imagePreview} href={source} target="_blank" rel="noreferrer"><img src={source} alt={artifact.name} loading="lazy" /></a>;
  }
  if (artifact.previewType === "audio") return <audio className={styles.mediaPreview} controls preload="metadata" src={source} />;
  if (artifact.previewType === "video") return <video className={styles.videoPreview} controls preload="metadata" src={source} />;
  if (artifact.previewType === "pdf") return <iframe className={styles.pdfPreview} src={source} title={`${artifact.name} 预览`} loading="lazy" />;
  return null;
}
