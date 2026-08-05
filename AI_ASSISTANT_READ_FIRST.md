# AI助手请先看这个

> 本文是 `negus` 的 AI 开发交接入口。本地仓库目录和 `origin` 远程仓库统一使用 `negus`；任何 AI 助手准备分析、修改或运行本项目之前，应先完整阅读本文，再按需查看具体代码和开发日志。

更新日期：2026-08-05
项目路径：以 `git rev-parse --show-toplevel` 返回的实际仓库根目录为准；本文不再把历史路径作为工作目录
当前分支：`codex/publish-current-panel`
当前阶段：优先收尾单人 Codex Web 对话与控制的基础体验和稳定性；项目群聊、多 Agent、固定公网入口和 Desktop/Web 统一控制继续保留，但暂不抢在单人基础能力之前扩展

## 0. AI 功能开发记录入口

本项目的开发记忆已经按功能规整。AI 助手开始任何开发前，必须按以下顺序读取：

1. [`PROJECT_OPERATING_RULES.md`](./PROJECT_OPERATING_RULES.md)：了解通用开发、命名和项目管理同步规则。
2. [`PROJECT_RULES.md`](./PROJECT_RULES.md)：了解本项目专属分支、安全和资料边界。
3. [`docs/feature-development/FEATURE_INDEX.md`](./docs/feature-development/FEATURE_INDEX.md)：定位功能编号、当前状态、最新版本和记录入口。
4. 与当前任务直接相关的一个或多个 `docs/feature-development/features/FEAT-*.md`：了解原计划、实际实现、历史版本、特例问题和当前边界。
5. [`docs/feature-development/PROCESS_ISSUES.md`](./docs/feature-development/PROCESS_ISSUES.md) 中状态为 `active` 的普适问题：直接复用正确路径和防再犯规则。
6. 如果任务涉及计划、进度、条目状态或过程复盘，再读取 [`docs/project-management/README.md`](./docs/project-management/README.md)、`PROJECT.md`、`INDEX.md`，然后进入对应 `items/<ITEM-ID>/`。
7. 只有需要证据、复盘或定位旧实现时，才读取根目录中的日期日志和对应 Git 提交。

完整字段、编号和维护方式见 [`docs/feature-development/README.md`](./docs/feature-development/README.md)。旧日期日志保留为原始证据，不再作为 AI 的首要阅读入口。

项目管理条目的当前快照在 `docs/project-management/items/<ITEM-ID>/item.md`，状态历史在 `updates.md`，条目专属的弯路和决策在 `process.md`。跨功能、可复用的问题只在 `docs/feature-development/PROCESS_ISSUES.md` 保留完整记录，避免多处复制后互相漂移。

每次功能开发、修复或技术路径变更结束前，必须更新对应 `FEAT-*.md` 的当前快照、问题状态和版本时间线；功能状态或版本变化时同步更新 `FEATURE_INDEX.md`。如果发现会影响其他功能的普适问题，还必须登记或更新 `PROCESS_ISSUES.md`。只写日期日志、不回写功能记录，视为记录未完成。

每次研究、修改、测试、提交和交接必须执行 [`docs/project-management/ASSISTANT_DELIVERY_CHECKLIST.md`](./docs/project-management/ASSISTANT_DELIVERY_CHECKLIST.md)。该清单是项目管理联动的执行入口；缺少任务编号、完整 SHA、测试结果或条目回写时，状态只能是 `handoff_pending`，不得描述为已完成。

## 0.2 规则层级与快速路由

- 全局 `AGENTS.md` 规定所有项目通用的沟通、确认、资源和轻量工作原则。
- `PROJECT_OPERATING_RULES.md` 规定跨项目可复用的开发、交接和记录规则。
- 本文件与 `PROJECT_RULES.md` 只规定 `negus` 的目录、编号、分支、端口和资料边界。
- 收到新请求时先判断是想法、Bug、研究、功能修改、复盘还是状态查询，再按当前任务一次性读取相关索引、文档和源码；普通闲聊不自动建条目。
- 完成后只回写必要文件，并报告用户可见变化、检查结果和未验证部分；不要用新的规则或额外文件替代项目已有记录。

