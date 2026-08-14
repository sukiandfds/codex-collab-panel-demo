import { useId, useRef } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { formatFileSize } from "../../../shared/format/fileSize";
import type { DraftAttachment } from "../hooks/useAttachmentDraft";
import styles from "./AttachmentDraft.module.css";

export function AttachmentButton({ disabled, onFiles }: {
  disabled: boolean;
  onFiles: (files: FileList) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        className={styles.hiddenInput}
        id={inputId}
        ref={inputRef}
        type="file"
        multiple
        disabled={disabled}
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <label className={`${styles.attachButton} ${disabled ? styles.disabled : ""}`} htmlFor={inputId} title="添加文件">
        <Paperclip aria-hidden="true" />
        <span className={styles.srOnly}>添加文件</span>
      </label>
    </>
  );
}

export function AttachmentPreviews({
  attachments, error, uploading = false, uploadSlow = false, onRemove, onCancelUpload,
}: {
  attachments: DraftAttachment[];
  error: string;
  uploading?: boolean;
  uploadSlow?: boolean;
  onRemove: (id: string) => void;
  onCancelUpload?: () => void;
}) {
  if (!attachments.length && !error) return null;
  return (
    <div className={styles.area}>
      {attachments.length ? (
        <div className={styles.list}>
          {attachments.map((attachment) => (
            <div className={styles.item} key={attachment.id} title={attachment.file.name}>
              {attachment.previewUrl
                ? <img src={attachment.previewUrl} alt="" />
                : <span className={styles.fileIcon}><FileText aria-hidden="true" /></span>}
              <span className={styles.meta}><strong>{attachment.file.name}</strong><small>{formatFileSize(attachment.file.size)}</small></span>
              <button type="button" aria-label={`移除 ${attachment.file.name}`} title="移除附件" disabled={uploading} onClick={() => onRemove(attachment.id)}><X aria-hidden="true" /></button>
            </div>
          ))}
        </div>
      ) : null}
      {uploading && (uploadSlow || onCancelUpload) ? (
        <div className={styles.uploading} role="status">
          {uploadSlow ? <span>网络较慢</span> : null}
          {onCancelUpload ? (
            <button type="button" aria-label="取消上传" title="取消上传" onClick={onCancelUpload}>
              <X aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </div>
  );
}
