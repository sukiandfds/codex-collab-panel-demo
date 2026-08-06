---
feature_id: FEAT-007
title: Agent 交付物生成、预览与版本管理
status: implemented_pending_review
current_version: v0.2.1
last_updated: 2026-07-27 22:23 +08:00
owners: [artifacts, group_chat, agent_execution]
key_paths:
  - windows/server/artifact-service.mjs
  - windows/server/request-handler.mjs
  - windows/server/realtime-hub.mjs
  - web-ui/src/features/artifacts
  - web-ui/src/features/group-chat
related_features: [FEAT-002, FEAT-003]
---

# FEAT-007：Agent 交付物生成、预览与版本管理

## 1. 本文用途

本文是交给开发助手的单一入口。开发前完整阅读本文，然后只沿本文列出的源码和既有功能档案检查必要上下文，不要扫描全部历史日志。

本文同时记录：

- 用户希望得到的产品效果；
- 本项目的产品理念和开发边界；
- 当前已经存在的能力；
- 推荐技术结构；
- 分阶段开发顺序；
- 第一里程碑的明确范围。

本文中的“已验证”来自当前项目源码或已有功能档案；“方案”表示尚未实现的设计，不能在开发结果中描述为现有能力。

## 2. 产品目标

本项目不是普通聊天软件，也不是只展示多个角色 Prompt 的 Agent 群聊。长期目标是：

> 多名真人能够在一个项目群中，共同监督一支真实工作的 Agent 团队；专业 Agent 在自己的工作上下文中完成任务，只把有决策价值的信息、风险、证据和交付物发布到群里。

群聊中应优先出现：

- 新的、影响决策的事实；
- 专业判断及其证据；
- 重要分歧、风险和待确认事项；
- Agent 之间的交接、审核和打回；
- 用户可以直接使用、下载或审核的成果。

原始尝试、工具调用和冗长过程保留在 Agent 工作日志，不持续灌入主群。

本功能要补上的核心关系是：

```text
群消息 -> 任务 -> Agent 执行 -> 交付物 -> 审核 -> 新版本或批准
```

## 3. 用户可见的目标效果

用户在群里要求 Agent 制作文档、表格、幻灯片、图片、网页或压缩包后：

1. Agent 开始执行，群里继续显示克制的阶段状态。
2. Agent 生成真实文件，而不是只回复“已经完成”。
3. 文件完成后，群消息中出现交付物卡片。
4. 卡片显示文件名、类型、大小、版本、创建者和当前状态。
5. 支持的类型可以直接预览；原始文件始终可以下载。
6. 用户可以批准或打回；打回后生成新版本，旧版本仍可追溯。
7. 多端通过现有 SSE 收到 `artifact.ready` 等事件，不依靠持续轮询猜测完成时间。

## 4. 当前已验证能力

当前项目已经具备以下基础，不应重复开发：

- `windows/server/media-service.mjs`：文件登记、上传、SHA-256 存储命名、受控读取、下载、`nosniff` 和 HTTP Range。
- `windows/server/request-handler.mjs`：`/api/uploads`、`/api/media/:id`、群消息和单人消息接口。
- `windows/server/content-blocks.mjs`：Markdown、图片、音频、视频和普通文件内容块标准化。
- `web-ui/src/features/attachments/`：单人页和群聊共用的附件选择、上传和展示。
- `web-ui/src/features/conversations/rendering/ContentRenderer.tsx`：结构化内容渲染入口。
- `windows/server/realtime-hub.mjs`：SSE 实时事件基础设施。
- `windows/server/group-room-store.mjs`：群消息持久化。
- `windows/server/multi-agent-service.mjs`：真实 Codex Agent 调度和群内回复。

当前附件限制：

- 每个附件最大 20 MB；
- 每次最多 6 个附件；
- 上传请求整体缓存在内存中；
- 没有分片、断点续传、病毒扫描和对象存储；
- HTML 当前只作为文件打开或下载；
- 没有 Office 预览、交付物版本、审核状态和 Agent 发布 API。

## 5. 关键技术决策

### 5.1 输入附件和 Agent 交付物必须分开

现有 `media-service` 负责底层文件登记和传输。Agent 交付物需要独立的 `Artifact` 功能域，负责：

- 交付物属于哪个项目、任务和消息；
- 由哪个 Agent 创建；
- 当前版本和历史版本；
- 生成、审核、批准、打回和替代状态；
- 原始文件与预览文件的关系。

不要把这些业务字段继续塞进 `media-service`。可以复用它的受控文件服务能力，但所有权、版本和审核逻辑必须放在 `artifact-service`。

### 5.2 消息只引用稳定 ID

群消息不保存二进制文件、Base64 或本机绝对路径，只保存 `artifactId`。服务端根据 ID 返回元数据和受控 URL。

