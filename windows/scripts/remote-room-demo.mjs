import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const port = Number(getArg("--port", "9360"));
const observerPort = Number(getArg("--observer-port", "9350"));
const project = getArg("--project", "codex-collab-panel-demo");
const projectRoot = path.resolve(getArg("--project-root", process.cwd()));
const token = getArg("--token", randomBytes(12).toString("hex"));
const sessionRoot = process.env.CODEX_SESSION_DIR || path.join(os.homedir(), ".codex", "sessions");
const happyLogRoot = path.join(os.homedir(), ".happy", "logs");

const clients = new Set();
const sessionCache = new Map();
const listCache = new Map();
let happyTitleCache = { expiresAt: 0, value: new Map() };
let lastPayload = "";

const textFrom = (value, depth = 0) => {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => textFrom(item, depth + 1)).filter(Boolean).join(" ");
  if (typeof value !== "object") return "";
  for (const key of ["text", "input_text", "output_text", "message", "content", "summary"]) {
    if (key in value) {
      const text = textFrom(value[key], depth + 1);
      if (text) return text;
    }
  }
  return "";
};

const clean = (value, limit = 4000) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);

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

const loadHappyTitles = async () => {
  if (happyTitleCache.expiresAt > Date.now()) return happyTitleCache.value;
  const titles = new Map();
  try {
    const entries = await fs.readdir(happyLogRoot, { withFileTypes: true });
    const logFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map((entry) => path.join(happyLogRoot, entry.name))
      .sort();
    for (const file of logFiles) {
      const raw = await fs.readFile(file, "utf8");
      let activeThreadId = "";
      for (const line of raw.split(/\r?\n/)) {
        const threadMatch = /^\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[CodexAppServer\] Thread (?:started|resumed): ([0-9a-f-]{36})\s*$/i.exec(line);
        if (threadMatch) {
          activeThreadId = threadMatch[1];
          continue;
        }
        const titleMatch = /^\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[happyMCP\] Changing title to: (.+?)\s*$/.exec(line);
        if (activeThreadId && titleMatch) titles.set(activeThreadId, clean(titleMatch[1], 100));
      }
    }
  } catch {}
  happyTitleCache = { expiresAt: Date.now() + 30000, value: titles };
  return titles;
};

const messageFrom = (item) => {
  const payload = item?.payload;
  if (item?.type === "response_item" && payload?.type === "message" && ["user", "assistant"].includes(payload.role) &&
      (payload.role !== "assistant" || !payload.phase || payload.phase === "final_answer")) {
    return { role: payload.role, text: clean(textFrom(payload.content)) };
  }
  if (item?.type === "event_msg" && payload?.type === "user_message") return { role: "user", text: clean(textFrom(payload)) };
  if (item?.type === "event_msg" && payload?.type === "agent_message" && payload?.phase === "final_answer") {
    return { role: "assistant", text: clean(textFrom(payload)) };
  }
  return null;
};

const isUsefulUserMessage = (text) => text &&
  !text.includes("<codex_delegation>") &&
  !text.startsWith("# AGENTS.md") &&
  !text.startsWith("# Options") &&
  !text.startsWith("<environment_context>") &&
  !text.startsWith("Warning: apply_patch was requested via shell") &&
  !text.startsWith("Warning: apply_patch was requested via exec_command");

const sameProject = (cwd) => cwd && path.resolve(cwd).toLowerCase() === projectRoot.toLowerCase();

