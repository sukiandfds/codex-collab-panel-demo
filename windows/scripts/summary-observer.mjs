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
const threadId = getArg("--thread-id");
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
  threadId,
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
let offset = 0;
let carry = "";
const seen = new Set();
const recentMessages = [];
let summaryDueAt = 0;
let summarizing = false;
let lastSummaryKey = "";

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

const normalizePreview = (value) => value.replace(/\s+/g, " ").trim().slice(0, 180);

const recordMessage = (role, payload) => {
  const text = normalizePreview(textFrom(payload));
  if (!text) return;
  const key = `${role}:${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > 200) seen.delete(seen.values().next().value);
  if (role === "user") state.userMessages += 1;
  if (role === "assistant") state.assistantMessages += 1;
  if (role === "user") state.lastUserPreview = text;
  if (role === "assistant") state.lastAssistantPreview = text;
  recentMessages.push({ role, text });
  if (recentMessages.length > 12) recentMessages.shift();
  summaryDueAt = Date.now() + 12000;
  state.summaryStatus = "waiting";
  state.lastRole = role;
  state.lastPreview = text;
  state.lastUpdated = new Date().toISOString();
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
  lastSummaryKey = summaryKey;
  state.summaryStatus = "summarizing";
  state.summaryError = "";
  const transcript = recentMessages.map((item) => `${item.role === "user" ? "用户" : "Codex"}：${item.text}`).join("\n");
  const prompt = [
    "你是 Codex 项目的会议记录员，只总结需求与结论，不提出新方案。",
    "请用简洁中文输出四项：当前目标、已确认、进行中、待确认。没有内容写‘暂无’。",
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
        max_output_tokens: 240,
        store: false,
      }),
    });
    const payload = await response.json();
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
    state.summaryStatus = "error";
    state.summaryError = error instanceof Error ? error.message : String(error);
  } finally {
    summarizing = false;
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

const findLatestSession = async () => {
  const allFiles = await walk(sessionRoot);
  const files = threadId ? allFiles.filter((file) => path.basename(file).includes(threadId)) : allFiles;
  if (threadId && files.length === 0) throw new Error(`No session JSONL found for thread ${threadId}`);
  const stats = await Promise.all(files.map(async (file) => ({ file, stat: await fs.stat(file) })));
  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return stats[0]?.file || "";
};

const scan = async () => {
  try {
    const file = await findLatestSession();
    if (!file) throw new Error("No Codex session JSONL found");
    if (file !== activeFile) {
      activeFile = file;
      offset = 0;
      carry = "";
      state.sourceFile = path.basename(file);
    }
    const handle = await fs.open(file, "r");
    const stat = await handle.stat();
    if (stat.size < offset) offset = 0;
    const length = stat.size - offset;
    if (length > 0) {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      offset = stat.size;
      const lines = (carry + buffer.toString("utf8")).split(/\r?\n/);
      carry = lines.pop() || "";
      lines.forEach(processLine);
    }
    await handle.close();
    state.connected = true;
    state.error = "";
    maybeSummarize();
  } catch (error) {
    state.connected = false;
    state.error = error instanceof Error ? error.message : String(error);
  }
};

const server = http.createServer((request, response) => {
  if (request.url !== "/status") {
    response.writeHead(404);
    response.end();
    return;
  }
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
