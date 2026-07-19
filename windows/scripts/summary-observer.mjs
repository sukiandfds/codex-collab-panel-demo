import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const port = Number(getArg("--port", "9350"));
const initialThreadId = getArg("--thread-id");
const summaryModel = getArg("--model", "gpt-5.6-luna");
const codexRoot = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const sessionRoot = process.env.CODEX_SESSION_DIR || path.join(os.homedir(), ".codex", "sessions");
const state = {
  service: true,
  connected: false,
  sourceFile: "",
  userMessages: 0,
  assistantMessages: 0,
  lastRole: "",
  lastPreview: "",
  lastUserPreview: "",
  lastAssistantPreview: "",
  lastUpdated: null,
  error: "",
  threadId: initialThreadId,
  summary: "",
  summaryStatus: "waiting",
  summaryModel,
  summaryUpdated: null,
  summaryElapsedMs: null,
  summaryInputTokens: null,
  summaryOutputTokens: null,
  summaryError: "",
};
let activeFile = "";
let activeThreadId = initialThreadId;
let offset = 0;
let carry = "";
const seen = new Set();
const recentMessages = [];
let summaryDueAt = 0;
let summarizing = false;
let lastSummaryKey = "";
let threadRevision = 0;
let scanRunning = false;

const textFrom = (value, depth = 0) => {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => textFrom(item, depth + 1)).filter(Boolean).join(" ");
  if (typeof value !== "object") return "";
  const preferred = ["text", "input_text", "output_text", "message", "content", "summary"];
  for (const key of preferred) {
    if (key in value) {
      const text = textFrom(value[key], depth + 1);
      if (text) return text;
    }
  }
  return "";
};

const normalizeMessage = (value) => value.replace(/\s+/g, " ").trim().slice(0, 1200);

const recordMessage = (role, payload) => {
  const text = normalizeMessage(textFrom(payload));
  if (!text) return;
  const key = `${role}:${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > 200) seen.delete(seen.values().next().value);
  if (role === "user") state.userMessages += 1;
  if (role === "assistant") state.assistantMessages += 1;
  const preview = text.slice(0, 180);
  if (role === "user") state.lastUserPreview = preview;
  if (role === "assistant") state.lastAssistantPreview = preview;
  recentMessages.push({ role, text });
  if (recentMessages.length > 16) recentMessages.shift();
  summaryDueAt = Date.now() + 12000;
  state.summaryStatus = "waiting";
  state.lastRole = role;
  state.lastPreview = preview;
  state.lastUpdated = new Date().toISOString();
};

const switchThread = (nextThreadId) => {
  const normalized = String(nextThreadId || "").replace(/^local:/, "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(normalized) || normalized === activeThreadId) return false;
  activeThreadId = normalized;
  threadRevision += 1;
  activeFile = "";
  offset = 0;
  carry = "";
  seen.clear();
  recentMessages.length = 0;
  summaryDueAt = 0;
  summarizing = false;
  lastSummaryKey = "";
  Object.assign(state, {
    connected: false,
    sourceFile: "",
    userMessages: 0,
    assistantMessages: 0,
    lastRole: "",
    lastPreview: "",
    lastUserPreview: "",
    lastAssistantPreview: "",
    lastUpdated: null,
    error: "",
    threadId: normalized,
    summary: "",
    summaryStatus: "waiting",
    summaryUpdated: null,
    summaryElapsedMs: null,
    summaryInputTokens: null,
    summaryOutputTokens: null,
    summaryError: "",
  });
  return true;
};

const parseStringSetting = (text, key) => {
  const match = new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m").exec(text);
  return match?.[1] || "";
};

const loadApiConfig = async () => {
  const [configText, authText, modelsText] = await Promise.all([
    fs.readFile(path.join(codexRoot, "config.toml"), "utf8"),
    fs.readFile(path.join(codexRoot, "auth.json"), "utf8"),
    fs.readFile(path.join(codexRoot, "models_cache.json"), "utf8"),
  ]);
  const provider = parseStringSetting(configText, "model_provider");
  if (!provider) throw new Error("Codex model_provider is missing");
  const escapedProvider = provider.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  const section = new RegExp(`\\[model_providers\\.${escapedProvider}\\]([\\s\\S]*?)(?=\\n\\[|$)`).exec(configText)?.[1] || "";
  const baseUrl = parseStringSetting(section, "base_url").replace(/\/$/, "");
  if (!baseUrl) throw new Error(`base_url is missing for provider ${provider}`);
  const auth = JSON.parse(authText);
  const apiKey = auth.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Codex OPENAI_API_KEY is missing");
  const models = JSON.parse(modelsText)?.models || [];
  if (!models.some((model) => model.slug === summaryModel)) {
    throw new Error(`${summaryModel} is not available in the Codex model cache`);
  }
  return { provider, baseUrl, apiKey };
};

const responseText = (payload) => (payload?.output || [])
  .flatMap((item) => item?.content || [])
  .map((item) => item?.text || "")
  .filter(Boolean)
  .join("\n")
  .trim();

const updateSummary = async () => {
  const summaryKey = `${state.userMessages}:${state.assistantMessages}:${state.lastUserPreview}:${state.lastAssistantPreview}`;
  if (summarizing || state.lastRole !== "assistant" || summaryKey === lastSummaryKey || recentMessages.length < 2) return;
  summarizing = true;
  const revision = threadRevision;
  lastSummaryKey = summaryKey;
  state.summaryStatus = "summarizing";
  state.summaryError = "";
  const transcript = recentMessages.map((item) => `${item.role === "user" ? "用户" : "Codex"}：${item.text}`).join("\n");
  const prompt = [
    "你是跟随 Codex 开发过程的研发记录员。只记录对话中已经出现的事实，不提出新方案，不替用户做决定。",
    "必须区分闲聊、设想、明确需求和已确认决定。用户没有明确确认的内容只能放入‘待讨论’，不能写成需求或决定。",
    "必须区分尝试、完成、验证成功和失败。没有测试或证据时，不得写成已验证成功。",
    "请用简洁中文固定输出八项：当前主题、用户需求与确认、AI执行与进度、已完成与验证、问题与风险、待办、待讨论、经验与关联上下文。没有内容写‘暂无’。",
    "‘经验’只记录已经发生的成功方法、失败原因或用户纠正；‘关联上下文’只能引用最近对话或上一版记录中已经出现的资料、决策和来源，不能假装完成外部检索。",
    "只输出适合窄侧边栏阅读的纯文本，不使用 Markdown 粗体、标题符号或代码块。每项最多两条，每条一行，总长度控制在 1200 个中文字符以内。",
    state.summary ? `上一版摘要：\n${state.summary}` : "上一版摘要：暂无",
    `最近对话：\n${transcript}`,
  ].join("\n\n");
  const startedAt = Date.now();
  try {
    const api = await loadApiConfig();
    const response = await fetch(`${api.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${api.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: summaryModel,
        input: prompt,
        reasoning: { effort: "low" },
        max_output_tokens: 520,
        store: false,
      }),
    });
    const payload = await response.json();
    if (revision !== threadRevision) return;
    if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
    const text = responseText(payload);
    if (!text) throw new Error("Summary model returned no text");
    state.summary = text;
    state.summaryStatus = "ready";
    state.summaryUpdated = new Date().toISOString();
    state.summaryElapsedMs = Date.now() - startedAt;
    state.summaryInputTokens = payload?.usage?.input_tokens ?? null;
    state.summaryOutputTokens = payload?.usage?.output_tokens ?? null;
  } catch (error) {
    if (revision !== threadRevision) return;
    state.summaryStatus = "error";
    state.summaryError = error instanceof Error ? error.message : String(error);
  } finally {
    if (revision === threadRevision) summarizing = false;
  }
};

