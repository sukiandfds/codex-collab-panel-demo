import fs from "node:fs/promises";
import path from "node:path";

const STATUS_LABELS = {
  planned: "待处理",
  queued: "待处理",
  discovery: "调研中",
  in_progress: "进行中",
  waiting_input: "等待输入",
  waiting_approval: "等待确认",
  implemented_uncommitted: "已实现，未提交",
  implemented_pending_review: "待体验",
  accepted: "已确认",
  completed: "已完成",
  active: "正常",
  blocked: "已阻塞",
  paused: "已暂停",
  cancelled: "已取消",
  retired: "已替代",
};

const TYPE_LABELS = {
  feature: "功能",
  bug: "缺陷",
  maintenance: "维护",
  research: "调研",
  decision: "决策",
  delivery: "交付",
};

const CATEGORY_LABELS = {
  development: "开发任务",
  research: "调研任务",
  maintenance: "Bug 与维护",
  decision: "产品决策",
  delivery: "验证与交付",
  documentation: "项目资料与历史记录",
};

const CATEGORY_ORDER = [
  "调研任务",
  "开发任务",
  "Bug 与维护",
  "产品决策",
  "验证与交付",
  "项目资料与历史记录",
];

const stripQuotes = (value) => {
  const text = String(value || "").trim();
  return text.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, (_match, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
};

const parseScalar = (value) => {
  const text = stripQuotes(value);
  if (/^\[.*\]$/u.test(text)) {
    return text.slice(1, -1).split(",").map((item) => stripQuotes(item)).filter(Boolean);
  }
  if (text === "null" || text === "~") return null;
  return text;
};

const parseFrontMatter = (markdown) => {
  if (!markdown.startsWith("---")) return {};
  const lines = markdown.split(/\r?\n/u);
  const closingIndex = lines.findIndex((line, index) => index > 0 && /^---\s*$/u.test(line));
  if (closingIndex < 0) return {};
  return Object.fromEntries(lines.slice(1, closingIndex)
    .map((line) => line.match(/^([A-Za-z][\w-]*):\s*(.*)$/u))
    .filter(Boolean)
    .map(([, key, value]) => [key, parseScalar(value)]));
};

const cleanMarkdown = (value = "") => String(value)
  .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
  .replace(/`([^`]+)`/gu, "$1")
  .replace(/^[#>*-]\s*/gmu, "")
  .replace(/[\*_~]/gu, "")
  .replace(/\s+/gu, " ")
  .trim();

const firstUsefulLine = (section) => section
  .split(/\r?\n/u)
  .map((line) => cleanMarkdown(line))
  .filter(Boolean)
  .find((line) => !line.startsWith("|") && !/^```/u.test(line)) || "";

const sectionByHeading = (markdown, names) => {
  const wanted = names.map((name) => name.toLowerCase());
  const headings = [...markdown.matchAll(/^##\s+(.+?)\s*$/gmu)];
  const heading = headings.find((match) => wanted.some((name) => match[1].toLowerCase().includes(name)));
  if (!heading) return "";
  const start = heading.index + heading[0].length;
  const next = headings.find((match) => match.index > heading.index);
  return markdown.slice(start, next?.index).trim();
};

const splitTableRow = (line) => line.trim().replace(/^\|/u, "").replace(/\|$/u, "")
  .split("|").map((cell) => cleanMarkdown(cell));

const parseTable = (section) => {
  const lines = section.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line, index) => line.startsWith("|") && line.endsWith("|") && lines[index + 1]?.includes("---"));
  if (headerIndex < 0) return [];
  const headers = splitTableRow(lines[headerIndex]);
  return lines.slice(headerIndex + 2)
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) => {
      const values = splitTableRow(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    });
};

const valueFrom = (row, names) => {
  const key = Object.keys(row).find((candidate) => names.includes(candidate));
  return key ? row[key] : "";
};

const normalizeDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const normalized = text.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)(?:\s*)([+-]\d{2}:?\d{2})?$/u, "$1T$2$3");
  const candidate = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(normalized) ? normalized : `${normalized}+08:00`;
  const timestamp = Date.parse(candidate);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const timestamp = (value) => {
  const parsed = normalizeDate(value);
  return parsed === null ? String(value || "").trim() || null : new Date(parsed).toISOString();
};

const idsFrom = (value) => [...String(value || "").matchAll(/\b([A-Z][A-Z0-9]+-\d{3})\b/gu)].map((match) => match[1]);

const statusLabel = (status) => STATUS_LABELS[status] || status || "未记录";
const typeLabel = (type) => TYPE_LABELS[type] || type || "事项";
const categoryLabel = (category) => CATEGORY_LABELS[category] || category || "项目资料与历史记录";

const within = (root, target) => {
  const normalizedRoot = path.resolve(root).toLowerCase();
  const normalizedTarget = path.resolve(target).toLowerCase();
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
};

const readText = async (file) => {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
};

