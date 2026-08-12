# negus Web 协作工作台项目说明

更新日期：2026-08-10

本文件只说明 negus Web 协作工作台。Codex Dream Skin 换肤工具的使用说明放在 `macos/README.md` 和 `windows/README.md`。

## 项目定位

negus 是一个围绕真实 Codex 工作过程的 Web 协作工作台。

当前核心是：

- 查看真实 Codex Thread；
- 在浏览器中继续发送和控制任务；
- 显示执行过程、流式回复和项目状态；
- 为后续群聊、多 Agent 和交付物协作提供基础。

仓库同时保留早期的 macOS 和 Windows Codex 换肤工具。换肤工具是历史产品线，当前 Web 工作台的主要代码在 web-ui 和 windows/server。

本项目不是 OpenAI 官方产品。

## 当前产品能力

当前 Web Demo 的主要能力：

- 真实会话列表、标题、历史消息和分页加载；
- 发送、追加、停止、恢复、排队和执行状态展示；
- Markdown、代码、表格、链接、图片、音频、视频和普通文件；
- 会话重命名、归档、恢复、复制和分叉；
- 项目群聊、Agent 单聊、@ 路由和成果带回群聊；
- Agent Artifact、HTML/PDF 生成、预览、审核和下载；
- PWA、设备身份、移动端入口和用量摘要。

功能是否已经达到可交付状态，以 `docs/feature-development/FEATURE_STATUS_INDEX.md` 和对应功能文档为准。

## 代码结构与模块入口

| 路径 | 内容 |
| --- | --- |
| `web-ui/src/features/` | React 前端功能模块 |
| `web-ui/src/components/`、`web-ui/src/shared/` | 跨页面 UI、API 和模型共用代码 |
| `windows/server/` | Web API、SSE、会话、群聊、Artifact 和生图服务 |
| `windows/server/routes/` | HTTP 路由入口 |
| `windows/scripts/remote-room-demo.mjs` | Web 服务组装和启动入口 |
| `windows/scripts/start-web-demo.ps1`、`restart-web-demo.ps1` | Web 服务启动和重启 |
| `runtime/` | 会话、执行、群聊、Artifact、员工和媒体数据 |
| `macos/` | Codex Dream Skin macOS 换肤代码和资源 |
| `windows/assets/`、`windows/scripts/*dream-skin*` | Codex Dream Skin Windows 换肤代码和资源 |
| `docs/` | 项目、功能、架构、研究、管理和历史记录 |

## 模块查找表

| 要修改的模块 | 先读的文档 | 主要代码位置 |
| --- | --- | --- |
| 单人 Web 对话、执行、历史 | `docs/feature-development/features/FEAT-001-single-codex-web.md` | `web-ui/src/features/conversations/`、`execution/`、`context-management/`；`windows/server/conversation-service.mjs`、`app-server-conversation-store.mjs`、`execution-tracker.mjs` |
| 多业务项目与会话归类 | `docs/feature-development/features/FEAT-017-multiple-business-projects.md` | `web-ui/src/features/project-directory/`；`windows/server/business-project-config.mjs`、`project-identity-store.mjs`、`employee-project-directory.mjs` |
| 项目群聊和多 Agent | `docs/feature-development/features/FEAT-002-group-multi-agent.md` | `web-ui/src/features/group-chat/`；`windows/server/group-room-store.mjs`、`multi-agent-service.mjs` |
| 附件和内容渲染 | `docs/feature-development/features/FEAT-003-attachments-content-rendering.md` | `web-ui/src/features/attachments/`、`conversations/rendering/`；`windows/server/content-blocks.mjs`、`media-service.mjs` |
| PWA、设备和移动端入口 | `docs/feature-development/features/FEAT-004-pwa-device-identity.md` | `web-ui/src/pwa/`、`features/device/`、`features/app-update/`；`web-ui/public/`、`windows/server/request-handler.mjs` |
| Desktop/Web 连续性和实时事件 | `docs/feature-development/features/FEAT-005-desktop-web-continuity.md` | `windows/server/app-server-client.mjs`、`app-server-conversation-store.mjs`、`execution-tracker.mjs`、`realtime-hub.mjs` |
| Artifact、HTML 和 PDF | `docs/feature-development/features/FEAT-007-agent-artifacts.md`、`FEAT-008-html-page-pdf-generation.md` | `web-ui/src/features/artifacts/`；`windows/server/artifact-service.mjs`、`web-output-service.mjs`、`request-handler.mjs` |
| 自然语言生图 | `docs/feature-development/features/FEAT-015-image-generation-and-automation-workbench.md` | `web-ui/src/features/` 相关生图入口；`windows/server/image-generation/`、`conversation-routes.mjs` |
| macOS 换肤 | `macos/README.md`、`macos/SKILL.md` | `macos/` |
| Windows 换肤 | `windows/README.md`、`windows/SKILL.md` | `windows/assets/`、`windows/scripts/*dream-skin*`、`windows/scripts/injector.mjs` |

## 数据和运行链路

主要数据链路：

Codex app-server
-> app-server conversation store
-> conversation service
-> HTTP API 和 SSE
-> React Web UI

app-server 是主要数据源。本地 Codex JSONL 是降级数据源。

主要页面：

- /：单人对话
- /group.html：项目群聊
- /progress.html：项目进度
- /project-management.html：项目管理兼容入口

构建和运行：

- 构建：pnpm build:ui
- 启动：pnpm start:demo
- 重启：pnpm restart:demo
- canonical 服务端口：9360
- 4173 是旧的 Vite Preview 入口，不作为交付地址

## 当前限制

- Desktop 和 Web 可以写入同一个持久化 Thread，但 Desktop 已打开页面不会实时显示 Web 外部追加内容。
- Desktop 和 Web 暂不应同时向同一个 Thread 发送任务。
- 群聊、多 Agent 和员工项目能力仍在持续开发。
- 固定公网入口、正式认证和长时间远程运行仍需进一步验收。
- 移动端、断线恢复、长任务和跨端体验仍以真实验收结果为准。
- 项目当前目标不是完整的企业协作或权限系统。

## 资料入口

- 助手工作规则：`AI_ASSISTANT_WORK_RULES.md`
- 功能状态：`docs/feature-development/FEATURE_STATUS_INDEX.md`
- 功能详情：`docs/feature-development/features/`
- 开发常见错误：`docs/feature-development/DEVELOPMENT_COMMON_MISTAKES.md`
- 架构职责：docs/architecture/
- 项目管理：docs/project-management/
- 研究和证据：docs/research/、docs/records/
- 产品愿景和历史讨论：docs/records/VISION_NOTES.md、项目战略与多角色评审/
