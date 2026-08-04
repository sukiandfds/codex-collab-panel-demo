import { withAccessToken } from "../../../shared/api/http";
import type { MediaFile } from "../../../shared/model/media";

const maxImageDimension = 2048;
const minImageBytesForResize = 1500000;
const compressibleImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const loadImageSource = async (file: File, signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image could not be decoded."));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
};

export const prepareAttachmentForUpload = async (file: File, signal?: AbortSignal): Promise<File> => {
  if (!compressibleImageTypes.has(file.type) || file.size < minImageBytesForResize) return file;
  let image;
  try {
    image = await loadImageSource(file, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return file;
  }
  try {
    const scale = Math.min(1, maxImageDimension / Math.max(image.width, image.height));
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const outputType = file.type === "image/png" ? "image/webp" : file.type;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, outputType === "image/png" ? undefined : 0.82));
    if (!blob || blob.size >= file.size) return file;
    const extension = blob.type === "image/webp" ? ".webp" : blob.type === "image/jpeg" ? ".jpg" : ".png";
    const baseName = file.name.replace(/\.[^.]+$/u, "");
    return new File([blob], `${baseName}${extension}`, { type: blob.type || outputType, lastModified: file.lastModified });
  } finally {
    image.close();
  }
};

export const uploadAttachment = async (file: File, signal?: AbortSignal): Promise<MediaFile> => {
  const response = await fetch(withAccessToken(`/api/uploads?name=${encodeURIComponent(file.name)}`), {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
    signal,
  });
  const payload = await response.json().catch(() => ({})) as MediaFile & { error?: string };
  if (!response.ok) throw new Error(payload.error || `附件上传失败（${response.status}）`);
  return payload;
};