### 5.3 第一阶段不开发 Office 编辑器

DOCX、PPTX 和 XLSX 的第一阶段目标是：

- 生成真实原始文件；
- 原始文件可下载；
- 可行时生成 PDF、PNG 或只读表格预览；
- 不在聊天页面内实现 Word、PowerPoint 或 Excel 编辑器。

### 5.4 HTML 必须隔离执行

Agent 生成的 HTML、网页和动画不得直接插入群聊 DOM。正式预览必须使用独立来源或严格沙箱的 iframe，并满足：

- 不使用 `allow-same-origin`；
- CSP 默认禁止联网；
- 不带项目 Cookie、API Token 或本机路径；
- 禁止 Service Worker；
- 不允许访问父页面 DOM。

在沙箱完成前，HTML 只能下载，不能以内联执行冒充预览。

## 6. 建议数据模型

最小 `Artifact` 元数据：

```text
artifact_id
project_id
task_id
message_id
created_by_agent
name
mime_type
size
sha256
version
status
source_media_id
preview_type
preview_media_id
created_at
updated_at
```

状态：

```text
generating -> reviewing -> ready
                      -> rejected -> generating
ready -> superseded
```

第一阶段允许 `task_id` 为空，因为当前群聊尚未形成正式持久任务模型；字段需要保留，不能用群消息 ID 永久代替任务 ID。

建议持久化为项目运行目录中的独立 JSON 文件或现有轻量存储模式。当前 Demo 不应仅为本功能引入数据库。写入必须采用临时文件加原子替换，避免服务中断产生半截 JSON。

## 7. 建议服务端边界

新增功能目录或模块：

```text
windows/server/artifact-service.mjs
```

职责：

- `publish(...)`：登记 Agent 已生成的真实文件；
- `get(id)` / `list(...)`：读取元数据；
- `review(id, decision, note)`：批准或打回；
- `createVersion(...)`：在同一交付物下登记新版本；
- 校验路径、文件存在、大小、MIME、SHA-256 和调用方身份；
- 通过现有 media service 登记原始文件和预览文件；
- 发布 SSE 事件。

建议 API：

```text
POST /api/artifacts/publish
GET  /api/artifacts/:id
GET  /api/artifacts?messageId=...&taskId=...
POST /api/artifacts/:id/review
```

`publish` 只接受服务端允许目录中的文件或已经登记的 `mediaId`，禁止浏览器提交任意绝对路径。

建议事件：

```text
artifact.generating
artifact.ready
artifact.failed
artifact.reviewed
artifact.superseded
```

事件至少包含 `artifactId`、`messageId`、`status`、`version` 和 `updatedAt`。断线后以 HTTP 重新读取为准，SSE 只负责增量通知。

## 8. 建议前端边界

新增独立功能目录：

```text
web-ui/src/features/artifacts/
  data/
  model/
  hooks/
  components/
```

第一阶段组件建议：

- `ArtifactCard`：名称、类型、版本、状态、创建者、大小、预览和下载入口；
- `ArtifactPreview`：按已支持类型选择预览器；
- `ArtifactReviewActions`：批准、打回及备注；
- `useArtifacts`：读取元数据并处理 SSE 增量事件。

群聊的 `MessageTimeline` 只负责在消息位置挂载交付物组件，不承载交付物业务逻辑。不要把 Artifact 状态写进现有附件组件，也不要为接入数据修改基础 UI 样式文件。

## 9. 文件类型展示策略

| 类型 | 第一阶段网页行为 | 后续能力 |
| --- | --- | --- |
| Markdown | 使用现有安全 Markdown 渲染 | 版本差异 |
| 图片/GIF | 内联、懒加载、原图下载 | 标注与比较 |
| 音频/视频 | 原生播放器、Range 请求 | 转码与封面 |
| PDF | 浏览器内联预览、下载 | 页缩略图 |
| DOCX | 原始文件下载；转换能力可用时显示 PDF/PNG 预览 | 在线协同编辑 |
| PPTX | 原始文件下载；转换能力可用时显示 PDF/逐页图片 | 在线协同编辑 |
| XLSX | 原始文件下载；后续提供只读表格/图表预览 | 在线协同编辑 |
| HTML | 第一里程碑只下载 | 独立来源沙箱预览 |
| 动画 | GIF/视频按媒体展示；HTML/Lottie 暂只下载 | 沙箱播放 |
| ZIP/7Z | 下载 | 扫描后的目录树预览 |

## 10. 第一里程碑 M1：开发助手本轮应实现的范围

### 必须完成