const parseSession = async (file) => {
  const stat = await fs.stat(file);
  const cached = sessionCache.get(file);
  const signature = `${stat.size}:${stat.mtimeMs}`;
  if (cached?.signature === signature) return cached.value;

  const raw = await fs.readFile(file, "utf8");
  const messages = [];
  let cwd = "";
  let cliVersion = "";
  let lastKey = "";
  for (const line of raw.split(/\r?\n/)) {
    try {
      const item = JSON.parse(line);
      if (item?.type === "session_meta") {
        cwd = item.payload?.cwd || "";
        cliVersion = item.payload?.cli_version || "";
      }
      const message = messageFrom(item);
      if (message?.text && (message.role !== "user" || isUsefulUserMessage(message.text))) {
        const key = `${message.role}:${message.text}`;
        if (key !== lastKey) messages.push(message);
        lastKey = key;
      }
    } catch {}
  }

  const name = path.basename(file);
  const threadId = name.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0] || name;
  const useful = messages;
  const firstUser = useful.find((item) => item.role === "user")?.text || "";
  const latestUser = [...useful].reverse().find((item) => item.role === "user")?.text || "";
  const latestAssistant = [...useful].reverse().find((item) => item.role === "assistant")?.text || "";
  const compactTitle = (value) => {
    const text = clean(value, 160).replace(/^引用消息[：:]\s*/u, "");
    const head = text.split(/[。！？；;，,\n]/u)[0].trim();
    const candidate = head || text;
    return candidate.length > 44 ? `${candidate.slice(0, 44)}…` : candidate;
  };
  const titleSource = `${firstUser}\n${latestUser}\n${latestAssistant}`.toLowerCase();
  const titleRules = [
    { keywords: ["happy coder", "happy codex", "手机", "移动"], title: "Happy Coder 手机接入与使用" },
    { keywords: ["cloudflare", "公网", "实时同步", "网页", "网页端"], title: "项目网页展示与实时同步" },
    { keywords: ["总结", "摘要", "研发记录", "summary"], title: "研发总结与项目状态" },
    { keywords: ["codex", "协作面板", "collab panel", "侧边栏"], title: "Codex 协作面板与状态同步" },
    { keywords: ["运行一下", "启动", "运行", "连接"], title: "Happy Coder 启动与连接验证" },
    { keywords: ["test", "测试"], title: "连接测试与网页验证" },
  ];
  const title = titleRules
    .map((rule) => ({ ...rule, score: rule.keywords.filter((keyword) => titleSource.includes(keyword)).length }))
    .sort((left, right) => right.score - left.score)[0]?.score
    ? titleRules
      .map((rule) => ({ ...rule, score: rule.keywords.filter((keyword) => titleSource.includes(keyword)).length }))
      .sort((left, right) => right.score - left.score)[0].title
    : compactTitle(firstUser || latestUser || latestAssistant || threadId) || "未命名会话";
  const source = cliVersion === "0.122.0" ? "happy" : "codex";
  const value = {
    threadId,
    file: name,
    cwd,
    source,
    projectMatch: sameProject(cwd),
    title,
    updatedAt: stat.mtime.toISOString(),
    messages: useful,
    messageCount: useful.length,
    latestUser,
    latestAssistant,
  };
  sessionCache.set(file, { signature, value });
  return value;
};

const listSessions = async (source = "all") => {
  const cacheKey = source || "all";
  const cached = listCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.value;

  const [files, happyTitles] = await Promise.all([walk(sessionRoot), loadHappyTitles()]);
  const sessions = await Promise.all(files.map(parseSession));
  const value = sessions
    .filter((session) => session.projectMatch && session.messages.length && (source === "all" || session.source === source))
    .map((session) => session.source === "happy" && happyTitles.has(session.threadId)
      ? { ...session, title: happyTitles.get(session.threadId) }
      : session)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  listCache.set(cacheKey, { expiresAt: Date.now() + 2500, value });
  return value;
};