## 0.1 用户偏好与沟通记忆（强制）

用户已经明确、反复强调的长期偏好，不得只依赖当前对话记忆，必须立即写入本操作手册或 `PROCESS_ISSUES.md`，并在后续每次开始工作前执行。

- 优先考虑用户的阅读负担：先给结论和必要信息，不堆背景、重复过程或长篇计划。
- 用户明确且严肃的要求属于长期操作约束，不等产品方向讨论结束才记录。
- 产品方向、架构取舍和远期设想可以先保留讨论状态，只有用户确认后才写入定案记录。
- 如果同一偏好被用户再次提醒，先复盘为什么没有被遵守，再更新记录和触发规则，不要求用户重复解释。
- 任何 AI 助手开始回复或开发前，必须检查本节和 `PROCESS_ISSUES.md` 的 active 条目；违反后不得用新的计划或解释替代记录。

## 1. 最重要的维护边界

1. **当前优先收尾单人 Codex Web 基础体验，群聊与多 Agent 保留为后续重点。** 单人页稳定后仍以一个项目群继续真实讨论：默认项目经理参与，其他 Agent 通过 `@` 加入；不要扩展跨项目聚合、完整多人权限或企业协作系统。
2. **所有展示内容必须来自这个项目的真实数据。** 不要用虚构会话、占位成员、假进度或演示文案替代真实内容。
3. **UI、内容和功能必须分开维护。** UI 文件只负责视觉；内容解析只负责数据；功能组件按功能归属拆分。
   具体目录和依赖规则先看 [`docs/architecture/README.md`](./docs/architecture/README.md)，再按需查看 [`docs/architecture/MODULE_BOUNDARIES.md`](./docs/architecture/MODULE_BOUNDARIES.md)。
4. **没有用户明确许可，不要修改 UI 样式文件。** 当前样式是否符合 Codex 复刻要求，由用户亲自验收。
5. **不要默认执行浏览器截图、像素对比或视觉验收。** 默认只做与改动风险相匹配的代码、构建和接口检查。
6. **保持快速、轻量和小步修改。** 不增加无关依赖，不做大范围重构，不在一个问题上持续钻牛角尖。
7. **资源浪费属于 P0 事故。** 当同一任务出现第二种独立根因、第二次提权或重装、第三轮验证，或者用户已经明确表示等待过久、要求停止扩展时，必须立即停止操作并汇报；不得以“快做完了”为理由继续消耗用户时间、精力、注意力和信任。
8. **服务统一使用 `9360`。** `4173` 是曾经造成错误的旧 Vite Preview 入口，不应再交付给用户。
9. **远程检查不得触发电脑端确认。** 用户通过手机/公网使用时，UI 检查默认只读源码、已有截图和静态产物。任何可能启动浏览器、Node、网络监听或触发 Windows Firewall、UAC、浏览器授权的工具，必须先确认无交互；无法证明时不得运行。检查被弹窗阻塞、取消或超时后必须清理残留运行状态。

## 2. 项目是什么

项目目标是让 Codex 的真实工作过程变成可观察、可讨论、以后可协作的项目状态，而不是只存在于某一台电脑、某一个 Codex 窗口中的黑盒。

长期愿景包括：

- 团队成员知道谁正在让 Codex 做什么。
- 看到项目最近形成的结论、变更、风险和待确认事项。
- 项目经理 Agent 帮助整理目标、决策、任务和冲突，但不未经授权替用户做决定。
- 最终支持多成员围绕同一个项目协作，并在明确授权后转发指令。

但当前阶段没有直接实现完整愿景。现在的产品目标已经收束为：

> 以一个项目群作为统一入口：用户默认与项目经理 Agent 沟通，需要时通过 `@` 叫来其他真实 Agent；单聊和多人讨论使用同一套群聊组件，真实执行仍由各自独立 Codex Thread 承担。

## 3. 项目经历的两个主要阶段

