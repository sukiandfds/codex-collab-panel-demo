---
feature_id: FEAT-008
title: HTML 网页生成与 PDF 双文件交付
status: implemented_uncommitted
current_version: v0.2.0
last_updated: 2026-07-27 23:47 +08:00
owners: [web_output, agent_execution]
key_paths:
  - windows/server/web-output-service.mjs
  - windows/server/multi-agent-service.mjs
  - windows/server/request-handler.mjs
  - web-ui/src/features/artifacts
related_features: [FEAT-002, FEAT-007]
---

# FEAT-008：HTML 网页生成与 PDF 双文件交付

## 当前目标

用户在项目群中明确要求制作网页后，Agent 生成一个真实 HTML 文件；服务端使用本机 Edge 将它渲染为 PDF；两份文件自动出现在同一条 Agent 群消息下方。

最终用户看到：

```text
Agent 回复
├── index.html  [打开网页] [下载]
└── result.pdf  [打开 PDF] [下载]
```

手机点击“打开网页”后，应像普通网页链接一样在新标签页中显示；点击 PDF 后由手机浏览器或系统 PDF 阅读器打开。

## 为什么独立为 FEAT-008

- `FEAT-007` 负责交付物登记、预览、下载、版本和审核。
- 本功能负责生成 HTML、调用 Edge 转 PDF，以及把两个结果交给 `FEAT-007`。
- 不把网页生成、浏览器执行和 PDF 转换继续塞入 `artifact-service`。

## 已有基础

- `FEAT-002` 已有真实群消息、多 Agent 调度和有限讨论轮次。
- `FEAT-007` 已有受控文件登记、Artifact 卡片、PDF 预览、下载、版本和审核。
- 本机已确认 Edge 路径：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。
- 当前 Artifact 对 HTML 仍只提供下载，没有安全网页预览。
- 当前 Agent 尚未自动把生成文件发布为 Artifact。

## 推荐的轻量实现

不开发通用 `AgentRun`、动态工具、MCP 或目录扫描器。只增加一个固定网页成果流程。

```text
用户明确要求生成 HTML 网页
  -> 后端创建 jobId 和确定输出目录
  -> Agent 收到目标文件绝对路径和静态网页约束
  -> Agent 写入 index.html
  -> Agent Turn 完成
  -> web-output-service 只检查该 jobId 下的 index.html
  -> Edge 通过受控预览地址打印 result.pdf
  -> 两个文件通过 artifact-service 发布
  -> 等待 Agent 最终群消息写入
  -> 两个 artifactId 挂到该 Agent 消息
  -> SSE 通知网页和手机
```

输出目录：

```text
runtime/agent-artifacts/<jobId>/
├── index.html
└── result.pdf
```

后端不得递归扫描项目，也不得从 Agent 回复文本中正则猜测文件路径。

## HTML 生成约束

第一版只允许静态、自包含网页：

- UTF-8 HTML。
- 必须包含移动端 viewport。
- 使用响应式 CSS，支持手机和桌面宽度。
- CSS 内联或写在同一个 HTML 文件中。
- 不依赖 CDN、在线字体或外部接口。
- 不需要 JavaScript；即使生成了脚本，预览环境也必须禁止执行。
- 不读取项目 API、Cookie、Token 或本机其他路径。
- 建议限制 HTML 文件不超过 5 MB。

## 安全网页预览

不能把 Agent 生成的 HTML 直接作为主站同源页面执行，也不能把主访问 Token 暴露给该页面。

建议路由：

```text
GET /api/artifacts/<artifactId>/open-html?token=...
  -> 验证 Artifact 和访问权限
  -> 创建短期随机 previewTicket
  -> 302 跳转到 /artifact-preview/<previewTicket>

GET /artifact-preview/<previewTicket>
  -> Content-Type: text/html; charset=utf-8
  -> Content-Disposition: inline
  -> 返回 HTML
```

预览响应至少设置：

```text
Content-Security-Policy:
  sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:;
  font-src data:; media-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Cache-Control: no-store
```

- Preview Ticket 使用不可预测随机值，并设置短期有效期。
- Ticket 页面不携带项目 Token。
- 不使用 `allow-scripts`、`allow-same-origin`、Service Worker 或主站 API。
- 第一版外部图片和网络资源被阻止是预期行为。

## Edge 转 PDF

新增独立 `web-output-service.mjs`，负责：

- 查找 `EDGE_BIN` 配置或本机常见 Edge 安装路径；
- 为每次转换使用独立临时浏览器用户目录；
- 使用无头 Edge 打开受控预览地址；
- 输出到确定的 `result.pdf`；
- 设置超时并精确结束本次子进程；
- 验证退出状态、文件存在、文件大小以及 `%PDF-` 文件头；
- 转换失败时保留 HTML，并返回明确失败状态，不生成伪 PDF Artifact。

不要使用桌面自动化点击“打印”，不要启动可见 Edge 窗口，不要安装新的浏览器依赖。

## Agent 与群聊接线

只在用户明确要求“生成 HTML、网页、页面、报告页”等成果时启用该工作流。普通群聊和代码开发不触发。

在 `multi-agent-service` 中为本次执行保存最小临时上下文：

```text
jobId
agentId
sourceMessageId
outputDirectory
finalMessageId
artifactIds
```

当前讨论仍遵循已有限制：

- 一次用户消息最多 4 轮 Agent 讨论。
- 专业 Agent 本轮只执行一次。
- PDF 生成失败不自动反复重试。
- 成果发布后停止，等待用户下一条指令。
- 用户点击打回时，本轮先只保存审核结果；不要自动形成无限返工循环。

## Artifact 发布

