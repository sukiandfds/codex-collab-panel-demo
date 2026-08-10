import type { MediaFile } from "../../../shared/model/media";
import type { ContentBlock, SessionMessage } from "../model/types";

export const createSubmissionId = (): string => {
  const timestamp = Date.now().toString(36);
  const unique = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `msg-${timestamp}-${unique}`;
};

export const optimisticMessageId = (submissionId: string) => `optimistic-${submissionId}`;

const optimisticBlocks = (messageId: string, text: string, attachments: MediaFile[]): ContentBlock[] => {
  const blocks: ContentBlock[] = text
    ? [{ id: `${messageId}-text`, type: "markdown", text }]
    : [];
  for (const file of attachments) {
    const common = { id: `${messageId}-${file.id}`, source: file.url, file };
    if (file.mimeType.startsWith("image/")) blocks.push({ ...common, type: "image", alt: file.name });
    else if (file.mimeType.startsWith("audio/")) blocks.push({ ...common, type: "audio" });
    else if (file.mimeType.startsWith("video/")) blocks.push({ ...common, type: "video" });
    else blocks.push({ ...common, type: "file", name: file.name });
  }
  return blocks;
};

export const createOptimisticMessage = (
  text: string,
  attachments: MediaFile[],
  submissionId: string = createSubmissionId(),
  createdAt = new Date().toISOString(),
): SessionMessage => {
  const id = optimisticMessageId(submissionId);
  return { id, role: "user", text, blocks: optimisticBlocks(id, text, attachments), createdAt, submissionId };
};