### 3.1 早期阶段：Codex 右侧总结面板

早期原型基于 `Fei-Away/Codex-Dream-Skin`：

- 通过 loopback CDP 向隔离版 Codex 注入右侧面板。
- `summary-observer.mjs` 读取本地 Codex JSONL。
- 只抽取用户消息和 Codex 最终回复，不展示推理和工具内部事件。
- 使用 Luna 生成“当前目标、已确认、进行中、待确认”四段式总结。
- `summary-bridge.mjs` 把总结送入 Codex 渲染页面。

这一阶段验证了右侧总结面板和真实会话读取的可行性，但 CDP 注入依赖 Codex 内部 DOM，不适合作为唯一长期集成方式。

### 3.2 当前阶段：单项目真实对话 Web Demo

当前主要开发对象是 `web-ui/` 和 `windows/server/`：

- 页面采用 React + TypeScript + Vite。
- 后端采用 Node.js 原生 HTTP 服务。
- 优先通过 Codex `app-server` 获取结构化任务和真实标题。
- JSONL 读取保留为降级方案。
- 真实对话支持 Markdown、代码、表格、链接、选项和附件。
- 长对话采用分页、缓存和虚拟列表。
- 浏览器可通过 `thread/resume -> turn/start` 向当前真实任务发送指令。
- app-server Notification 通过 SSE 转换为执行状态和流式 Agent 回复。
- Codex 运行时由后端适配器选择，不再固定依赖全局 npm 版本。
- 页面不包含右侧环境信息面板。

## 4. 当前真实数据链路

```text
Codex app-server
  thread/list + thread/read + thread.name
                |
                v
app-server-conversation-store
                |
                +---- 失败时切换 ----> JSONL conversation store
                |
                v
conversation-service
                |
                v
content-blocks + media-service
                |
                v
HTTP API + SSE realtime hub
                |
                v
React conversation + execution features
                |
                v
Codex 风格单项目对话页面
```

当前真实标题来源是 Codex 的 `thread.name`。已经验证当前任务标题可读取为“分析项目结构”。不要再用首条用户正文、关键词规则或 AI 概括替代已有标题。

## 5. 后端结构

入口文件：

- `windows/scripts/remote-room-demo.mjs`：只保留配置读取、依赖组装和 HTTP 服务启动，不再承载全部业务逻辑。

功能模块：

- `windows/server/app-server-client.mjs`：启动并通过 stdio 调用 Codex app-server。
- `windows/server/app-server-conversation-store.mjs`：把 `thread/list`、`thread/read` 结果转换成统一会话模型。
- `windows/server/jsonl-conversation-store.mjs`：从本地 sessions JSONL 读取真实对话，作为降级数据源。
- `windows/server/conversation-service.mjs`：选择主要数据源和降级数据源。
- `windows/server/execution-tracker.mjs`：组装 app-server Turn、Item、Delta 和错误事件；活动映射位于 `windows/server/execution/`。
- `windows/server/content-blocks.mjs`：把不同来源的消息标准化为前端可渲染的内容块。
- `windows/server/media-service.mjs`：登记和读取附件，限制可访问文件，并支持音视频 Range 请求。
- `windows/server/realtime-hub.mjs`：管理 SSE 客户端和刷新通知。
- `windows/server/request-handler.mjs`：只负责鉴权、功能路由分发和静态页面回退。
- `windows/server/routes/`：按会话、群聊、成果和系统能力拆分 HTTP 接口。
- `windows/server/http/`：请求解析、JSON 响应和访问控制。
- `windows/server/multi-agent/`：多 Agent 提示词、协议状态和成果任务辅助逻辑。
- `windows/server/static-files.mjs`：提供 `web-ui/dist` 静态资源。

## 6. 前端结构

跨功能基础视觉组件位于：

- `web-ui/src/components/AppShell/`
- `web-ui/src/components/WindowBar/`
- `web-ui/src/styles/`

这些文件主要决定 Codex 复刻样式。没有用户明确要求，不要修改。