const parseUpdates = (markdown, fallback) => {
  const headings = [...markdown.matchAll(/^###\s+(.+?)\s*$/gmu)];
  const updates = headings.map((heading, index) => {
    const bodyStart = heading.index + heading[0].length;
    const bodyEnd = headings[index + 1]?.index ?? markdown.length;
    const body = markdown.slice(bodyStart, bodyEnd);
    const fields = {};
    for (const line of body.split(/\r?\n/u)) {
      const match = line.match(/^[-*]\s*([^：:]+)[：:]\s*(.*)$/u);
      if (match) fields[match[1].trim()] = cleanMarkdown(match[2]);
    }
    const change = fields["本次更新"] || firstUsefulLine(body) || "未记录本次更新";
    return {
      at: timestamp(heading[1]),
      status: fields["状态"] || fallback.status || "",
      statusLabel: statusLabel(fields["状态"] || fallback.status),
      change,
      userImpact: fields["用户影响"] || "未记录用户影响",
      evidence: fields["证据"] || "",
    };
  });
  if (updates.length) return updates;
  return [{
    at: timestamp(fallback.updatedAt),
    status: fallback.status || "",
    statusLabel: statusLabel(fallback.status),
    change: fallback.summary || "未记录更新",
    userImpact: "未记录用户影响",
    evidence: fallback.source || "",
  }];
};

const readEntry = async ({ dataRoot, row, details = false }) => {
  const id = valueFrom(row, ["条目编号", "项目编号", "ID"]);
  if (!/^([A-Z][A-Z0-9]+-\d{3})$/u.test(id)) return null;
  const folderValue = valueFrom(row, ["文件夹", "目录"]) || `items/${id}/`;
  const entryRoot = path.resolve(dataRoot, folderValue.replace(/[\\/]$/u, ""));
  if (!within(dataRoot, entryRoot)) return null;
  const itemPath = path.join(entryRoot, "item.md");
  const updatesPath = path.join(entryRoot, "updates.md");
  const [itemMarkdown, updatesMarkdown] = await Promise.all([readText(itemPath), readText(updatesPath)]);
  if (!itemMarkdown) return null;
  const frontMatter = parseFrontMatter(itemMarkdown);
  const status = String(frontMatter.status || "planned");
  const priority = frontMatter.priority || frontMatter.severity || valueFrom(row, ["优先级", "级别"]) || null;
  const title = String(frontMatter.title || valueFrom(row, ["名称", "条目", "功能"]) || id);
  const summary = firstUsefulLine(sectionByHeading(itemMarkdown, ["简短摘要", "摘要"])) || title;
  const updatedAt = timestamp(frontMatter.updated_at || frontMatter.last_updated || valueFrom(row, ["更新时间", "最近更新"]));
  const updates = parseUpdates(updatesMarkdown, { updatedAt, status, summary, source: frontMatter.source });
  const relatedItems = Array.isArray(frontMatter.related) ? frontMatter.related : idsFrom(frontMatter.related);
  const evidenceSection = sectionByHeading(itemMarkdown, ["当前证据", "证据", "文件与证据"]);
  const evidence = evidenceSection.split(/\r?\n/u).map((line) => cleanMarkdown(line)).filter(Boolean);
  if (frontMatter.source && !evidence.includes(frontMatter.source)) evidence.unshift(frontMatter.source);
  const category = categoryLabel(String(frontMatter.category || valueFrom(row, ["分类", "类别"]) || "documentation"));
  const latest = [...updates].sort((left, right) => (normalizeDate(right.at) || 0) - (normalizeDate(left.at) || 0))[0];
  const entry = {
    id,
    type: String(frontMatter.type || "feature"),
    typeLabel: typeLabel(String(frontMatter.type || "feature")),
    category,
    title,
    summary,
    priority: priority ? String(priority) : null,
    status,
    statusLabel: statusLabel(status),
    updatedAt: latest?.at || updatedAt,
    updateSummary: latest?.change || summary,
    userQuote: firstUsefulLine(sectionByHeading(itemMarkdown, ["用户原话"])) || "当前条目未记录原始用户原话。",
    initialAnalysis: firstUsefulLine(sectionByHeading(itemMarkdown, ["助手初步理解", "初步理解"])) || "当前条目未记录助手对用户字面意思的初步理解。",
    concreteContent: sectionByHeading(itemMarkdown, ["具体内容"]) || "当前条目未记录具体内容。",
    expectedEffect: sectionByHeading(itemMarkdown, ["预计效果", "用户可见结果"]) || "当前条目未记录预计效果。",
    relatedItems: [...new Set(relatedItems.filter((relatedId) => relatedId !== id))],
    sourcePath: path.relative(dataRoot, itemPath).replaceAll(path.sep, "/"),
    updatesPath: path.relative(dataRoot, updatesPath).replaceAll(path.sep, "/"),
    updates,
    evidence,
  };
  if (details) return entry;
  const { userQuote: _userQuote, initialAnalysis: _initialAnalysis, concreteContent: _concreteContent,
    expectedEffect: _expectedEffect, relatedItems: _relatedItems, sourcePath: _sourcePath,
    updatesPath: _updatesPath, evidence: _evidence, updates: allUpdates, ...summaryEntry } = entry;
  const latestUpdate = [...allUpdates].sort((left, right) => (normalizeDate(right.at) || 0) - (normalizeDate(left.at) || 0))[0];
  return { ...summaryEntry, updates: latestUpdate ? [latestUpdate] : [] };
};

const readProject = (markdown, project, stat) => {
  const frontMatter = parseFrontMatter(markdown);
  const status = String(frontMatter.status || "active");
  return {
    id: String(frontMatter.project_id || project),
    title: String(frontMatter.title || project),
    status,
    statusLabel: statusLabel(status),
    health: status === "blocked" ? "blocked" : status === "active" ? "normal" : status,
    goal: firstUsefulLine(sectionByHeading(markdown, ["项目目标", "目标"])) || "未记录项目目标。",
    phase: firstUsefulLine(sectionByHeading(markdown, ["当前阶段", "阶段"])) || "未记录当前阶段。",
    lead: String(frontMatter.owner || frontMatter.lead || "未记录"),
    updatedAt: timestamp(frontMatter.last_updated || frontMatter.updated_at) || stat.mtime.toISOString(),
    source: "PROJECT.md",
  };
};

const readIndex = async (dataRoot) => {
  const indexPath = path.join(dataRoot, "INDEX.md");
  const [indexMarkdown, indexStat] = await Promise.all([
    fs.readFile(indexPath, "utf8"),
    fs.stat(indexPath),
  ]);
  return { indexMarkdown, indexStat };
};

export const readProjectManagementEntry = async ({ projectRoot, entryId }) => {
  const dataRoot = path.resolve(projectRoot, "docs", "project-management");
  const { indexMarkdown } = await readIndex(dataRoot);
  const row = parseTable(sectionByHeading(indexMarkdown, ["条目目录", "项目条目", "工作项目录"]))
    .find((candidate) => valueFrom(candidate, ["条目编号", "项目编号", "ID"]) === entryId);
  const entry = row ? await readEntry({ dataRoot, row, details: true }) : null;
  if (!entry) {
    const error = new Error("项目管理条目不存在");
    error.statusCode = 404;
    throw error;
  }
  return entry;
};

export const readProjectManagement = async ({ project, projectRoot }) => {
  const dataRoot = path.resolve(projectRoot, "docs", "project-management");
  const projectPath = path.join(dataRoot, "PROJECT.md");
  const indexPath = path.join(dataRoot, "INDEX.md");
  const [projectMarkdown, indexMarkdown, projectStat, indexStat] = await Promise.all([
    fs.readFile(projectPath, "utf8"),
    fs.readFile(indexPath, "utf8"),
    fs.stat(projectPath),
    fs.stat(indexPath),
  ]);
  const indexRows = parseTable(sectionByHeading(indexMarkdown, ["条目目录", "项目条目", "工作项目录"]));
  const entries = (await Promise.all(indexRows.map((row) => readEntry({ dataRoot, row })))).filter(Boolean);
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const planIds = idsFrom(sectionByHeading(indexMarkdown, ["当前计划", "计划"]));
  const inProgressIds = idsFrom(sectionByHeading(indexMarkdown, ["当前进行中", "进行中"]));
  const plan = [...new Set(planIds)].map((id) => entryById.get(id)).filter(Boolean);
  const inProgress = [...new Set(inProgressIds)].map((id) => entryById.get(id)).filter(Boolean);
  const recentUpdates = entries.flatMap((entry) => entry.updates.map((update) => ({
    ...update,
    entryId: entry.id,
    title: entry.title,
    category: entry.category,
    priority: entry.priority,
  }))).sort((left, right) => (normalizeDate(right.at) || 0) - (normalizeDate(left.at) || 0));
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.category)) grouped.set(entry.category, []);
    grouped.get(entry.category).push(entry);
  }
  const categories = [...new Set([...CATEGORY_ORDER, ...grouped.keys()])]
    .map((name) => ({ name, entries: grouped.get(name) || [] }))
    .filter((category) => category.entries.length);
  const projectUpdatedAt = readProject(projectMarkdown, project, projectStat).updatedAt;
  const updatedAt = [projectUpdatedAt, indexStat.mtime.toISOString(), ...entries.map((entry) => entry.updatedAt)]
    .map(normalizeDate).filter((value) => value !== null).sort((left, right) => right - left)[0];
  return {
    project: readProject(projectMarkdown, project, projectStat),
    plan,
    inProgress,
    categories,
    entries,
    recentUpdates,
    stats: {
      total: entries.length,
      inProgress: inProgress.length,
      blocked: entries.filter((entry) => entry.status === "blocked").length,
      completed: entries.filter((entry) => ["completed", "accepted"].includes(entry.status)).length,
    },
    updatedAt: updatedAt === undefined ? indexStat.mtime.toISOString() : new Date(updatedAt).toISOString(),
    source: "docs/project-management",
  };
};
