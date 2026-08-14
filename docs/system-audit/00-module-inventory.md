# 00 全部模块清单

这张表用于确认系统清扫没有只围绕单人页和群聊。功能状态仍以 `docs/feature-development/FEATURE_STATUS_INDEX.md` 为准；本表只记录当前源码边界、共用关系和系统级清理关注点。

## 前端功能目录

| 前端模块 | 主要入口/职责 | 后端或共享对应 | 共用关系 | 清理判断 |
| --- | --- | --- | --- | --- |
| `agent-sharing` | 员工对话打开、消息分享和带回群聊 | `agent-publication-service`、员工会话 | 依赖 conversations、group-chat 导航 | 绑定关系应统一走 `ConversationBinding` |
| `app-update` | 新构建提示、刷新和应用就绪 | `web-version`、静态文件 | 被单人消息页和应用外壳使用 | 作为跨页面基础能力保留 |
| `artifacts` | 交付物列表、预览、审核、下载 | `artifact-service`、Artifact routes | 被群聊消息和结果展示使用 | 领域边界清楚，继续保持独立 |
| `attachments` | 附件草稿、上传、预览和媒体模型 | `media-service`、`attachment-content-service` | 单人和群聊共同使用 | 继续作为共享能力，补统一 ContentBlock |
| `context-management` | 上下文状态、设置和压缩入口 | `context-management-service` | 当前主要由单人页使用 | 群聊接入应按 Agent/Room 语义设计，不复制单人状态 |
| `conversation-sharing` | 会话分享对话框和目标选择 | 会话/员工分享接口 | 依赖 conversations 和 agent-sharing | 目标类型应统一为绑定/投影，而不是只接受 Thread |
| `conversations` | 单人会话目录、消息、输入、操作、历史 | `conversation-service`、app-server/JSONL store | 使用 execution、models、context、attachments | 核心模块，Hook/组件过重，见 02/03 |
| `device` | 设备身份和设备信息 | system routes | 被应用壳和分享入口使用 | 保持与鉴权 token 解耦 |
| `employee-capabilities` | 员工能力面板、规则/Skill 等 | `employee-growth-service`、员工运行时 | 员工项目和 Agent 页面使用 | 能力描述应与群聊 capability descriptor 共用 |
| `employee-growth` | 成长事实、建议和审批 | `employee-growth-store/service` | 员工项目和员工详情使用 | 审批状态应进入统一 Activity/Review 状态 |
| `execution` | 执行状态、活动时间线、控制和缓存 | `execution-tracker`、app-server client | 单人页使用，群聊有平行状态 | 视图可以共用，状态机不应强行合并 |
| `group-chat` | 房间、成员、Agent、消息、历史、输入和 SSE | `group-room-store`、`multi-agent-service` | 使用 project-directory、attachments、artifacts | 基础对话能力应对齐单人，群聊特有调度独立 |
| `intelligence-efficiency` | 模型效率/筛选控制 | `/api/models` 及模型数据 | 与 models 相关 | 需要确认它是模型域能力还是独立产品控制 |
| `models` | 模型列表、选择和推理强度 | conversation routes `/api/models` | 单人输入框使用 | 群聊应按 Agent 设置接口复用模型描述，不复制选择器逻辑 |
| `project-directory` | 项目、业务项目、员工项目和会话导航 | `employee-project-directory`、`project-identity-store` | 单人和群聊共同使用 | 实际是系统导航域，应正式登记为跨页面能力 |
| `project-management` | 项目管理入口、条目和更新记录 | `project-management-store`、system routes | 使用 AppShell 和项目身份概念 | 不应直接读取会话或群聊内部状态 |
| `project-progress` | 项目进度、日志和入口切换 | `project-progress-store`、system routes | 使用项目身份和应用外壳 | 需要统一 `ProjectIdentity`，保留独立展示职责 |
| `usage-monitor` | 浮生云算用量摘要和详情 | `fusheng-usage-service`、usage routes | 标题栏/外壳控制 | 外部供应商数据应保持 provider adapter 边界 |

