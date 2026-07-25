import { withAccessToken } from "../../conversations/data/http";
import type { MediaFile } from "../../conversations/model/types";

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