复用 `artifact-service.publish`，不要复制文件登记、哈希、版本和下载逻辑。

- HTML Artifact：`mimeType = text/html`，卡片新增“打开网页”。
- PDF Artifact：`mimeType = application/pdf`，复用现有 PDF 打开/预览能力。
- 两个 Artifact 使用相同 `taskId/jobId`，并关联同一条 Agent 最终消息。
- HTML 和 PDF 都保留独立下载入口。

如果当前 `artifact-service` 只接受全局允许目录，输出路径必须继续位于它已经允许的 `runtime/agent-artifacts` 下，不扩大任意路径读取权限。

## 用户可见行为

桌面端：

- 点击“打开网页”在新标签页打开完整 HTML 页面。
- 点击“打开 PDF”在浏览器 PDF 查看器打开。

手机端：

- 只要手机能够访问当前 Demo 地址，就能访问同一 HTML/PDF 地址。
- HTML 必须响应式，否则技术上能打开但移动端排版会很差。
- iPhone、iPad 和多数 Android 浏览器可直接查看 PDF；不支持内联的浏览器允许下载后用系统阅读器打开。

远程访问仍依赖 `FEAT-006` 提供的有效公网入口。本功能不得创建或更换公网地址。

## 本轮必须完成

1. 新增独立 `web-output-service`。
2. Agent 在确定目录生成 `index.html`。
3. Edge 无头模式生成并验证 `result.pdf`。
4. 新增带短期 Ticket 和严格 CSP 的 HTML 打开路由。
5. HTML 和 PDF 通过现有 Artifact 服务发布。
6. 两个成果挂到同一条 Agent 最终群消息。
7. Artifact 卡片为 HTML 增加“打开网页”，PDF 继续使用现有打开/下载能力。
8. 增加服务端定向测试和必要的前端类型检查。
9. 完成后更新本文版本时间线及 `FEATURE_INDEX.md`。

## 本轮不做

- 任意 JavaScript 网页或完整应用托管。
- 在线 HTML 编辑器。
- 永久公开网站部署。
- 通用任务系统、动态工具、MCP 或工具百宝箱。
- PPT、DOCX、XLSX 生成。
- 多次自动审核、返工或 Agent 自治循环。
- 修改基础 UI、群聊整体布局或单人 Codex 页面。
- 修改公网域名、Tunnel 或认证方案。
- 安装新的浏览器、前端框架或数据库。

## 预计修改范围

允许新增或修改：

```text
windows/server/web-output-service.mjs
windows/server/multi-agent-service.mjs
windows/server/request-handler.mjs
windows/scripts/remote-room-demo.mjs
windows/tests/web-output-service.test.mjs
web-ui/src/features/artifacts/**
web-ui/src/features/group-chat/**  # 仅必要接线
docs/feature-development/features/FEAT-008-html-page-pdf-generation.md
docs/feature-development/FEATURE_INDEX.md
```

未经用户再次许可，不修改：

```text
web-ui/src/components/**
web-ui/src/styles/**
FEAT-001 单人 Codex 功能
FEAT-006 公网入口
```

## 基本检查

只做与改动匹配的检查：

```powershell
node --check <修改的 mjs 文件>
node --test windows/tests/web-output-service.test.mjs
pnpm build:ui
git diff --check
```

不做视觉验收；不自行启动、重启服务；不自行 commit 或 push，除非用户在开发对话中明确要求。

## 版本时间线

### 2026-07-27 23:47 +08:00 | v0.2.0 | implemented_uncommitted

- 计划：只完成“本轮必须完成”的静态 HTML、Edge 转 PDF、安全预览和双 Artifact 接线。
- 实际：新增独立 `web-output-service`；明确网页成果请求固定交给开发 Agent，在受控目录生成 `index.html`；通过无头 Edge 生成并校验 `result.pdf`；HTML/PDF 复用现有 Artifact 服务并关联同一条 Agent 最终群消息。
- 安全：HTML 打开入口先经过受保护 API 换取短期随机 Ticket；Ticket 页面不携带主 Token，并使用不允许脚本、同源、外部网络、表单和对象的 CSP。
- 失败处理：PDF 转换失败时保留 HTML，不发布伪 PDF，不自动重试；普通群聊和非明确网页成果请求不触发该流程。
- 验证：修改的 4 个 `.mjs` 文件通过 `node --check`；`windows/tests/web-output-service.test.mjs` 4 项通过；`pnpm build:ui` 通过；未做视觉验收、服务启动或真实 Edge 冒烟测试。
- 用户可见变化：在项目群明确要求生成 HTML 网页后，开发 Agent 的最终消息下会显示 `index.html` 和 `result.pdf`；HTML 卡片可在新标签页打开网页，两份成果均可下载。PDF 失败时只显示有效 HTML 和明确失败状态。
- 范围：未修改基础 UI、单人 Codex、公网入口，也未扩展通用任务系统、MCP 或工具市场。
- Git：uncommitted，未提交、未推送。

### 2026-07-27 23:31 +08:00 | v0.1.0 | planned

- 计划：完成静态 HTML 生成、Edge 转 PDF、安全网页打开和群聊双文件发布。
- 实际：完成独立功能边界和开发交接文档，尚未修改代码。
- 偏差：没有把网页生成错误追加到 `FEAT-007`，改为独立依赖功能。
- 验证：已确认现有 Artifact 能力和本机 Edge 安装路径。
- 用户可见变化：暂无；等待独立开发助手实现。
- Git：uncommitted。

## 下一步

等待用户后续自行启动服务并体验本轮结果；未经新的明确要求，不继续扩展交互网页、Office、工具市场或公网入口。