## 服务端功能域

| 后端域 | 主要文件 | 对应前端 | 当前系统级判断 |
| --- | --- | --- | --- |
| 会话 | `conversation-service.mjs`、`app-server-conversation-store.mjs`、`jsonl-conversation-store.mjs`、`content-blocks.mjs` | `conversations`、`attachments` | 主数据源、fallback 和内容转换已存在，但需要统一 ConversationBinding |
| 执行与实时 | `execution-tracker.mjs`、`app-server-client.mjs`、`realtime-hub.mjs` | `execution`、conversations/group-chat realtime | 协议适配、状态转换和广播边界需要继续拆清 |
| 群聊与多 Agent | `group-room-store.mjs`、`group-room-directory.mjs`、`multi-agent-service.mjs`、`multi-agent/` | `group-chat` | 业务基础具备，队列账本和跨项目投影仍不完整 |
| 项目身份 | `project-identity-store.mjs`、`business-project-config.mjs` | `project-directory`、progress、management | 应成为所有项目入口的唯一身份来源 |
| 员工 | `employee-definitions.mjs`、`employee-project-registry.mjs`、`employee-runtime-service.mjs`、`employee-project-directory.mjs` | employee features、agent-sharing、project-directory | 当前是系统最容易出现多源关系的区域 |
| 员工会话 | `agent-conversation-store.mjs`、`agent-publication-service.mjs` | conversations、agent-sharing | 主对话和群聊投影需要声明不同 conversation kind |
| 员工成长 | `employee-growth-store.mjs`、`employee-growth-service.mjs`、`employee-growth-reviewer.mjs` | `employee-growth`、`employee-capabilities` | 审批和运行状态应明确事件边界 |
| 附件与媒体 | `media-service.mjs`、`attachment-content-service.mjs` | `attachments` | 可作为共享基础能力，避免群聊/单人重新解析 |
| Artifact 与输出 | `artifact-service.mjs`、`web-output-service.mjs` | `artifacts`、group-chat | 交付物服务相对独立，继续通过引用挂载到消息 |
| 图片生成 | `image-generation/`、`conversation-routes.mjs` 相关辅助 | models/attachments/artifacts/group capability | 外部供应商和 MCP 应保持 adapter，不把 `negus_image` 逻辑扩散到视图 |
| 项目管理与进度 | `project-management-store.mjs`、`project-progress-store.mjs` | management、progress | 数据来源和项目身份需统一，但业务视图可独立 |
| 用量 | `fusheng-usage-service.mjs` | usage-monitor | provider-specific，保持独立并统一失败/缓存状态 |
| 系统与路由 | `request-handler.mjs`、`routes/`、`http/` | 所有模块 | 路由已拆分，后续只增加领域路由，不回堆到 request-handler |

## 平台与历史产品线

| 区域 | 作用 | 本次处理 |
| --- | --- | --- |
| `windows/scripts/start-*.ps1`、`restart-*.ps1` | Web 服务启动、重启和就绪检查 | 作为运行时边界记录，不混入业务清理 |
| `windows/scripts/remote-room-demo.mjs` | 当前 Web 服务组合根 | 纳入系统级组装审查 |
| `windows/assets/`、`windows/scripts/*dream-skin*` | Windows 历史换肤产品 | 保留，不能因 Web 整理删除 |
| `macos/` | macOS 历史换肤产品 | 保留，按项目指南与 Web 主系统隔离 |
| `runtime/` | 用户本机运行数据 | 不读取内容、不删除、不提交审查结论以外的数据变更 |

## 总体判断

模块数量本身不是主要问题。真正需要清理的是跨模块概念：项目身份、员工身份、会话绑定、消息视图、活动状态、能力描述和持久化接口。只要这些接口稳定，现有目录大多可以保留，后续改动也能控制在小范围内。
