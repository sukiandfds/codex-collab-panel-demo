import { Download, FileText } from "lucide-react";
import type { MediaFile } from "../../conversations/model/types";
import { withAccessToken } from "../../conversations/data/http";
import styles from "./AttachmentDisplay.module.css";

const sourceUrl = (source: string) => withAccessToken(source);
const downloadUrl = (source: string) => withAccessToken(`${source}${source.includes("?") ? "&" : "?"}download=1`);

export function AttachmentDisplay({ files }: { files: MediaFile[] }) {
  if (!files.length) return null;
  return (
    <div className={styles.attachments}>
      {files.map((file) => {
        if (file.mimeType.startsWith("image/")) {
          return <a className={styles.image} href={sourceUrl(file.url)} target="_blank" rel="noreferrer" key={file.id}><img src={sourceUrl(file.url)} alt={file.name} loading="lazy" /></a>;
        }
        if (file.mimeType.startsWith("audio/")) return <audio className={styles.audio} controls preload="metadata" src={sourceUrl(file.url)} key={file.id} />;
        if (file.mimeType.startsWith("video/")) return <video className={styles.video} controls preload="metadata" src={sourceUrl(file.url)} key={file.id} />;
        return (
          <div className={styles.file} key={file.id}>
            <FileText aria-hidden="true" />
            <span>{file.name}</span>
            <a href={downloadUrl(file.url)} aria-label={`下载 ${file.name}`} title={`下载 ${file.name}`}><Download aria-hidden="true" /></a>
          </div>
        );
      })}
    </div>
  );
}
