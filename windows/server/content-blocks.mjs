import path from "node:path";
import { createHash } from "node:crypto";

const UI_DIRECTIVES = [
  /<options>[\s\S]*?<\/options>/giu,
  /<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/giu,
];

const stripCodexDirectives = (value) => {
  let fence = "";
  return String(value || "").split("\n").filter((line) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? "" : fence || marker;
      return true;
    }
    if (fence) return true;
    return !/^\s*::[a-z][a-z0-9-]*\{.*\}\s*$/iu.test(line);
  }).join("\n");
};

const optionBlocksFrom = (value) => {
  const text = String(value || "");
  const blocks = [];
  for (const group of text.matchAll(/<options>([\s\S]*?)<\/options>/giu)) {
    const options = [...group[1].matchAll(/<option>([\s\S]*?)<\/option>/giu)]
      .map((match) => cleanText(match[1]))
      .filter(Boolean);
    if (options.length) blocks.push({ id: blockId("options", options.join("\n")), type: "options", options });
  }
  return blocks;
};

const cleanText = (value) => {
  let text = String(value || "").replace(/\r\n/g, "\n");
  for (const pattern of UI_DIRECTIVES) text = text.replace(pattern, "");
  return stripCodexDirectives(text).trim();
};

const blockId = (type, value) => createHash("sha1").update(`${type}:${value}`).digest("hex").slice(0, 16);

const valueFrom = (object, keys) => {
  for (const key of keys) {
    if (typeof object?.[key] === "string" && object[key]) return object[key];
  }
  return "";
};

const localPathFrom = (value) => {
  if (!value || /^https?:\/\//iu.test(value) || /^data:/iu.test(value)) return "";
  return value.startsWith("file://") ? decodeURIComponent(new URL(value).pathname.replace(/^\/(?:[A-Za-z]:)/u, (match) => match.slice(1))) : value;
};

const registerMarkdownMedia = (text, registerMedia) => text.replace(/!\[([^\]]*)\]\((<[^>]+>|[^)\n]+)\)/gu, (match, alt, rawSource) => {
  const source = rawSource.trim().replace(/^<|>$/gu, "");
  const localPath = localPathFrom(source);
  if (!localPath) return match;
  const media = registerMedia(localPath);
  return media ? `![${alt}](${media.url})` : match;
});

const mediaBlock = (type, source, registerMedia, extra = {}) => {
  if (!source) return null;
  const localPath = localPathFrom(source);
  if (localPath) {
    const media = registerMedia(localPath);
    return media ? { id: blockId(type, localPath), type, source: media.url, ...extra, file: media } : null;
  }
  return { id: blockId(type, source), type, source, ...extra };
};