1. 新增独立 `artifact-service`，使用轻量持久化保存交付物元数据。
2. 支持从服务端允许目录或既有 `mediaId` 发布真实交付物。
3. 提供读取、发布、批准/打回 API。
4. 发布 `artifact.ready` 和 `artifact.reviewed` SSE 事件。
5. 群消息可以引用 `artifactIds`，已有无交付物消息保持兼容。
6. 新增独立 `features/artifacts` 前端功能域和 `ArtifactCard`。
7. 支持 Markdown、图片、音视频和 PDF 的现有能力复用，以及所有文件的下载。
8. 显示版本、状态、创建者和文件大小。
9. 记录本次实现到本文版本时间线，并更新 `FEATURE_INDEX.md` 状态。

### 本轮不做

- DOCX/PPTX/XLSX 自动转换；
- HTML 或动画沙箱；
- Office 在线编辑器；
- 大文件分片和断点续传；
- 病毒扫描、对象存储和签名 URL；
- 正式账号、组织权限和多租户；
- 完整任务系统；
- 重做群聊、单人页或 Codex 基础视觉；
- 改动稳定公网入口；
- 新增无关依赖和大范围重构。

## 11. 后续里程碑

### M2：办公文件预览

- DOCX 转 PDF/PNG；
- PPTX 转 PDF/逐页图片；
- 保留原始文件下载；
- 转换失败只影响预览，不得导致原始交付物丢失。

### M3：安全网页成果

- 独立来源的 HTML 沙箱；
- 严格 CSP 和无凭证访问；
- HTML/动画预览；
- ZIP 解压大小、文件数和目录深度限制。

### M4：正式文件基础设施

- 大文件分片、续传和进度；
- 恶意文件扫描；
- 对象存储与签名 URL；
- 正式权限、分享和审计。

## 12. 推荐端到端流程

```text
用户提出交付目标
  -> 项目经理 Agent 形成任务或临时工作单
  -> 专业 Agent 在独立 Thread/工作区执行
  -> Agent 调用 artifact.publish
  -> artifact-service 记录文件、版本、创建者和关联消息
  -> 可选预览任务生成 preview media
  -> SSE 发送 artifact.ready
  -> 群消息显示预览/下载/批准/打回卡片
  -> 打回后产生新版本，旧版本变为 superseded
```

Agent 不能只在回复文本中写一个无法验证的本机路径。只有 `artifact.publish` 成功并返回 `artifactId`，才算交付完成。

## 13. 开发边界与强制约束

- 当前工作区已有未提交改动；必须先执行 `git status --short` 并保护所有既有变化，禁止回滚、覆盖或整理与本功能无关的文件。
- UI、内容和功能分开。没有用户明确许可，不修改 `web-ui/src/components/`、`web-ui/src/styles/` 及现有基础样式。
- 优先复用项目既有 Node 原生 HTTP、SSE、React 和 TypeScript 模式，不引入新框架。
- 使用 `pnpm@10.28.2` 和现有脚本，不使用 npm/yarn，不更换 store，不自动安装依赖。
- 服务端变更完成后，不要误认为 `pnpm start:demo` 会自动重启旧服务；除非用户明确要求运行或重启，本轮只做代码和构建检查。
- 不进行截图、像素对比或用户验收。用户负责体验验收。
- 遇到 Office 转换器、HTML 沙箱或权限等超出 M1 的问题，记录并跳过，不钻牛角尖。
- 所有文件访问使用受控 ID，不暴露绝对路径，不把 Token 写入交付物 URL。
- 结构化数据使用 JSON 读写，不用字符串拼接模拟数据库。

开发前还需要定向阅读：

1. `AI_ASSISTANT_READ_FIRST.md`
2. `docs/feature-development/PROCESS_ISSUES.md` 的 active 条目
3. `docs/feature-development/features/FEAT-002-group-multi-agent.md`
4. `docs/feature-development/features/FEAT-003-attachments-content-rendering.md`
5. 本文列出的关键源码

## 14. 基本检查与完成报告

开发助手只做与改动风险匹配的基本检查：

```powershell
node --check <本轮修改的 mjs 文件>
pnpm build:ui
git diff --check
```

如已有定向测试文件，运行相关测试；不要扩大为视觉验收或全仓库无关检查。

完成后向用户简短报告：

- 实际完成了哪些 M1 项目；
- 用户会看到什么变化；
- 修改了哪些功能目录；
- 基本检查结果；
- 哪些内容按边界留给 M2 以后；
- 是否没有修改基础 UI 文件。

不要自行 commit、push、启动服务或部署，除非用户在开发对话中再次明确要求。

## 15. 问题记录