const maybeSummarize = () => {
  if (summaryDueAt && Date.now() >= summaryDueAt) {
    summaryDueAt = 0;
    void updateSummary();
  }
};

const processLine = (line) => {
  if (!line.trim()) return;
  let item;
  try { item = JSON.parse(line); } catch { return; }
  const payload = item?.payload;
  if (item?.type === "response_item" && payload?.type === "message" &&
      (payload.role === "user" || payload.role === "assistant")) {
    recordMessage(payload.role, payload.content);
    return;
  }
  if (item?.type === "event_msg" && payload?.type === "user_message") {
    recordMessage("user", payload);
  } else if (item?.type === "event_msg" && payload?.type === "agent_message") {
    recordMessage("assistant", payload);
  }
};

const walk = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(fullPath);
  }
  return files;
};

const findLatestSession = async (selectedThreadId) => {
  const allFiles = await walk(sessionRoot);
  const files = selectedThreadId ? allFiles.filter((file) => path.basename(file).includes(selectedThreadId)) : allFiles;
  if (selectedThreadId && files.length === 0) throw new Error(`No session JSONL found for thread ${selectedThreadId}`);
  const stats = await Promise.all(files.map(async (file) => ({ file, stat: await fs.stat(file) })));
  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return stats[0]?.file || "";
};

const scan = async () => {
  if (scanRunning) return;
  scanRunning = true;
  const revision = threadRevision;
  const selectedThreadId = activeThreadId;
  let handle;
  try {
    const file = await findLatestSession(selectedThreadId);
    if (revision !== threadRevision) return;
    if (!file) throw new Error("No Codex session JSONL found");
    if (file !== activeFile) {
      activeFile = file;
      offset = 0;
      carry = "";
      state.sourceFile = path.basename(file);
    }
    handle = await fs.open(file, "r");
    const stat = await handle.stat();
    if (revision !== threadRevision) return;
    if (stat.size < offset) offset = 0;
    const length = stat.size - offset;
    if (length > 0) {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      if (revision !== threadRevision) return;
      offset = stat.size;
      const lines = (carry + buffer.toString("utf8")).split(/\r?\n/);
      carry = lines.pop() || "";
      lines.forEach(processLine);
    }
    state.connected = true;
    state.error = "";
    maybeSummarize();
  } catch (error) {
    if (revision !== threadRevision) return;
    state.connected = false;
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    await handle?.close().catch(() => {});
    scanRunning = false;
  }
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  if (requestUrl.pathname !== "/status") {
    response.writeHead(404);
    response.end();
    return;
  }
  const requestedThreadId = requestUrl.searchParams.get("threadId");
  if (requestedThreadId && switchThread(requestedThreadId)) setTimeout(scan, 0);
  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(state));
});

await scan();
setInterval(scan, 900);
server.listen(port, "127.0.0.1", () => {
  console.log(`[summary-observer] listening on http://127.0.0.1:${port}/status`);
  console.log(`[summary-observer] session root: ${sessionRoot}`);
});

const shutdown = async () => {
  server.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