const structuredContentFrom = (item) => {
  const value = item?.result?.structuredContent;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isNegusImageToolCall = (item) => item?.type === "mcpToolCall"
  && String(item.server || "").replace(/-/gu, "_") === "negus_image"
  && item.status === "completed";

const negusImageBlocks = (item, registerMedia) => {
  if (!isNegusImageToolCall(item)) return [];
  const outputs = structuredContentFrom(item)?.outputs;
  if (!Array.isArray(outputs)) return [];
  return outputs.flatMap((output) => {
    const block = mediaBlock("image", output?.path, registerMedia, {
      alt: path.basename(String(output?.path || "generated-image")),
      ...(Number.isSafeInteger(output?.width) ? { width: output.width } : {}),
      ...(Number.isSafeInteger(output?.height) ? { height: output.height } : {}),
    });
    return block ? [block] : [];
  });
};

export const blocksFromContent = (value, registerMedia, depth = 0) => {
  if (depth > 6 || value === null || value === undefined) return [];
  if (typeof value === "string") {
    const text = registerMarkdownMedia(cleanText(value), registerMedia);
    const blocks = text ? [{ id: blockId("markdown", text), type: "markdown", text }] : [];
    return [...blocks, ...optionBlocksFrom(value)];
  }
  if (Array.isArray(value)) return value.flatMap((item) => blocksFromContent(item, registerMedia, depth + 1));
  if (typeof value !== "object") return [];

  const rawType = String(value.type || value.kind || "").replace(/[_-]/g, "").toLowerCase();
  if (["text", "inputtext", "outputtext"].includes(rawType)) {
    return blocksFromContent(value.text || value.input_text || value.output_text, registerMedia, depth + 1);
  }
  if (["image", "inputimage", "localimage", "imageview"].includes(rawType)) {
    const source = valueFrom(value, ["image_url", "imageUrl", "url", "path", "source"]);
    const block = mediaBlock("image", source, registerMedia, { alt: value.alt || path.basename(source || "image") });
    return block ? [block] : [];
  }
  if (["audio", "inputaudio", "localaudio"].includes(rawType)) {
    const source = valueFrom(value, ["audio_url", "audioUrl", "url", "path", "source"]);
    const block = mediaBlock("audio", source, registerMedia);
    return block ? [block] : [];
  }
  if (["video", "inputvideo", "localvideo"].includes(rawType)) {
    const source = valueFrom(value, ["video_url", "videoUrl", "url", "path", "source"]);
    const block = mediaBlock("video", source, registerMedia);
    return block ? [block] : [];
  }
  if (["file", "attachment", "inputfile", "mention"].includes(rawType)) {
    const source = valueFrom(value, ["file_url", "fileUrl", "url", "path", "source"]);
    const block = mediaBlock("file", source, registerMedia, { name: value.name || path.basename(source || "file") });
    return block ? [block] : [];
  }

  for (const key of ["content", "message", "text", "input_text", "output_text"]) {
    if (key in value) {
      const blocks = blocksFromContent(value[key], registerMedia, depth + 1);
      if (blocks.length) return blocks;
    }
  }
  return [];
};

const visibleText = (blocks) => blocks
  .filter((block) => block.type === "markdown")
  .map((block) => block.text)
  .filter(Boolean)
  .join("\n")
  .trim();

const cleanUserAttachmentEnvelope = (blocks) => blocks.flatMap((block) => {
  if (block.type !== "markdown") return [block];
  const text = String(block.text || "");
  if (!text.trimStart().startsWith("# Files mentioned by the user:")) return [block];
  const marker = /^## My request(?: for Codex)?:\s*$/mu.exec(text);
  if (!marker) return [block];
  const cleaned = text.slice(marker.index + marker[0].length).trim();
  return cleaned ? [{ ...block, text: cleaned }] : [];
});

const typedInputs = (value, type) => {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map((item) => typeof item === "string" ? { type, path: item } : item);
};

const isUsefulUserMessage = (text, blocks) => {
  if (!text && !blocks.some((block) => block.type !== "markdown")) return false;
  return !text.includes("<codex_delegation>") &&
    !text.startsWith("# AGENTS.md") &&
    !text.startsWith("# Options") &&
    !text.startsWith("<environment_context>") &&
    !text.startsWith("Warning: apply_patch was requested via shell") &&
    !text.startsWith("Warning: apply_patch was requested via exec_command");
};

export const messageFromItem = (item, registerMedia) => {
  const payload = item?.payload;
  let role = "";
  let content;

  if (item?.type === "event_msg" && payload?.type === "user_message") {
    role = "user";
    content = [
      payload.message ?? payload.content,
      ...typedInputs(payload.images, "image"),
      ...typedInputs(payload.audio, "audio"),
      ...typedInputs(payload.files, "file"),
    ].filter(Boolean);
  } else if (item?.type === "event_msg" && payload?.type === "agent_message" && payload?.phase === "final_answer") {
    role = "assistant";
    content = payload.message ?? payload.content ?? payload;
  } else if (item?.type === "response_item" && payload?.type === "message" && ["user", "assistant"].includes(payload.role)) {
    if (payload.role === "assistant" && payload.phase && payload.phase !== "final_answer") return null;
    role = payload.role;
    content = payload.content;
  } else if (item?.type === "response_item" && payload?.type === "image_view") {
    role = "assistant";
    content = { type: "imageView", path: payload.path };
  } else {
    return null;
  }

  const parsedBlocks = blocksFromContent(content, registerMedia);
  const blocks = role === "user" ? cleanUserAttachmentEnvelope(parsedBlocks) : parsedBlocks;
  const text = visibleText(blocks);
  if (role === "user" && !isUsefulUserMessage(text, blocks)) return null;
  if (!blocks.length) return null;
  const metadata = payload?.internal_chat_message_metadata_passthrough || {};
  const itemId = item.id || payload?.id || payload?.client_id || "";
  const idSource = itemId || `${role}:${JSON.stringify(blocks)}`;
  return {
    id: blockId("message", idSource),
    role,
    text,
    blocks,
    ...(itemId ? { itemId } : {}),
    ...(metadata.turn_id || item.turnId ? { turnId: metadata.turn_id || item.turnId } : {}),
  };
};

export const previewText = (value, limit = 180) => cleanText(value).replace(/\s+/g, " ").slice(0, limit);

const markdownImagePattern = /!\[([^\]]*)\]\((<[^>]+>|[^)\n]+)\)/gu;