| 问题编号 | 分类 | 状态 | 问题 | 根因与正确路径 |
| --- | --- | --- | --- | --- |
| `FEAT-007-I01` | 特例 | resolved | 发布接口一度允许请求体覆盖文件名和 MIME，可能与媒体登记结果不一致 | 交付物元数据必须以已登记媒体或允许目录中的真实文件为准，客户端不能覆盖文件身份字段 |
| `FEAT-007-I02` | 特例 | resolved | 初版 SHA-256 计算一次性读取整个文件，允许目录文件较大时会增加内存占用 | 改为读取流增量计算哈希；M1 仍不扩展分片上传和正式大文件基础设施 |
| `FEAT-007-I03` | 特例 | resolved | 同一交付物发布新版本时，重复关联相同 `artifactId` 会产生无意义的群消息更新 | `attachArtifact` 改为幂等；相同引用直接返回，新版本由 `artifact.ready` 触发刷新 |
| `FEAT-007-I04` | 特例 | resolved | 交付物元数据读取失败后一直显示“正在读取交付物” | Hook 只保存成功结果且吞掉失败；现已增加显式错误状态和手动重试，成功后恢复真实卡片 |
| `FEAT-007-I05` | 普适 | mitigated | 首次前端大补丁因一处上下文不匹配而整体失败 | 见 `PROC-006`；新增文件与现有文件接线必须拆成小补丁 |
| `FEAT-007-I06` | 普适 | active | PowerShell 中再次把 `*.mjs` 通配符作为 `rg` 路径传入 | 见 `PROC-012`；传目录并使用 `-g '*.mjs'` 过滤 |
| `FEAT-007-I07` | 普适 | active | 新版本记录曾倒序插入，且更新时间一度早于已有条目 | 见 `PROC-014`；先读取最后版本和时间，再在时间线末尾正序追加 |

## 16. 版本时间线

### 2026-07-27 22:20 +08:00 | v0.1.0 | planned

- 计划：建立 Agent 交付物的独立功能域，连接群消息、真实文件、预览、版本和审核。
- 实际：完成产品与技术交接文档，尚未修改代码。
- 偏差：无。
- 问题：Office 预览、HTML 沙箱和正式文件基础设施按里程碑后置。
- 验证：核对现有附件、内容渲染、群聊、SSE 和媒体服务源码入口。
- 用户可见变化：暂无；本文用于交给独立开发助手实施 M1。
- Git：uncommitted。

### 2026-07-27 22:21 +08:00 | v0.2.0 | implemented_uncommitted

- 计划：严格实施 M1，建立独立交付物服务、群消息引用、基础预览、下载、版本和审核闭环。
- 实际：新增轻量 JSON 持久化 `artifact-service`，支持允许目录相对路径和既有 `mediaId` 发布；新增读取、列表、发布、批准/打回 API；接入 `artifact.ready`、`artifact.reviewed` 和 `group_message_updated` SSE；群消息新增兼容的 `artifactIds`；前端新增独立 `features/artifacts` 功能域和交付物卡片。
- 偏差：M1 不包含 Agent 动态工具注册或自动扫描任意项目路径；交付物由受控发布 API 登记后进入群消息。HTML、Office 和压缩包仍只下载。
- 问题：`FEAT-007-I01`、`FEAT-007-I02`、`FEAT-007-I03`、`FEAT-007-I05`、`FEAT-007-I06`，并关联 `PROC-006`、`PROC-012`。
- 验证：4 个修改后 MJS 文件通过 `node --check`；`windows/tests/artifact-service.test.mjs` 3 项定向测试通过；相关 Artifact、群聊 Agent 和 SSE 共 7 项测试通过；`pnpm build:ui` 通过；未做视觉验收，未启动或重启服务。
- 用户可见变化：已登记的 Agent 交付物会附着在对应群消息下方，显示文件名、类型、大小、版本、创建 Agent 和审核状态；Markdown、图片、音视频、PDF 可直接预览，所有文件可下载；用户可批准或填写原因打回，并可展开下载历史版本。
- 边界：未修改 `web-ui/src/components/`、`web-ui/src/styles/` 或现有基础样式；M2、M3、M4 均未开展。
- Git：uncommitted。

### 2026-07-27 22:22 +08:00 | v0.2.1 | implemented_uncommitted

- 计划：修复交付物读取失败后永久停留在加载状态的体验问题。
- 实际：`useArtifacts` 增加独立读取错误状态；交付物卡片读取失败后显示明确提示和重试按钮，重试成功后恢复真实卡片。
- 偏差：无；只修改 `features/artifacts` 内部状态和组件接线，没有扩展 M2、M3、M4。
- 问题：解决 `FEAT-007-I04`；记录 `FEAT-007-I07` 和 `PROC-014`，并将本时间线恢复为正序。
- 验证：`pnpm build:ui` 和 `git diff --check` 通过；未做视觉验收，未启动或重启服务。
- 用户可见变化：网络异常或交付物记录暂时不可用时，不再无限显示“正在读取交付物”；用户会看到失败提示并可直接重试。
- Git：uncommitted。

## 17. 下一步

由用户体验 M1 后，再决定是否进入 Office 预览 M2，不要同时展开 M2、M3 和 M4。