会话侧栏、顶部栏和输入框属于真实对话功能，位于 `web-ui/src/features/conversations/components/`。真实对话功能完整目录为：

- `data/`：HTTP 请求和 API 适配。
- `model/`：项目、会话、消息和内容块类型。
- `hooks/`：项目会话状态、分页、缓存和切换逻辑。
- `realtime/`：SSE 更新连接。
- `components/`：会话列表、连接状态和对话视图。
- `rendering/`：Markdown、媒体、文件和其他内容块渲染。
- `state/`：初始化状态和乐观消息等纯状态辅助。

跨功能 HTTP 和稳定媒体类型位于 `web-ui/src/shared/`。任何新功能不得反向引用 `conversations/data` 获取公共网络能力。

后续功能应继续按功能归属放置，不要重新堆回 `App.tsx`，也不要为了接数据顺带改视觉组件。

浏览器执行功能位于 `web-ui/src/features/execution/`：

- `data/`：发送消息和读取执行状态。
- `model/`：执行阶段和 SSE 事件类型。
- `hooks/`：发送状态、流式文本和事件处理。
- `components/`：输入框底部的真实执行状态。

## 7. 当前内容渲染能力

已经接入：

- 普通文本和 GitHub Flavored Markdown。
- 标题、列表、引用、链接和代码块。
- Markdown 表格。
- 选项类结构化内容。
- 本地图片内联展示。
- 音频原生播放器。
- 视频原生播放器。
- 普通文件打开或下载入口。

媒体文件不是把任意本地路径直接暴露给浏览器。后端先登记允许访问的文件，再通过带 token 的媒体接口读取。音视频支持 HTTP Range，避免必须完整下载后才能播放。

尚未由用户实际验收的重点是：包含真实本地图片附件的完整会话能否从 app-server/JSONL 正确识别并最终显示。代码支持不等于真实附件链路已经视觉验收。

## 8. 当前性能方案

- 初次打开会话只请求最近 60 条消息。
- 向上滚动时按页加载更早历史。
- 使用 `@tanstack/react-virtual` 渲染长对话，减少 DOM 数量。
- 使用会话缓存减少来回切换时的重复加载。
- JSONL 变化优先使用文件系统事件，不再频繁递归扫描整个 sessions 目录。
- app-server 是主要数据源，JSONL 是兼容性降级路径。

性能优化必须以真实瓶颈为依据。不要在没有测量时引入数据库、后台索引服务或复杂缓存系统。

## 9. 构建和运行

包管理器：`pnpm@10.28.2`

在项目根目录运行：

```powershell
pnpm build:ui
pnpm start:demo
pnpm start:demo:build
```

命令职责：

- `pnpm build:ui`：使用现有 pnpm store 构建 React UI。
- `pnpm start:demo`：复用或启动已经构建好的同源 UI + API 服务。
- `pnpm start:demo:build`：先构建，再启动 Demo。

标准本地地址：

```text
http://127.0.0.1:9360/?token=demo123
```

截至 2026-07-22 00:36，服务监听 `0.0.0.0:9360`，本地 API 返回 `200 application/json`。运行状态可能变化，后续 AI 必须重新检查，不能只依据本文宣称服务仍然在线。

## 10. 当前临时公网 Demo

本轮使用本机已有的 `cloudflared.exe` 建立了 Cloudflare Quick Tunnel：

```text
https://bind-calibration-everywhere-chan.trycloudflare.com/?token=demo123
```

建立后页面和 API 均返回 HTTP 200。这个地址具有以下限制：

- 只在本机 Demo 服务和 `cloudflared` 进程持续运行时有效。
- Quick Tunnel 没有稳定性或长期可用保证，重启后地址可能变化。
- `demo123` 是弱演示令牌，不应长期公开传播。
- 正式远程访问前必须使用随机令牌或更可靠的认证机制，并重新审查媒体文件权限。

不要把这个临时地址写成正式部署地址，也不要在没有重新检查时告诉用户它仍然可用。

## 11. 已完成的基本验证

最近一次开发过程中已经完成：

