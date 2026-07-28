import type { MediaFile } from "../../../shared/model/media";
import type { ContentBlock, SessionMessage } from "../model/types";

let nextOptimisticMessageId = 1;

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

export const createOptimisticMessage = (text: string, attachments: MediaFile[]): SessionMessage => {
  const id = `optimistic-${Date.now().toString(36)}-${nextOptimisticMessageId++}`;
  return { id, role: "user", text, blocks: optimisticBlocks(id, text, attachments) };
};
