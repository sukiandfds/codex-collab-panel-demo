import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link, X } from "lucide-react";
import { fetchJson } from "../../../shared/api/http";
import styles from "./ShareConversationDialog.module.css";

interface ShareConversationDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
}

export function ShareConversationDialog({ open, title, onClose }: ShareConversationDialogProps) {
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [qrCodeError, setQrCodeError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setShareUrl("");
    setQrCodeUrl("");
    setQrCodeError(false);
    setCopied(false);

    void Promise.all([
      fetchJson<{ token: string }>("/api/share-link"),
      import("qrcode"),
    ])
      .then(([{ token }, { toDataURL }]) => {
        const url = new URL(window.location.href);
        url.searchParams.set("token", token);
        const completeUrl = url.toString();
        if (!cancelled) setShareUrl(completeUrl);
        return toDataURL(completeUrl, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#171717", light: "#ffffff" },
        });
      })
      .then((dataUrl) => {
        if (!cancelled) setQrCodeUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrCodeError(true);
      });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      linkInputRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
  };

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
        <header className={styles.header}>
          <div>
            <h2 id="share-dialog-title">分享当前对话</h2>
            <p>{title}</p>
          </div>
          <button className={styles.iconButton} type="button" aria-label="关闭分享" title="关闭" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.qrArea}>
          {qrCodeUrl ? <img src={qrCodeUrl} alt="当前页面链接二维码" /> : null}
          {!qrCodeUrl && !qrCodeError ? <span className={styles.qrLoading}>正在生成二维码</span> : null}
          {qrCodeError ? <span className={styles.qrError}>分享链接生成失败，请重新打开</span> : null}
        </div>

        <label className={styles.linkLabel} htmlFor="share-conversation-url">当前页面链接</label>
        <div className={styles.linkRow}>
          <span className={styles.linkIcon}><Link aria-hidden="true" /></span>
          <input id="share-conversation-url" ref={linkInputRef} value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
          <button className={styles.copyButton} type="button" disabled={!shareUrl} onClick={() => void copyShareUrl()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            <span>{copied ? "已复制" : "复制"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