- 后端 `.mjs` 文件通过 `node --check`。
- TypeScript 编译通过。
- Vite 生产构建通过。
- `git diff --check` 通过。
- 本地项目接口返回 HTTP 200。
- API 读取到当前项目 8 个任务。
- 当前任务真实标题返回“分析项目结构”。
- 分页探针能从总计 52 条消息中按请求返回 10 条。
- Cloudflare 临时公网页面和项目 API 返回 HTTP 200。

这些是当时的代码和接口检查结果，不是永久保证，也不是用户视觉验收结论。

## 12. 开发过程中遇到的问题与经验

### 12.1 把正文误当标题

问题：早期 JSONL 方案把第一条用户消息或关键词概括当成标题，和 Codex 侧栏显示不一致。

原因：没有先找到 Codex 的真实标题字段，就用内容推断填补数据缺口。

经验：标题必须优先读取 `thread.name`。只有明确不存在标题时，才能设计可解释的降级规则，并标明这是降级结果。

### 12.2 纯文本模型破坏内容结构

问题：后端只返回 `message.text`，Markdown、代码、选项、附件和媒体信息在到达前端前已经丢失。

经验：内容解析必须保留结构化语义。统一的是内容块接口，不是把所有内容压成字符串。

### 12.3 接入数据时误改 UI

问题：真实数据接入和页面样式修改同时发生，导致最初要求的 Codex 复刻样式发生偏移。

原因：数据、状态、渲染和视觉组件边界不足。

经验：先修数据正确性，再修内容渲染，最后只有获得用户许可才修改 UI。一次迭代不要同时改变三个层面。

### 12.4 组件拆分只按页面区域，不按功能所有权

问题：早期虽然拆出了侧栏、顶部栏和对话区，但请求、状态、实时连接、内容类型和媒体职责仍混在一起。

经验：大型长期项目应同时保留两种边界：基础视觉组件按页面结构组织，业务能力按功能归属组织。

2026-07-28 已完成一次全量文件整理：会话输入、侧栏和顶部栏归回 `features/conversations`；公共 HTTP 与媒体类型进入 `shared`；会话大 Hook、群聊实时状态、群聊 CSS 和后端集中路由完成拆分。后续不得重新堆回集中入口。

### 12.5 JSONL 首行被固定长度截断

问题：只读文件前 32KB，但新版 `session_meta` 首行约 40KB，导致 8 个真实任务只识别出 4 个。

经验：不要猜测真实数据尺寸。先抽取样本矩阵，检查首行长度、CLI 版本、事件类型和消息数量，再决定读取策略。

### 12.6 同时读取重复事件

问题：同时使用 `response_item/message` 和 `event_msg`，造成消息重复，内部 handoff summary 也可能混入页面。

经验：必须先区分 UI 可见事件、内部过程事件和兼容事件；不能仅依赖文本去重。

### 12.7 轮询整个 sessions 目录造成延迟

问题：缓存过期后周期性递归扫描 `~/.codex/sessions`，即使没有变化也重复做文件系统工作。

经验：实时更新优先使用 app-server 通知或文件系统事件，保留低频兜底即可。不要用高频全量扫描模拟实时。

### 12.8 两个端口造成“代码已修但用户仍看到错误”

问题：旧 Vite Preview 使用 `4173`，新同源 UI + API 使用 `9360`。用户打开旧地址时，`/api` 返回 HTML，页面报 `Unexpected token '<'`。

经验：交付前必须确定唯一 canonical URL。构建、启动、说明和链接全部围绕同一入口；前端解析 JSON 前还要检查状态码和 `Content-Type`。

### 12.9 服务启动和退出码误判

问题：后台服务实际已经启动，但 PowerShell 最后一条匹配检查失败，使整条命令看起来失败；早期后台启动也没有日志，难以判断状态。

经验：启动结果、进程状态和 readiness 必须分别判断。不要用最后一条辅助命令的退出码代表整个服务状态。后台服务应有 PID、日志和一次明确的健康检查。

### 12.10 PowerShell 兼容性和编码问题

出现过：

