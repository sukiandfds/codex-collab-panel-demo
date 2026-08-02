import fs from "node:fs/promises";
import path from "node:path";

const statusLabels = {
  discovery: "调研中",
  planned: "待处理",
  in_progress: "进行中",
  implemented_uncommitted: "已实现，未提交",
  implemented_pending_review: "待体验",
  accepted: "已确认",
  paused: "已暂停",
  blocked: "已阻塞",
  retired: "已替代",
};

const categoryById = {
  "FEAT-001": "开发任务",
  "FEAT-002": "开发任务",
  "FEAT-003": "开发任务",
  "FEAT-004": "验证与交付",
  "FEAT-005": "调研任务",
  "FEAT-006": "Bug 与维护",
  "FEAT-007": "验证与交付",
  "FEAT-008": "验证与交付",
  "FEAT-009": "开发任务",
};

const categoryOrder = ["调研任务", "开发任务", "Bug 与维护", "产品决策", "验证与交付", "项目资料与历史记录"];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cleanMarkdown = (value = "") => value
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/`([^`]+)`/g, "$1")
  .replace(/[\*~]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const truncate = (value, max = 180) => value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;

const splitTableRow = (line) => line
  .trim()
  .replace(/^\|/, "")
  .replace(/\|$/, "")
  .split("|")
  .map((cell) => cleanMarkdown(cell));

const parseTable = (markdown) => {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => line.startsWith("|") && line.endsWith("|"));
  if (headerIndex < 0 || !lines[headerIndex + 1]?.includes("---")) return [];
  const headers = splitTableRow(lines[headerIndex]);
  return lines.slice(headerIndex + 2)
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) => {
      const values = splitTableRow(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    });
};

const extractSection = (markdown, heading) => {
  const marker = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "m");
  const match = marker.exec(markdown);
  if (!match) return "";
  const start = match.index + match[0].length;
  const remainder = markdown.slice(start);
  const nextHeading = /^##\s+/m.exec(remainder);
  return remainder.slice(0, nextHeading ? nextHeading.index : undefined).trim();
};

const extractSectionByIncludes = (markdown, headings) => {
  for (const heading of headings) {
    const exact = extractSection(markdown, heading);
    if (exact) return exact;
  }
  const headingPattern = /^##\s+(.+)$/gm;
  let match;
  while ((match = headingPattern.exec(markdown))) {
    if (!headings.some((heading) => match[1].includes(heading))) continue;
    const start = match.index + match[0].length;
    const remainder = markdown.slice(start);
    const nextHeading = /^##\s+/m.exec(remainder);
    return remainder.slice(0, nextHeading ? nextHeading.index : undefined).trim();
  }
  return "";
};

const firstUsefulLines = (section, maxLines = 3) => section
  .split(/\r?\n/)
  .map((line) => cleanMarkdown(line.replace(/^[-*]\s+/, "")))
  .filter((line) => line && !line.startsWith("|") && !line.startsWith("```"))
  .slice(0, maxLines)
  .join(" ");

const parseFrontMatter = (markdown) => {
  if (!markdown.startsWith("---")) return {};
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return {};
  return Object.fromEntries(markdown.slice(3, end)
    .split(/\r?\n/)
    .map((line) => line.match(/^([^:]+):\s*(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key.trim(), value.trim()]));
};

const normalizeDate = (value) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;
  const withT = cleaned.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/, "$1T$2");
  const candidate = /[zZ]|[+-]\d{2}:?\d{2}$/.test(withT) ? withT : `${withT}+08:00`;
  const time = Date.parse(candidate);
  return Number.isNaN(time) ? null : time;
};

const normalizeTimestampText = (value) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "未记录";
  const withoutStatus = cleaned.split("|")[0].trim();
  const time = normalizeDate(withoutStatus);
  if (!time) return withoutStatus;
  return new Date(time).toISOString();
};

const extractIds = (value) => [...String(value || "").matchAll(/(?:FEAT|BUG|RESEARCH|PROC)-\d{3}(?:-I\d+)?/g)].map((match) => match[0]);

