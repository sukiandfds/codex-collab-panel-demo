import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, ImageOff, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentBlock, SessionMessage } from "../model/types";
import { withAccessToken } from "../../../shared/api/http";
import styles from "./ContentRenderer.module.css";

const sourceUrl = (source: string) => withAccessToken(source);
const downloadUrl = (source: string) => withAccessToken(`${source}${source.includes("?") ? "&" : "?"}download=1`);
const IMAGE_VIEWER_HISTORY_KEY = "codexImageViewer";

type ImageShape = "panorama" | "landscape" | "square" | "portrait" | "tall";
interface ImageDimensions { width: number; height: number }

const imageDimensionsCache = new Map<string, ImageDimensions>();

function validDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function getSourceDimensions(source: string): ImageDimensions | null {
  try {
    const url = new URL(source, "http://local");
    const width = Number(url.searchParams.get("w"));
    const height = Number(url.searchParams.get("h"));
    return validDimension(width) && validDimension(height) ? { width, height } : null;
  } catch {
    return null;
  }
}

function rememberImageDimensions(source: string, dimensions: ImageDimensions) {
  if (imageDimensionsCache.size >= 200) {
    const oldest = imageDimensionsCache.keys().next().value;
    if (oldest) imageDimensionsCache.delete(oldest);
  }
  imageDimensionsCache.set(source, dimensions);
}

function getImageShape(width: number, height: number): ImageShape {
  const ratio = width / height;
  if (ratio >= 2.4) return "panorama";
  if (ratio >= 1.2) return "landscape";
  if (ratio >= 0.82) return "square";
  if (ratio >= 0.58) return "portrait";
  return "tall";
}

function RenderedImage({ source, alt, width, height }: { source: string; alt: string; width?: number; height?: number }) {
  const url = sourceUrl(source);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(() => {
    if (validDimension(width) && validDimension(height)) return { width, height };
    return getSourceDimensions(source) || imageDimensionsCache.get(source) || null;
  });
  const [failed, setFailed] = useState(!source);
  const [isOpen, setIsOpen] = useState(false);
  const shape = dimensions ? getImageShape(dimensions.width, dimensions.height) : null;

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const requestClose = () => {
      if (window.history.state?.[IMAGE_VIEWER_HISTORY_KEY]) window.history.back();
      else setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    const handlePopState = () => setIsOpen(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("popstate", handlePopState);
      if (window.history.state?.[IMAGE_VIEWER_HISTORY_KEY]) {
        const nextState = { ...window.history.state };
        delete nextState[IMAGE_VIEWER_HISTORY_KEY];
        window.history.replaceState(nextState, "");
      }
    };
  }, [isOpen]);

  const openViewer = () => {
    if (failed) return;
    window.history.pushState({ ...window.history.state, [IMAGE_VIEWER_HISTORY_KEY]: true }, "");
    setIsOpen(true);
  };

  const closeViewer = () => {
    if (window.history.state?.[IMAGE_VIEWER_HISTORY_KEY]) window.history.back();
    else setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.imageThumbnail} ${failed ? styles.square : shape ? styles[shape] : styles.imagePending}`}
        style={dimensions ? { aspectRatio: `${dimensions.width} / ${dimensions.height}` } : undefined}
        onClick={openViewer}
        aria-label={failed ? "图片无法显示" : `查看大图${alt ? `：${alt}` : ""}`}
        disabled={failed}
      >
        {!failed ? (
          <img
            src={url}
            alt={alt}
            loading="lazy"
            width={dimensions?.width}
            height={dimensions?.height}
            onLoad={(event) => {
              setFailed(false);
              if (dimensions) return;
              const next = {
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              };
              if (!validDimension(next.width) || !validDimension(next.height)) return;
              rememberImageDimensions(source, next);
              setDimensions(next);
            }}
            onError={() => setFailed(true)}
          />
        ) : (
          <span className={styles.imageError}><ImageOff aria-hidden="true" />图片无法显示</span>
        )}
      </button>
      {isOpen && createPortal(
        <div className={styles.imageViewer} role="dialog" aria-modal="true" aria-label={alt || "查看大图"} onClick={closeViewer}>
          <button
            type="button"
            className={styles.imageViewerClose}
            onClick={(event) => {
              event.stopPropagation();
              closeViewer();
            }}
            aria-label="关闭大图"
            title="关闭"
            autoFocus
          >
            <X aria-hidden="true" />
          </button>
          <img src={url} alt={alt} onClick={(event) => event.stopPropagation()} />
        </div>,
        document.body,
      )}
    </>
  );
}

function Block({ block }: { block: ContentBlock }) {
  if (block.type === "markdown") {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          img: ({ src, alt }) => <RenderedImage source={src || ""} alt={alt || ""} />,
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
      <RenderedImage
        source={block.source}
        alt={block.alt || block.file?.name || "对话图片"}
        width={block.width || block.file?.width}
        height={block.height || block.file?.height}
      />
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