export const dedupeAssistantMediaMessages = (messages, seen = new Set()) => (Array.isArray(messages) ? messages : [])
  .map((message) => {
    if (message?.role !== "assistant" || !Array.isArray(message.blocks)) return message;
    const blocks = message.blocks.flatMap((block) => {
      if (block.type === "image") {
        const source = String(block.source || "");
        if (!source || seen.has(source)) return [];
        seen.add(source);
        return [block];
      }
      if (block.type !== "markdown") return [block];
      const text = String(block.text || "").replace(markdownImagePattern, (match, _alt, rawSource) => {
        const source = rawSource.trim().replace(/^<|>$/gu, "");
        if (!source || seen.has(source)) return "";
        seen.add(source);
        return match;
      }).trim();
      return text ? [{ ...block, id: blockId("markdown", text), text }] : [];
    });
    if (!blocks.length) return null;
    return { ...message, blocks, text: visibleText(blocks) };
  })
  .filter(Boolean);

export const messageFromThreadItem = (item, registerMedia) => {
  if (item?.type === "userMessage") {
    const blocks = cleanUserAttachmentEnvelope(blocksFromContent(item.content, registerMedia));
    const text = visibleText(blocks);
    if (!isUsefulUserMessage(text, blocks)) return null;
    const submissionId = typeof item.clientId === "string" ? item.clientId.trim() : "";
    return {
      id: item.id || blockId("message", JSON.stringify(blocks)),
      role: "user",
      text,
      blocks,
      ...(submissionId ? { submissionId } : {}),
    };
  }
  if (item?.type === "agentMessage") {
    if (item.phase && item.phase !== "final_answer") return null;
    const blocks = blocksFromContent(item.text, registerMedia);
    const text = visibleText(blocks);
    return blocks.length ? { id: item.id || blockId("message", item.text), role: "assistant", text, blocks } : null;
  }
  if (item?.type === "imageGeneration" && (item.savedPath || item.result)) {
    const content = item.savedPath
      ? { type: "localImage", path: item.savedPath }
      : { type: "image", url: `data:image/png;base64,${item.result}` };
    const blocks = blocksFromContent(content, registerMedia);
    return blocks.length ? { id: item.id || blockId("message", item.savedPath || item.result), role: "assistant", text: "", blocks } : null;
  }
  if (isNegusImageToolCall(item)) {
    const blocks = negusImageBlocks(item, registerMedia);
    return blocks.length ? {
      id: item.id || blockId("message", JSON.stringify(structuredContentFrom(item))),
      itemId: item.id || "",
      role: "assistant",
      text: "",
      blocks,
    } : null;
  }
  return null;
};