const parseTimeline = (markdown, fallback) => {
  const section = extractSection(markdown, "版本时间线");
  const headings = [...section.matchAll(/^###\s+(.+)$/gm)];
  const updates = headings.map((match, index) => {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = headings[index + 1]?.index ?? section.length;
    const headingParts = match[1].split("|").map((part) => part.trim());
    const atText = headingParts[0] || "";
    const status = headingParts[2] || "";
    const body = firstUsefulLines(section.slice(bodyStart, bodyEnd), 5);
    return {
      at: normalizeTimestampText(atText),
      status,
      statusLabel: statusLabels[status] || status || "未记录",
      change: body || "版本记录未提供变更摘要",
    };
  });
  if (updates.length) return updates;
  return [{
    at: normalizeTimestampText(fallback.updatedAt),
    status: fallback.status,
    statusLabel: statusLabels[fallback.status] || fallback.status,
    change: fallback.summary || "功能索引已更新",
  }];
};

const parsePriorityMap = (indexMarkdown) => {
  const rows = parseTable(extractSection(indexMarkdown, "当前待办开发顺序"));
  const result = new Map();
  for (const row of rows) {
    const priority = row["顺序"] || "";
    if (!/^P\d+$/u.test(priority)) continue;
    for (const id of extractIds(row["功能项目"])) {
      const featureId = id.match(/^FEAT-\d{3}/)?.[0];
      if (!featureId) continue;
      const previous = result.get(featureId);
      if (!previous || priority.localeCompare(previous, undefined, { numeric: true }) < 0) result.set(featureId, priority);
    }
  }
  return result;
};

const readFeature = async (projectRoot, row, indexMarkdown, priorityMap) => {
  const id = row["功能编号"] || "";
  const recordValue = String(row["记录"] || "");
  const recordMatch = recordValue.match(/(?:features[\\/])?([^\\/]+\.md)$/i);
  const recordName = recordMatch?.[1] || `${id}.md`;
  const relativeRecordPath = recordName.includes("/") ? recordName : `features/${recordName}`;
  const featurePath = path.resolve(projectRoot, "docs", "feature-development", relativeRecordPath);
  const featureRoot = path.resolve(projectRoot, "docs", "feature-development");
  const safePath = featurePath.toLowerCase().startsWith(`${featureRoot.toLowerCase()}${path.sep}`) ? featurePath : null;
  let markdown = "";
  if (safePath) {
    try { markdown = await fs.readFile(safePath, "utf8"); } catch { markdown = ""; }
  }
  const frontMatter = parseFrontMatter(markdown);
  const currentSnapshot = firstUsefulLines(extractSection(markdown, "当前快照"), 5);
  const userVisible = firstUsefulLines(extractSectionByIncludes(markdown, ["用户可见结果", "用户实际需要", "产品目标", "当前目标"]), 5);
  const goal = firstUsefulLines(extractSection(markdown, "目标与边界"), 5);
  const nextStep = firstUsefulLines(extractSection(markdown, "下一步"), 3);
  const summary = truncate(row["当前结论"] || currentSnapshot || userVisible || row["功能"] || "未记录摘要");
  const updates = parseTimeline(markdown, { ...row, status: row["当前状态"], summary });
  const relatedIds = [...new Set([
    ...extractIds(markdown),
    ...extractIds(row["当前结论"]),
  ])].filter((relatedId) => relatedId !== id);
  const status = frontMatter.status || row["当前状态"] || "planned";
  const updatedAt = row["最近更新"] || frontMatter.last_updated || "";
  const userQuote = firstUsefulLines(extractSection(markdown, "用户原话"), 5);
  const initialAnalysis = firstUsefulLines(extractSection(markdown, "助手初步理解"), 5);
  return {
    id,
    type: id.startsWith("FEAT-") ? "功能" : id.startsWith("BUG-") ? "Bug" : "事项",
    category: categoryById[id] || "项目资料与历史记录",
    title: row["功能"] || frontMatter.title || id,
    summary,
    level: priorityMap.get(id) || null,
    status,
    statusLabel: statusLabels[status] || status,
    updatedAt,
    updateSummary: updates.at(-1)?.change || summary,
    userQuote: userQuote || "当前功能文档未记录原始用户原话",
    initialAnalysis: initialAnalysis || "当前功能文档未记录助手对用户字面意思的初步理解，待补录。",
    concreteContent: [currentSnapshot ? `当前体验：${currentSnapshot}` : "当前体验：未记录", goal ? `本次范围：${goal}` : nextStep ? `本次范围：${nextStep}` : "本次范围：未记录"].join("\n\n"),
    expectedEffect: userVisible ? `修改后体验：${userVisible}` : "修改后体验：功能文档未记录用户可见效果。",
    relatedItems: relatedIds,
    sourcePath: relativeRecordPath,
    updates,
    evidence: [relativeRecordPath, "FEATURE_INDEX.md"],
    sourceStatus: frontMatter.status || row["当前状态"] || "未记录",
    indexExcerpt: indexMarkdown.includes(id) ? row["当前结论"] || "" : "",
  };
};

export const readProjectProgress = async ({ project, projectRoot, progressFile }) => {
  const [markdown, stat] = await Promise.all([
    fs.readFile(progressFile, "utf8"),
    fs.stat(progressFile),
  ]);
  const rows = parseTable(extractSection(markdown, "当前功能"));
  const priorityMap = parsePriorityMap(markdown);
  const entries = await Promise.all(rows.map((row) => readFeature(projectRoot, row, markdown, priorityMap)));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const todoRows = parseTable(extractSection(markdown, "当前待办开发顺序"));
  const plannedIds = todoRows.flatMap((row) => extractIds(row["功能项目"]))
    .map((id) => id.match(/^FEAT-\d{3}/)?.[0] || id);
  const plan = [...new Set(plannedIds)].map((id) => entryById.get(id)).filter(Boolean);
  const inProgress = entries.filter((entry) => entry.status === "in_progress");
  const logs = entries.flatMap((entry) => entry.updates.map((update) => ({
    ...update,
    entryId: entry.id,
    title: entry.title,
    category: entry.category,
    level: entry.level,
  })))
    .sort((a, b) => (normalizeDate(b.at) || 0) - (normalizeDate(a.at) || 0));
  const categories = categoryOrder.map((name) => ({
    name,
    entries: entries.filter((entry) => entry.category === name),
  })).filter((category) => category.entries.length);
  return {
    project,
    markdown,
    updatedAt: stat.mtime.toISOString(),
    source: "docs/feature-development/FEATURE_INDEX.md",
    plan,
    inProgress,
    categories,
    entries,
    logs,
  };
};