- Windows PowerShell 5 不支持部分新语法。
- `Get-NetTCPConnection` 触发不可用的 CIM/WMI 路径。
- 无 BOM UTF-8 内容被默认 `Get-Content` 显示为乱码。
- 内联中文断言经过 PowerShell 后被破坏。
- `Start-Process` 环境变量和参数转义造成启动失败。

经验：

- 使用 Windows PowerShell 5 兼容语法。
- 端口检查优先 `netstat -ano`。
- 读取中文文件明确指定 `-Encoding UTF8`。
- 自动断言尽量检查结构、数量和状态，不依赖内联中文字符串。
- 后台启动后必须读取日志并请求健康接口。

### 12.11 官方资料获取和 app-server 启动问题

问题：在线官方手册请求遇到 Windows Schannel TLS 握手失败；PowerShell 包装入口也不能透明承载 app-server stdio。

经验：网络资料失败后不要持续重试。可以使用本机 Codex 生成的 app-server schema作为版本匹配的一手依据；stdio 场景直接调用实际 Node/Codex 入口，并保留版本兼容处理。

### 12.12 构建工具链未先锁定

问题：pnpm store 与已有 `node_modules` 来源不一致，非 TTY 环境下 pnpm 尝试重建依赖，浪费时间。

经验：先确认 Node、pnpm、store 路径和 `node_modules/.modules.yaml`，再运行构建。项目的 `build-web-ui.ps1` 已封装当前兼容路径。

### 12.13 自动视觉检查消耗过多

问题：浏览器插件、Playwright 和 headless 浏览器环境连续失败，产生无效尝试；而用户已经明确要自己验收。

经验：本项目默认只做代码、构建、接口和最小运行检查。视觉工具只有用户明确要求时才启用，失败后应尽快停下，不要把验收工具本身变成开发主线。

### 12.14 P0：公网入口排查严重浪费用户资源

发生时间：2026-07-27 22:30 至 23:19 +08:00。

问题：用户要求快速完成最小公网入口，助手却把范围扩展为固定域名、Named Tunnel、Windows 服务、Token 模式、Access、开机恢复和多轮连通性验证；服务卡住、策略拦截和新根因出现后仍连续操作。

责任判断：这不是单纯的 Cloudflare 技术问题，而是助手没有服从“快速、轻量、不要钻牛角尖”的明确边界，没有先调研成熟方案，也没有在失败阈值触发后停止。最终虽恢复临时入口，但不能抵消已经浪费的用户时间、精力、注意力、心气和信任。

P0 停止规则：同一任务出现第二种独立根因、第二次提权或重装、第三轮验证，或用户明确表达等待过久时，立即停止所有扩展操作；只报告已完成、真实失败点和一个最小下一步。未经用户再次明确授权，不继续修改服务、网络、配置或进程。

关联记录：`docs/feature-development/PROCESS_ISSUES.md` 的 `PROC-016`，以及 `docs/feature-development/features/FEAT-006-stable-remote-access.md` 的 `FEAT-006-I05`。

### 12.15 P0：UI 排查触发 Windows 弹窗并卡住

发生时间：2026-07-28 09:15 +08:00。

问题：用户发送手机 UI 截图并要求排查内容缺失和页面横向拖动；助手处理这条 UI 排查任务时触发 Windows 网络授权弹窗并卡住。用户只能回到电脑前确认弹窗，随后才发送“检查重启服务”恢复项目。

责任判断：UI 检查没有限制在只读源码、已有截图和静态产物，也没有在启动可能访问网络或监听端口的工具前设置无交互安全门。后续重启是事故后的恢复措施，不是弹窗或卡住的原因。

强制规则：远程 UI 排查默认只读；可能启动浏览器、Node、网络监听或触发 Firewall、UAC、浏览器授权的工具，必须先证明不会出现桌面确认。无法证明时停止在代码分析。任何弹窗阻塞、取消或超时都必须清理对应运行状态。

关联记录：`docs/feature-development/PROCESS_ISSUES.md` 的 `PROC-017`，以及 `docs/feature-development/features/FEAT-001-single-codex-web.md` 的 `FEAT-001-I14`。