const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${project} · 项目状态</title>
<style>
:root{color-scheme:dark;font-family:Inter,"Segoe UI",system-ui,sans-serif;background:#080b12;color:#edf4ff}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 12% -8%,#203a64 0,#080b12 36%,#06080d 100%);color:#edf4ff}.shell{width:min(1180px,100%);margin:0 auto;padding:18px}.hero{position:sticky;top:0;z-index:2;margin:-18px -18px 14px;padding:18px;background:linear-gradient(180deg,rgba(8,11,18,.98),rgba(8,11,18,.82));backdrop-filter:blur(18px);border-bottom:1px solid rgba(145,170,210,.16)}.hero-inner{width:min(1180px,100%);margin:0 auto;display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.eyebrow{color:#8fb7ff;font-size:12px;letter-spacing:.08em;text-transform:uppercase}.title{margin:6px 0 8px;font-size:28px;line-height:1.12}.sub{margin:0;color:#9facbf;font-size:13px;line-height:1.6}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.pill,.filter{border:1px solid rgba(153,178,214,.24);background:rgba(255,255,255,.055);color:#cbd9ee;border-radius:999px;padding:8px 12px;font-size:12px}.filter{cursor:pointer}.filter.active{background:#d9e8ff;color:#07101d;border-color:#d9e8ff}.grid{display:grid;grid-template-columns:minmax(0,1.25fr) 340px;gap:14px}.card{border:1px solid rgba(148,169,204,.18);background:linear-gradient(180deg,rgba(18,25,38,.86),rgba(12,16,25,.92));box-shadow:0 18px 55px rgba(0,0,0,.28);border-radius:22px;padding:18px}.card h2,.card h3{margin:0 0 12px}.card h2{font-size:18px}.card h3{font-size:14px;color:#c8d7ed}.status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mini{border:1px solid rgba(148,169,204,.14);background:rgba(255,255,255,.045);border-radius:16px;padding:13px}.label{font-size:12px;color:#8898af;margin-bottom:7px}.value{font-size:14px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.summary{margin-top:14px}.summary summary,.conversation summary{cursor:pointer;color:#cbd9ee;font-size:14px}.summary-text{display:grid;gap:10px;margin-top:12px}.summary-section{border:1px solid rgba(148,169,204,.14);background:rgba(255,255,255,.04);border-radius:16px;padding:12px}.summary-section-title{font-size:12px;color:#8fb7ff;margin-bottom:8px}.summary-section-item{font-size:13px;line-height:1.55;color:#dbe7f8;margin-top:6px}.session-list{display:grid;gap:8px}.session{width:100%;border:1px solid rgba(148,169,204,.14);background:rgba(255,255,255,.035);color:#dce8f7;text-align:left;border-radius:14px;padding:12px;cursor:pointer}.session:hover{background:rgba(255,255,255,.07)}.session.active{border-color:#8fb7ff;background:rgba(84,132,205,.18)}.session-title{font-size:13px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.session-meta{font-size:11px;color:#8d9aab;margin-top:7px}.conversation{margin-top:14px}.chat{display:grid;gap:12px;margin-top:12px;max-height:min(62vh,760px);overflow:auto;padding-right:4px}.bubble{max-width:860px}.who{font-size:11px;color:#8f9eb4;margin:0 0 5px}.body{border:1px solid rgba(148,169,204,.13);background:rgba(255,255,255,.045);border-radius:15px;padding:12px 13px;line-height:1.62;white-space:pre-wrap;overflow-wrap:anywhere;color:#dce8f7}.user .body{background:rgba(59,116,168,.18);border-color:rgba(110,166,220,.22)}.empty{color:#7f8ca0;font-size:13px}.tiny{color:#7f8ca0;font-size:11px;line-height:1.5}details.history{margin-top:10px}details.history summary{cursor:pointer;color:#93a8c4;font-size:13px;margin-bottom:10px}@media(max-width:820px){.shell{padding:12px}.hero{margin:-12px -12px 12px;padding:14px 12px}.hero-inner{display:block}.title{font-size:23px}.actions{justify-content:flex-start;margin-top:12px}.grid{grid-template-columns:1fr}.status-grid{grid-template-columns:1fr}.card{border-radius:18px;padding:14px}.desktop-only{display:none}.conversation{margin-top:12px}}
</style>
</head>
<body>
<div class="shell">
  <header class="hero">
    <div class="hero-inner">
      <div>
        <div class="eyebrow">只读项目状态</div>
        <h1 class="title">${project}</h1>
        <p class="sub" id="projectSub">优先展示当前最新会话、研发总结和最近进展。</p>
      </div>
      <div class="actions">
        <button id="refresh" class="pill" type="button">刷新</button>
        <span id="live" class="pill">正在连接</span>
      </div>
    </div>
  </header>
  <main class="grid">
    <section>
      <article class="card">
        <h2 id="title">正在读取最新项目会话</h2>
        <p id="meta" class="sub">只显示当前项目目录下的 Codex / Happy Coder 会话。</p>
        <div class="status-grid">
          <div class="mini"><div class="label">最近用户要求</div><div id="latestUser" class="value empty">等待读取</div></div>
          <div class="mini"><div class="label">最近 Codex 回复</div><div id="latestAssistant" class="value empty">等待读取</div></div>
        </div>
        <details class="summary" open>
          <summary>研发状态总结</summary>
          <div id="summaryText" class="summary-text empty">等待当前会话摘要</div>
        </details>
      </article>
      <article class="card conversation">
        <details id="conversationDetails">
          <summary>查看完整对话历史</summary>
          <div id="chat" class="chat"><div class="empty">正在载入消息…</div></div>
        </details>
      </article>
    </section>
    <aside class="card">
      <h3>项目会话</h3>
      <div class="actions" style="justify-content:flex-start;margin-bottom:12px">
        <button class="filter active" data-source="all" type="button">全部</button>
        <button class="filter" data-source="happy" type="button">Happy</button>
        <button class="filter" data-source="codex" type="button">Codex</button>
      </div>
      <div id="currentSession" class="session-list"><div class="empty">正在载入会话…</div></div>
      <details class="history">
        <summary>历史会话</summary>
        <div id="sessions" class="session-list"></div>
      </details>
      <p class="tiny">按 JSONL 文件更新时间倒序；默认跟随最新会话，点击历史会话后会停留在所选会话。</p>
    </aside>
  </main>
</div>
<script>
const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
let sourceFilter = params.get('source') || 'all';
let sessions = [];
let selected = '';
let followLatest = true;
let refreshTimer = 0;
const sectionNames = new Set(['????','???????','AI?????','??????','?????','??','???','????????']);
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shortText = (value, limit = 260) => {
  const text = String(value || '').trim();
  return text.length > limit ? text.slice(0, limit) + '?' : text;
};
const sourceLabel = (source) => source === 'happy' ? 'Happy Coder' : 'Codex Desktop';

function renderSummary(text) {
  const container = $('summaryText');
  const normalized = String(text || '').trim();
  if (!normalized) { container.className = 'summary-text empty'; container.textContent = '当前会话尚未生成总结'; return; }
  const sections = [];
  let current = null;
  for (const rawLine of normalized.split(/\\r?\\n/)) {
    const line = rawLine.replace(/^\s*(?:#{1,3}\s*)?/, '').trim();
    if (!line) continue;
    const heading = line.replace(/[：:]\s*$/, '').trim();
    if (sectionNames.has(heading)) { current = { title: heading, items: [] }; sections.push(current); continue; }
    if (!current) { current = { title: '记录', items: [] }; sections.push(current); }
    const item = line.replace(/^(?:[-*•]|\d+[.)])\s*/, '').trim();
    if (item) current.items.push(item);
  }
  if (!sections.length) { container.className = 'summary-text'; container.textContent = normalized; return; }
  container.className = 'summary-text';
  container.innerHTML = sections.map((section) => '<section class="summary-section"><div class="summary-section-title">' + esc(section.title) + '</div>' + (section.items.length ? section.items.map((item) => '<div class="summary-section-item">' + esc(item) + '</div>').join('') : '<div class="summary-section-item">暂无</div>') + '</section>').join('');
}

function sessionButton(session) {
  return '<button class="session ' + (session.threadId === selected ? 'active' : '') + '" data-id="' + encodeURIComponent(session.threadId) + '" type="button"><div class="session-title">' + esc(session.title || session.threadId) + '</div><div class="session-meta">' + new Date(session.updatedAt).toLocaleString() + ' ? ' + sourceLabel(session.source) + ' ? ' + session.messageCount + ' ?</div></button>';
}

function bindSessionClicks(root) {
  root.querySelectorAll('.session[data-id]').forEach((button) => {
    button.onclick = () => { followLatest = false; loadSession(decodeURIComponent(button.dataset.id)); };
  });
}

function renderSessions() {
  const latest = sessions[0];
  $('currentSession').innerHTML = latest ? sessionButton(latest) : '<div class="empty">暂无项目会话</div>';
  $('sessions').innerHTML = sessions.slice(1).map(sessionButton).join('') || '<div class="empty">暂无更多历史会话</div>';
  bindSessionClicks($('currentSession'));
  bindSessionClicks($('sessions'));
  document.querySelectorAll('.filter').forEach((button) => button.classList.toggle('active', button.dataset.source === sourceFilter));
}

async function loadSessions() {
  const response = await fetch('/api/sessions?source=' + encodeURIComponent(sourceFilter) + '&token=' + encodeURIComponent(token));
  sessions = await response.json();
  renderSessions();
  if (sessions[0] && (followLatest || !selected)) await loadSession(sessions[0].threadId, true);
}

async function loadStatus(threadId) {
  try {
    const response = await fetch('/api/status?threadId=' + encodeURIComponent(threadId) + '&token=' + encodeURIComponent(token));
    const status = await response.json();
    renderSummary(status.summary || '');
    $('live').textContent = status.summaryStatus === 'summarizing' ? '正在总结' : status.connected ? '实时连接' : '等待记录服务';
  } catch {
    renderSummary('');
  }
}

async function loadSession(threadId, keepFollow = false) {
  selected = threadId;
  if (!keepFollow) followLatest = false;
  renderSessions();
  const response = await fetch('/api/session?threadId=' + encodeURIComponent(threadId) + '&source=' + encodeURIComponent(sourceFilter) + '&token=' + encodeURIComponent(token));
  const session = await response.json();
  $('title').textContent = session.title || session.threadId || '?????';
  $('meta').textContent = new Date(session.updatedAt).toLocaleString() + ' · ' + sourceLabel(session.source) + ' · ' + session.messageCount + ' 条可展示消息';
  $('latestUser').textContent = shortText(session.latestUser || '暂无用户消息');
  $('latestAssistant').textContent = shortText(session.latestAssistant || '暂无 Codex 回复');
  $('conversationDetails').open = true;
  const conversationMessages = session.messages || [];
  $('chat').innerHTML = conversationMessages.map((message) => '<article class="bubble ' + message.role + '"><div class="who">' + (message.role === 'user' ? 'Hans / ??' : 'Codex Agent') + '</div><div class="body">' + esc(message.text) + '</div></article>').join('') || '<div class="empty">???????????</div>';
  const chatRoot = $('chat');
  if (chatRoot) chatRoot.scrollTop = chatRoot.scrollHeight;
  await loadStatus(threadId);
}

document.querySelectorAll('.filter').forEach((button) => {
  button.onclick = () => {
    sourceFilter = button.dataset.source;
    selected = '';
    followLatest = true;
    const nextParams = new URLSearchParams(location.search);
    nextParams.set('source', sourceFilter);
    history.replaceState(null, '', '?' + nextParams.toString());
    loadSessions();
  };
});
$('refresh').onclick = () => { followLatest = true; loadSessions(); };

const scheduleSessionsRefresh = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(loadSessions, 700);
};
const events = new EventSource('/events?token=' + encodeURIComponent(token));
events.onopen = () => { $('live').textContent = '实时连接'; };
events.onmessage = (event) => {
  try {
    const status = JSON.parse(event.data);
    $('live').textContent = status.summaryStatus === 'summarizing' ? '正在总结' : status.lastRole === 'assistant' ? '回复完成' : '实时连接';
    if (status.threadId === selected) renderSummary(status.summary || '');
    scheduleSessionsRefresh();
  } catch {}
};
events.onerror = () => { $('live').textContent = '连接中断'; };
loadSessions();
</script>
</body>
</html>`;

const authorized = (request) => new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`).searchParams.get("token") === token;

