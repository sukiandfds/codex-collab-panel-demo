import { normalizeImageResolution } from "./image-contract.mjs";

const explicitCommand = /^(?:\/(?:image|imagine)|negus(?:\s+|_)image)\s*[:：,，-]?\s*/iu;
const requestCommand = /^(?:(?:请|麻烦|劳驾|现在|直接|我要|我想要)\s*)?(?:(?:帮我|给我)\s*)?(?:生成|绘制|创建|制作|画|做|出|生图|改图|编辑图片|修改图片|重绘)\s*/u;
const referenceCommand = /^(?:(?:请|麻烦|劳驾)\s*)?(?=(?:根据|参考|基于))/u;
const imageTarget = /(?:图片|图像|照片|海报|插画|壁纸|头像|封面|配图|生图|改图)/u;
const discussionTarget = /(?:生图|图片|图像)(?:功能|接口|系统|模块|代码|方案|能力|工作台|流程|服务|架构|开发|需求)/u;
const editAction = /(?:改图|编辑图片|修改图片|重绘|参考|基于|根据|变成|换成)/u;
const countWords = new Map([["一", 1], ["二", 2], ["两", 2], ["三", 3], ["四", 4]]);

const imageAttachments = (attachments) => (Array.isArray(attachments) ? attachments : [])
  .filter((attachment) => String(attachment?.mimeType || "").startsWith("image/"));

const countFrom = (text) => {
  const match = /([1-4一二两三四])\s*张/u.exec(text);
  if (!match) return 1;
  return Number(match[1]) || countWords.get(match[1]) || 1;
};

const sizeFrom = (text) => {
  const match = /(?:^|\s|[，,、（(])((?:\d{1,4})\s*[:：x×]\s*(?:\d{1,4}))(?=$|\s|[，,、。；;）)])/u.exec(text);
  return match
    ? match[1].replace(/[：×]/gu, (value) => value === "：" ? ":" : "x").replace(/\s+/gu, "")
    : "1:1";
};

const resolutionFrom = (text) => normalizeImageResolution(/\b([124])\s*k\b/iu.exec(text)?.[0] || "1K");

const cleanPrompt = (text, commandMatch) => text
  .slice(commandMatch?.[0]?.length || 0)
  .replace(/^[：:，,。；;\s]+/u, "")
  .trim();

export const intentForWebImageMessage = ({ text, attachments = [] } = {}) => {
  const source = String(text || "").trim();
  if (!source) return null;
  const references = imageAttachments(attachments);
  const explicit = explicitCommand.exec(source);
  const requested = explicit || requestCommand.exec(source)
    || (references.length && editAction.test(source) ? referenceCommand.exec(source) : null);
  if (!requested || (!explicit && (!imageTarget.test(source) || discussionTarget.test(source)))) return null;

  const prompt = cleanPrompt(source, requested);
  if (prompt.length < 2 || prompt.length > 8000) return null;
  const operation = references.length && editAction.test(source) ? "edit" : "generate";

  return {
    operation,
    prompt,
    resolution: resolutionFrom(source),
    size: sizeFrom(source),
    n: countFrom(source),
    referenceIds: operation === "edit" ? references.map((attachment) => attachment.id) : [],
  };
};