## 13. 当前已知限制和风险

1. 视觉样式仍需用户验收，不能宣称已经“完美复刻 Codex”。
2. 真实图片附件完整链路尚需选取实际样本验证。
3. 浏览器使用独立 app-server 进程；消息会写入同一 Thread，但 Codex Desktop 当前打开的页面不会热刷新外部追加内容。
4. 统一 Connector 完成前，同一 Thread 不应由网页和 Desktop 同时发送，避免界面顺序与真实记录不一致。
5. 固定 URL token 只适合本地 Demo，不适合正式公网。
6. 媒体接口虽然限制已登记文件，正式远程访问前仍需更严格授权审查。
7. Composer 已实现真实消息写入、`turn/steer` 引导和 `turn/interrupt` 停止；Codex 内部审批和补充提问仍未接入，当前按低优先级保留。
8. 当前目标不是多人协作完成版；权限、身份、加密、写入确认和冲突处理都尚未设计完成。
9. 排查时被中断的全局 npm Codex 升级留下不完整安装和临时残留，尚未获得确认执行恢复；项目自身 pnpm 文件未被污染。

## 14. 下一步顺序

### 第一优先：收尾单人 Codex 基础体验

先由用户实际体验手机会话快照、后台同步、公开分析摘要、可读命令、新对话、模型切换和发送失败恢复。只修真实出现的问题，不修改基础 UI，不顺带扩展群聊、Desktop 同步或公网入口。

### 第二优先：防卡死与受控恢复

针对端口/SSE 存活但核心接口无响应的半失效状态，先确定真实业务健康检查、连续异常阈值、重启频率限制、原因记录和页面恢复状态，再选择最小实现。不要预设必须使用某一种守护方案。

### 第三优先：真实附件与内容链路

使用真实图片、音视频和普通文件会话检查上传、识别、展示、下载及失败恢复。现有链路能工作就不升级为通用文件平台。

### 第四优先：Desktop/Web 连续性

继续研究统一 Connector、任务状态和控制权。不能把同一 Thread 当成同一实时客户端，也不能在 React 层伪造 Desktop 热刷新。

### 第五优先：群聊、多 Agent 与交付物后续

单人基础稳定后，再处理多 Agent 讨论队列恢复、交互体验和 Agent 交付物 M2 以后能力。暂不扩展 Agent 数量、企业权限、工具市场或通用任务系统。

### 延后：固定公网入口和浏览器审批

固定域名、正式鉴权、开机恢复和浏览器审批均已记录，但当前不开发。公网入口不得再次扩大为长时间基础设施排查；个人可信环境仍接受必要时回到电脑确认。

## 15. Git 与文件状态说明

远端：

- `origin`：`https://github.com/sukiandfds/negus.git`
- `upstream`：`https://github.com/Fei-Away/Codex-Dream-Skin.git`

当前开发分支：

```text
codex/publish-current-panel
```

不要依赖本文记录固定提交号；开始工作前运行 `git log -1 --oneline`、`git status --short` 和 `git remote -v`。2026-07-22 阶段版本应包含浏览器发送、执行状态、流式回复、运行时兼容修复、Bug 日志、愿景资料和多人协作技术调研。

## 16. AI 助手开始工作前的检查清单

1. 先读本文，再读与当前任务直接相关的源码。
   文件归属不确定时先读 [`docs/architecture/README.md`](./docs/architecture/README.md)，再查看详细边界说明。
2. 查看 `git status --short --branch`，保留用户已有改动。
3. 确认用户要求属于 UI、内容、功能、性能、运行还是公网访问中的哪一层。
4. 如涉及 UI，确认用户是否明确允许修改样式文件。
5. 如涉及运行，先检查 `9360` 是否已有健康服务，不重复启动；用户远程使用时，任何浏览器、Node、网络监听或服务操作必须先通过无桌面弹窗前置门。
6. 如涉及公网，先检查现有 tunnel 是否仍有效，不复用过期地址。
7. 先用真实项目数据验证假设，不创建虚假内容填补未知字段。
8. 用最小改动完成一个清晰目标，做基本检查后停止扩大范围。
9. 报告已验证事实、仍未验证部分和用户会看到的实际变化。