const readStatus = async (threadId = "") => {
  const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
  const response = await fetch(`http://127.0.0.1:${observerPort}/status${query}`);
  if (!response.ok) throw new Error(`observer HTTP ${response.status}`);
  return response.text();
};

const sendJson = (response, value, status = 200) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
};

const server = http.createServer(async (request, response) => {
  if (!authorized(request)) {
    response.writeHead(401);
    response.end("Unauthorized");
    return;
  }
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  try {
    if (url.pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(page);
      return;
    }
    if (url.pathname === "/api/sessions") {
      const sessions = await listSessions(url.searchParams.get("source") || "all");
      sendJson(response, sessions.map(({ messages, cwd, projectMatch, ...item }) => ({ ...item, lastPreview: messages.at(-1)?.text || "" })));
      return;
    }
    if (url.pathname === "/api/session") {
      const id = url.searchParams.get("threadId") || "";
      const session = (await listSessions(url.searchParams.get("source") || "all")).find((item) => item.threadId === id);
      if (!session) return sendJson(response, { error: "session not found" }, 404);
      sendJson(response, session);
      return;
    }
    if (url.pathname === "/events") {
      response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
      clients.add(response);
      if (lastPayload) response.write(`data: ${lastPayload}\n\n`);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (url.pathname === "/api/status") {
      sendJson(response, JSON.parse(await readStatus(url.searchParams.get("threadId") || "")));
      return;
    }
    response.writeHead(404);
    response.end();
  } catch (error) {
    sendJson(response, { error: error.message }, 503);
  }
});

const broadcast = (payload) => {
  for (const client of clients) client.write(`data: ${payload}\n\n`);
};

setInterval(async () => {
  try {
    const payload = await readStatus();
    if (payload !== lastPayload) {
      lastPayload = payload;
      broadcast(payload);
    }
  } catch {}
}, 1000);

server.listen(port, "0.0.0.0", () => console.log(`[remote-room-demo] http://0.0.0.0:${port}/?token=${token}`));
