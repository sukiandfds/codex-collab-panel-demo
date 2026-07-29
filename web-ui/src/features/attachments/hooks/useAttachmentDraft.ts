import { useCallback, useEffect, useRef, useState } from "react";
import { uploadAttachment } from "../data/attachmentApi";
import type { MediaFile } from "../../../shared/model/media";

export interface DraftAttachment {
  id: string;
  file: File;
  previewUrl: string;
}

const maxFiles = 6;
const maxFileBytes = 20 * 1024 * 1024;
let nextDraftId = 1;

export function useAttachmentDraft() {
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadSlow, setUploadSlow] = useState(false);
  const attachmentsRef = useRef(attachments);
  const uploadedRef = useRef(new Map<string, MediaFile>());
  const uploadPromiseRef = useRef<Promise<MediaFile[]> | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const uploadSlowTimerRef = useRef(0);
  attachmentsRef.current = attachments;

  useEffect(() => () => {
    window.clearTimeout(uploadSlowTimerRef.current);
    uploadControllerRef.current?.abort();
    for (const attachment of attachmentsRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    if (uploadPromiseRef.current) return;
    const selected = Array.from(files);
    const current = attachmentsRef.current;
    const room = Math.max(0, maxFiles - current.length);
    const accepted = selected.filter((file) => file.size <= maxFileBytes).slice(0, room);
    setError("");
    if (accepted.length !== selected.length) {
      setError(selected.some((file) => file.size > maxFileBytes)
        ? "每个附件不能超过 20 MB，最多选择 6 个"
        : "一次最多选择 6 个附件");
    }
    const next = [...current, ...accepted.map((file) => ({
        id: `draft-${Date.now().toString(36)}-${nextDraftId++}`,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      }))];
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);

  const removeFile = useCallback((id: string) => {
    if (uploadPromiseRef.current) return;
    const current = attachmentsRef.current;
    const removed = current.find((attachment) => attachment.id === id);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    uploadedRef.current.delete(id);
    const next = current.filter((attachment) => attachment.id !== id);
    attachmentsRef.current = next;
    setAttachments(next);
    setError("");
  }, []);

  const clear = useCallback(() => {
    for (const attachment of attachmentsRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
    attachmentsRef.current = [];
    uploadedRef.current.clear();
    setAttachments([]);
    setError("");
  }, []);

  const uploadAll = useCallback(() => {
    if (uploadPromiseRef.current) return uploadPromiseRef.current;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setUploading(true);
    setUploadSlow(false);
    setError("");
    uploadSlowTimerRef.current = window.setTimeout(() => setUploadSlow(true), 10000);
    const operation = Promise.all(attachmentsRef.current.map(async (attachment) => {
        const uploaded = uploadedRef.current.get(attachment.id);
        if (uploaded) return uploaded;
        const result = await uploadAttachment(attachment.file, controller.signal);
        uploadedRef.current.set(attachment.id, result);
        return result;
      })).catch((reason) => {
      if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
      setError(reason instanceof Error ? reason.message : "附件上传失败");
      throw reason;
    }).finally(() => {
      window.clearTimeout(uploadSlowTimerRef.current);
      uploadSlowTimerRef.current = 0;
      uploadControllerRef.current = null;
      uploadPromiseRef.current = null;
      setUploading(false);
      setUploadSlow(false);
    });
    uploadPromiseRef.current = operation;
    return operation;
  }, []);

  const cancelUpload = useCallback(() => {
    uploadControllerRef.current?.abort();
  }, []);

  return {
    attachments, error, uploading, uploadSlow,
    addFiles, removeFile, clear, uploadAll, cancelUpload,
  };
}