## 17. 相关文档

- `docs/feature-development/README.md`：AI 优先的功能开发记录规范、字段和强制更新时机。
- `docs/feature-development/FEATURE_INDEX.md`：全部功能的当前状态、版本和记录入口。
- `docs/feature-development/PROCESS_ISSUES.md`：跨功能复用的错误路径、正确路径和防再犯规则。
- `docs/feature-development/features/`：每个功能从计划、实现、问题到多个版本的连续记录。
- `docs/project-management/README.md`：项目管理数据源的阅读顺序、条目目录和字段边界。
- `PROJECT_OPERATING_RULES.md`：跨项目复用的开发、命名、交接和项目管理同步规则。
- `PROJECT_RULES.md`：本项目专属的分支、安全和资料边界。
- `docs/project-management/items/<ITEM-ID>/process.md`：单个项目条目的专属弯路、阻塞、决策和效率复盘；跨功能问题回链 `PROC-*`。
- `docs/architecture/README.md`：架构领域、调用边界和跨领域文件的梳理入口。
- `docs/architecture/audits/`：实时事件链路和 Codex 原生读取能力审计；阅读时以报告中的产品基线 SHA 为准。
- `docs/research/DOCUMENTATION_BRANCH_MIGRATION_RESEARCH_2026-08-03.md`：文档分支内容迁移范围、来源和未迁移原因。
- `docs/architecture/MODULE_BOUNDARIES.md`：前后端目录、依赖方向和长文件拆分规则。
- `PROJECT.md`：项目愿景、早期右侧面板和长期方向。
- `DEVELOPMENT_BUG_LOG_2026-07-21.md`：入口、JSONL、启动、错误处理和开发效率问题的详细记录。
- `DEVELOPMENT_LOG_2026-07-22.md`：真实数据、结构化渲染、性能、浏览器控制、运行时修复和 Desktop 同步边界。
- `DEVELOPMENT_BUG_LOG_2026-07-22.md`：启动失败、15 秒含义、全局 npm 环境事故、修复闭环和 Desktop 不热刷新问题。
- `DEVELOPMENT_LOG_2026-07-24.md`：真实群聊、多 Agent、`@` 提及、开发过程、当前交互问题和后续优先级。
- `DEVELOPMENT_LOG_2026-07-25.md`：群聊主入口、共享上下文、有限轮次真实 Agent 讨论及当前边界。
- `DEVELOPMENT_LOG_2026-07-26.md`：PWA、设备身份、移动/平板入口和 AI 功能开发记录体系的发布状态。
- `VISION_NOTES.md`：原始设想、需求演变、商业愿景和顾虑。
- `项目战略与多角色评审/00-调研文档索引与推荐阅读顺序.md`：全部产品、竞品、技术路线调研的分类索引和推荐阅读顺序；进入该文件夹时先读。
- `项目战略与多角色评审/05-多人协作与多Agent技术路径调研报告-2026-07-22.md`：竞品、Codex 能力、推荐 Connector 架构和阶段路线。
- `项目战略与多角色评审/08-ChatGPT-Work-Codex及同类产品对比与项目优劣势-2026-07-27.md`：ChatGPT Work、Codex、主要同类产品和本项目当前优劣势的最新对比。

重复出现的实时状态、远程控制、任务恢复和多 Agent 问题，在提出新实现前必须先从 `00-调研文档索引与推荐阅读顺序.md` 定位 Happy、OpenClaw/Harness、Orca 等既有调研，再核对对应项目的真实源码机制。只读当前项目代码、只增加状态文案、超时或重启补丁，视为未完成开发前置检查。

本文优先用于快速建立上下文；遇到本文与实际代码或运行状态不一致时，以重新检查后的代码、接口、进程和 Git 状态为准，并把差异明确告诉用户。
