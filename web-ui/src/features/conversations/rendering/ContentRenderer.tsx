import { Download, FileText, ImageOff } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentBlock, SessionMessage } from "../model/types";
import { withAccessToken } from "../data/http";
import styles from "./ContentRenderer.module.css";

const sourceUrl = (source: string) => withAccessToken(source);
const downloadUrl = (source: string) => withAccessToken(`${source}${source.includes("?") ? "&" : "?"}download=1`);

function Block({ block }: { block: ContentBlock }) {
  if (block.type === "markdown") {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          img: ({ src, alt }) => <img src={sourceUrl(src || "")} alt={alt || ""} loading="lazy" />,
        }}
      >
        {block.text}
      </ReactMarkdown>
    );
  }
  if (block.type === "options") {
    return <div className={styles.options}>{block.options.map((option) => <div key={option}>{option}</div>)}</div>;
  }
  if (block.type === "image") {
    return (
      <a className={styles.imageLink} href={sourceUrl(block.source)} target="_blank" rel="noreferrer">
        <img src={sourceUrl(block.source)} alt={block.alt || block.file?.name || "对话图片"} loading="lazy" />
        <span><ImageOff aria-hidden="true" />图片无法显示时点击打开原文件</span>
      </a>
    );
  }
  if (block.type === "audio") return <audio className={styles.audio} controls preload="metadata" src={sourceUrl(block.source)} />;
  if (block.type === "video") return <video className={styles.video} controls preload="metadata" src={sourceUrl(block.source)} />;

  const name = block.name || block.file?.name || "附件";
  return (
    <div className={styles.file}>
      <FileText aria-hidden="true" />
      <span>{name}</span>
      <a href={downloadUrl(block.source)} aria-label={`下载 ${name}`} title={`下载 ${name}`}>
        <Download aria-hidden="true" />
      </a>
    </div>
  );
}

export function ContentRenderer({ message }: { message: SessionMessage }) {
  const blocks = message.blocks?.length
    ? message.blocks
    : [{ id: `${message.id}-text`, type: "markdown" as const, text: message.text }];
  return <div className={styles.content}>{blocks.map((block) => <Block key={block.id} block={block} />)}</div>;
}
