# 09 系统优化方案

本方案基于 `00-08` 号审查文档提出，当前只记录优化方向，不修改业务源码、不删除运行数据。

目标不是单纯减少文件数量，而是让每个概念只有一个定义、每条数据只有一个主来源、每个页面只负责展示和交互。最终形成：

```text
集中定义身份/策略/能力
          |
          v
统一领域契约 -> 各领域服务 -> Thread/Room/文件/MCP 适配器
          |
          v
统一视图与事件 -> 单人页 / 群聊页 / 员工投影
```

## 总体原则

| 原则 | 具体含义 | 不应采取的做法 |
| --- | --- | --- |
| 删除重复，不删除领域 | 删除重复映射、重复渲染、重复存储模板和过时分支 | 直接删除员工项目、群聊投影或 `runtime/` 数据 |
| 公共契约优先 | 先统一类型、输入输出和事件语义，再抽组件和移动文件 | 先把两个页面强行合成一个巨型组件 |
| 集中定义，分域执行 | 身份、角色、能力、路由和错误码集中注册；执行逻辑仍由领域服务负责 | 把所有业务塞进一个 registry 或组合根 |
| 增量读取，按需计算 | 历史、事件、附件和消息只读取当前窗口需要的部分 | 每次刷新读取完整快照再 `slice(-300)` |
| 运行时与源码分离 | 员工定义可以提交到源码，用户对话、上传、任务状态仍写入 `runtime/` | 把对话或本机密钥提交进代码仓库 |
| 兼容迁移，最后清理 | 先提供新契约和适配器，调用方切换后再删除旧实现 | 一次性重写单人、群聊和员工三条链路 |

## 一、删除

删除分为三类。第一类在确认没有引用后可以直接删；第二类必须先迁移到公共契约；第三类不应作为清理目标。

### 1.1 可以直接删除或合并的重复逻辑

| 优先级 | 删除对象 | 当前问题 | 替代方案 | 完成条件 |
| --- | --- | --- | --- | --- |
| P0 | 前端 `employeeDisplayNames`、员工名称兼容映射 | 员工名称与 `employee.json`、房间快照可能不一致 | 页面直接使用服务端 `AgentIdentity.displayName` | 全仓库不再存在同一员工的第二套显示名 |
| P0 | 前端硬编码的 `manager`、`developer` 等默认 Agent ID | 改名、禁用或增加角色时需要同时改多个页面 | 使用集中角色策略返回的 `agentId` | 页面不再通过字符串猜默认角色 |
| P1 | 单人页和群聊各自的时间格式化、日期分隔判断 | 精度、时区和无效时间处理可能分叉 | 共享 `formatMessageTime`、`getDateDividerKey` | 两个入口对同一时间输出完全一致 |
| P1 | 群聊独立的 Markdown 渲染分支 | 群聊能力低于单人页，附件和媒体行为不一致 | 统一 `ContentBlock` 转换和 `ContentRenderer` | `MessageTimeline` 只负责消息外壳和发送者信息 |
| P1 | `snapshot().messages.slice(-300)` 形式的历史读取 | 不同入口的历史上限不一致，无法恢复更早消息 | 统一 `HistoryPage` 和游标接口 | 调用方不再自行截取消息数组 |
| P1 | 重复的员工群聊历史读取路径 | 员工项目和群聊主页面可能读到不同数据 | 统一读取投影或统一历史查询服务 | 员工投影明确标记只读，历史范围与主房间一致 |
| P2 | 各 Store 重复的 JSON 读取、临时文件、rename、写队列、`close/flush` | 并发、错误恢复和关闭顺序由每个文件自行实现 | `atomic-json-store` + 统一生命周期接口 | 业务 Store 只实现序列化和领域操作 |
| P2 | 组合根中的员工群聊投影业务分支 | `remote-room-demo.mjs` 同时负责组装和业务映射 | 移入 `employee-group-projection-service` | 组合根只创建服务并注入回调 |
| P2 | 已失效的页面专用导航分支和默认房间回退 | `current-project` 等默认值容易把员工和普通项目混在一起 | 统一 `DirectoryEntry` 和 `RoomBinding` | 没有入口依赖页面名称或默认 cwd 猜身份 |

### 1.2 迁移后再删除的代码

| 旧实现 | 先迁移到 | 迁移完成后删除 |
| --- | --- | --- |
| `SessionMessage`、`GroupMessage`、员工本地消息在页面层分别转换 | `MessageView` 转换层 | 页面内的三套字段拼装和重复类型别名 |
| 单人事件 Hook 与群聊事件 Hook 各自处理重连、快照合并 | `RealtimeSubscription`、领域事件解释器 | 重复的连接状态、重连和事件序号处理 |
| `GroupComposer` 与 `ConversationComposer` 各自维护菜单/附件/草稿细节 | `ComposerDraft`、`CapabilityDescriptor`、菜单插入协议 | 重复的菜单状态、附件状态和插入字符串逻辑 |
| `ProjectDirectory` 内部同时处理数据归类、名称修正和导航 | `DirectoryViewModel`、`DirectoryAction` | 组件内的身份猜测、员工名称映射和 URL 拼接 |
| `useProjectConversations`、`useGroupRoom` 内同时维护缓存、历史、发送和实时 | 查询 Hook、发送 Hook、订阅 Hook | 超长 Hook 中互相耦合的状态分支 |
| `workQueue/currentRun` 内存 Promise 链 | `DiscussionJob`、`AgentRun`、`ActivityEvent` 账本 | 无法恢复的临时队列字段和仅进程内状态判断 |

### 1.3 明确不删除的内容

| 内容 | 不删除原因 | 正确的优化方式 |
| --- | --- | --- |
| `employees/` 员工定义目录 | 它是系统内置员工的源码身份，应随系统提交 | 只保留身份、策略、能力和版本；用户对话放 `runtime/` |
| 员工独立项目身份 | 员工主 Thread 需要独立 `projectRoot/contextRoot` 和权限边界 | 统一绑定接口，不把员工复制到业务项目 |
| 群聊 Agent 子会话/投影记录 | 它们代表员工参与项目的真实记录 | 明确 `conversationKind`、读写权限和展示分组 |
| `runtime/`、上传、Artifact、JSONL 历史 | 删除会造成历史、任务或交付物丢失 | 统一保留、归档、压缩和清理策略 |
| 单人 Thread 与群聊 Room 的底层存储 | 两者运行时语义不同，强行共库会增加风险 | 共用视图和传输契约，存储继续由适配器隔离 |
| 独立的项目管理、进度、用量领域 | 它们有独立业务语义 | 只共用项目身份、错误和缓存基础设施 |

## 二、公共化

公共化的重点是数据契约和基础设施，不是把所有页面合成一个组件。

### 2.1 核心领域契约

| 公共契约 | 建议字段 | 当前替代的重复来源 | 使用方 |
| --- | --- | --- | --- |
| `ProjectIdentity` | `projectId/key/kind/root/displayName/status` | `cwd`、文件夹名、业务配置、前端项目映射 | 项目目录、会话、房间、进度、管理 |
| `AgentIdentity` | `agentId/displayName/role/definitionVersion/projectRoot/contextRoot/capabilities` | `employee.json`、注册表、房间快照、前端名称映射 | 员工页、侧栏、群聊成员、运行时 |
| `RoomBinding` | `roomId/projectId/memberAgentIds/stateFile/readOnly` | 默认房间 ID、房间快照、页面默认值 | 群聊、项目目录、运行时、历史 |
| `ConversationBinding` | `conversationId/kind/projectId/agentId/roomId/runtimeSessionId/readOnly` | Thread ID、员工项目 ID、投影路径的隐式关系 | 单人会话、员工主对话、群聊投影 |
| `ConversationKind` | `project-thread/employee-main/room-thread/employee-projection` | 页面通过路径和字段猜会话类型 | 导航、权限、历史、展示分组 |
| `MessageView` | `id/source/author/role/blocks/attachments/createdAt/parentId/status` | `SessionMessage`、`GroupMessage`、员工本地消息 | 所有消息时间线和分享入口 |
| `ActivityView` | `id/source/phase/label/detail/active/startedAt/updatedAt/streaming` | `ExecutionStatus`、`GroupActiveWork`、员工状态缓存 | 状态栏、运行过程、恢复提示 |
| `HistoryPage` | `items/cursor/hasOlder/hasNewer/dateScope/source` | Thread 分页、房间 sequence、员工 `slice` | 单人、群聊、员工投影 |
| `SendReceipt` | `requestId/clientMessageId/submissionId/status/resourceId/errorCode` | `submissionId`、`jobId`、`requestId` 三套命名 | 所有发送入口、重试、幂等和通知 |

### 2.2 公共基础能力

| 能力 | 公共接口 | 保留的领域差异 |
| --- | --- | --- |
| 内容渲染 | `ContentBlock` -> `ContentRenderer` | 消息外壳、发送者、审核按钮由页面决定 |
| 附件 | `AttachmentRef`、统一访问 URL 和预览状态 | 上传权限和消息挂载策略按领域决定 |
| Artifact | `ArtifactRef`、版本和审核状态 | 群聊/单人可有不同操作权限，但不重复解析数据 |
| 能力菜单 | `CapabilityDescriptor`、菜单项、插入/执行协议 | 单人和群聊可配置可用能力，不复制菜单状态机 |
| 实时传输 | `RealtimeSubscription`、`RecoveryState`、事件序号 | Thread/Room/员工各自保留事件解释器 |
| 缓存 | `CacheEntry`、版本号、失效原因和刷新策略 | 每个领域决定缓存键和可缓存范围 |
| 持久化 | `load/save/update/flush/close` | Store 只负责领域数据，不重复实现原子写入 |
| 错误 | `errorCode/message/retryable/resource` | 页面决定展示方式，服务端统一错误语义 |

### 2.3 推荐的公共目录边界

建议先增加稳定的公共层，再逐步把旧实现迁移进去；不要求第一步移动现有文件。

```text
windows/server/domain/
  identity/          # ProjectIdentity、AgentIdentity、RoomBinding
  conversation/      # ConversationBinding、MessageView、HistoryPage
  execution/         # ActivityView、RunStatus、SendReceipt
  capability/        # CapabilityDescriptor、AttachmentRef、ArtifactRef
windows/server/infrastructure/
  storage/           # atomic-json-store、jsonl、flushable
  realtime/           # subscription、recovery、event sequence
  errors/             # error codes and response mapping
web-ui/src/shared/
  conversation/       # MessageView、HistoryPage、时间和内容转换
  composer/            # 草稿、能力菜单和插入协议
  realtime/            # 连接状态和恢复状态
```

目录只是边界建议。只有当调用方已经通过公共接口后，才进行物理移动，避免出现“文件位置统一了、依赖仍然分散”的假模块化。

## 三、效率优化

### 3.1 读取、缓存和渲染

| 优先级 | 优化点 | 当前成本 | 建议实现 | 预期收益 |
| --- | --- | --- | --- | --- |
| P0 | 项目/员工/房间重复解析 | 多页面分别读取并归类，刷新后出现慢半拍或名称不同步 | 服务端返回版本化 `DirectorySnapshot`，前端按 `version` 缓存和增量刷新 | 减少重复请求，保证两页同源 |
| P0 | 历史固定截取 | 快照读取后再 `slice(-300)`，历史范围和内存占用不可控 | 服务端游标分页，前端只保留可见窗口和必要锚点 | 更稳定的加载时间和历史一致性 |
| P1 | 实时事件重复消费 | 单人、群聊、员工投影各自订阅并自行合并 | 传输层统一去重和断档恢复，页面只消费领域事件 | 降低重复状态更新，减少重复消息 |
| P1 | 消息内容重复解析 | Markdown、附件、Artifact 在多个入口再次转换 | 服务端或共享转换层生成标准 `ContentBlock`，前端按块渲染 | 降低渲染分支和不一致概率 |
| P1 | 时间线全量重绘 | 流式消息和活动状态更新可能触发整段时间线重绘 | 消息按 `id` 稳定 key，活动区与消息区分开，必要时使用窗口化 | 流式输出更平滑，长历史更省内存 |
| P2 | localStorage 与服务端历史重复缓存 | 页面缓存、快照和服务端历史没有明确优先级 | 规定“服务端为真、客户端为短期读取缓存”，用版本号失效 | 避免旧消息覆盖新消息 |
| P2 | 大文件和附件预览重复读取 | 多个组件各自拼 URL 或重新请求媒体 | `AttachmentRef` 统一访问和短期 URL 缓存 | 减少网络与权限解析开销 |

### 3.2 执行、队列和事件

| 优先级 | 优化点 | 建议实现 | 关键约束 |
| --- | --- | --- | --- |
| P0 | 群聊任务账本 | 持久化 `DiscussionJob`、`AgentRun`、`ActivityEvent`；内存执行器只作为消费者 | 重启后能恢复 `queued/running/failed`，不能重复执行已完成任务 |
| P0 | Agent 路由 | 只向被点名、被策略选中或明确参与的 Agent 投递 | 不默认全员广播；每个任务保存目标 Agent 快照 |
| P1 | 幂等和去重 | 所有发送和 Agent 执行使用统一 `requestId/clientMessageId` | 重试不能产生重复用户消息、重复 Agent 回复或重复投影 |
| P1 | 事件广播 | 领域事件先写账本，再广播；广播失败可由版本号恢复 | 不能把 SSE 成功当作持久化成功 |
| P1 | 上下文长度 | 任务只加载必要历史、项目摘要和被点名 Agent 的上下文 | 不把整个房间历史复制到每个 Agent Thread |
| P2 | 流式事件合并 | 对同一消息的 delta 在服务端或订阅层批量合并 | 保留最终消息校验点，断线后以快照补偿 |
| P2 | 启动和关闭 | 领域服务按依赖图启动，统一 `ready/flush/close` | 关闭时先停止接收，再等待写入和运行任务落账 |

### 3.3 数据生命周期

| 数据类型 | 短期策略 | 长期策略 |
| --- | --- | --- |
| 房间消息 | 游标分页、按窗口加载 | 按项目/房间归档，保留索引和最近摘要 |
| Agent 运行事件 | 运行中保留详细事件 | 完成后压缩为阶段摘要，保留失败和人工确认节点 |
| 员工 JSONL 对话 | 追加写入，按会话读取 | 按会话归档/压缩，不改变原始 Thread 标识 |
| 上传与预览 | 引用计数或最后访问时间 | 清理无引用临时文件，保留已挂载交付物 |
| Artifact 版本 | 当前版本快速索引 | 历史版本只读归档，禁止无引用无限增长 |
| 日志与错误 | 结构化、可按 requestId 关联 | 轮转并脱敏，不能把 token/本地绝对路径写入用户可见日志 |

## 四、集中管理

集中管理的意思是“每个规则只有一个注册入口”，不是“所有实现只有一个文件”。

### 4.1 需要集中为单一来源的内容

| 集中对象 | 当前分散位置 | 建议唯一来源 | 读取方 |
| --- | --- | --- | --- |
| 项目注册 | `project-identity-store`、业务项目配置、前端目录 | `ProjectRegistry`/`project-identity-store` | 所有页面、会话、房间、管理和进度 |
| 员工注册 | `employees/*/employee.json`、员工项目注册表、前端映射 | `EmployeeRegistry`，定义与运行绑定分离 | 员工页、目录、群聊、运行时 |
| 角色策略 | 前端默认 Agent、后端 `manager/developer` 分支 | `RolePolicyRegistry` | 默认接待、代码交付、审查、汇总 |
| 房间绑定 | `current-project`、房间目录、组合根 | `RoomRegistry`/`RoomBinding` | 群聊、导航、任务调度 |
| 能力 | slash command、群聊能力菜单、图片和 Artifact 入口 | `CapabilityRegistry` | 输入框、权限、路由、执行状态 |
| 路由 | `request-handler` 条件分支和各路由文件 | `RouteManifest` 或领域路由组 | 启动注册、鉴权、错误处理、文档 |
| 错误码/状态码 | 各服务自行拼消息 | `ErrorCatalog`、`StatusCatalog` | API、SSE、前端通知、日志 |
| 持久化生命周期 | 各 Store 自己处理队列和关闭 | `StoreFactory` + `flush/close` 约定 | 组合根和测试夹具 |
| 测试门禁 | 本地脚本、CI、手动记录 | `verification` 清单和统一命令 | CI、发布、功能文档 |

### 4.2 集中后的责任边界

| 层 | 只负责 | 不负责 |
| --- | --- | --- |
| Registry | 定义、查找、版本和校验 | 执行任务、写消息、读取页面状态 |
| Domain service | 业务规则、权限、状态转换 | 拼接 UI 文案、直接处理 HTTP |
| Adapter | 对接 app-server、JSONL、MCP、文件和外部供应商 | 决定产品身份和页面分组 |
| Repository/Store | 领域数据读写和一致性 | 解释页面路由、广播 UI 事件 |
| Projection/query | 将领域数据转换为页面视图 | 修改主数据源 |
| Route/controller | 参数解析、鉴权、调用服务、返回统一结果 | 自己实现业务规则和持久化 |
| 页面/组件 | 交互、布局、展示和用户动作 | 猜项目身份、拼 Agent 名称、管理服务端缓存 |

### 4.3 推荐的目标依赖方向

```text
页面/组件
  -> query/command hooks
  -> API routes
  -> domain services
  -> repositories/adapters
  -> app-server / JSONL / runtime / MCP

Registry 只被 domain service 和 query 层读取；
页面不直接读取定义文件、runtime 文件或 Thread/Room 快照。
```

禁止反向依赖：

- 页面不能通过 `cwd`、文件夹名或硬编码 ID 判断项目和员工。
- 路由不能直接写 JSONL 或直接修改前端需要的快照字段。
- 群聊不能为了展示而改写员工主 Thread。
- 员工投影不能被当作可写普通项目会话。
- Store 不能依赖页面组件或页面路由。

## 五、落地顺序

| 阶段 | 主要工作 | 先不做什么 | 完成标志 |
| --- | --- | --- | --- |
| 第 1 阶段：契约收敛 | 定义 `ProjectIdentity`、`AgentIdentity`、`ConversationBinding`、`MessageView`、`HistoryPage`、`SendReceipt` | 不移动文件、不重写 Thread/Room 存储 | 单人、群聊、员工入口都能通过适配器得到统一视图 |
| 第 2 阶段：单一来源 | 移除前端名称映射和散落默认角色；建立项目、员工、角色注册表 | 不删除员工定义和运行数据 | 改一个名称或角色配置即可同步所有入口 |
| 第 3 阶段：体验公共化 | 统一内容渲染、时间、附件、能力菜单、滚动和实时恢复 | 不强行合并 Thread 与 Room 状态机 | 单人和群聊对同一消息内容、时间和状态展示一致 |
| 第 4 阶段：可靠性和效率 | 群聊任务账本、游标历史、事件去重、缓存版本、生命周期管理 | 不在一次改动中拆所有超长文件 | 重启、重连、重试不会丢任务或重复消息 |
| 第 5 阶段：物理清理 | 删除旧映射、兼容分支、重复 Store 模板和已迁移代码 | 不删除仍有业务含义的历史数据 | 全仓库无旧接口引用，CI 和 smoke 门禁通过 |

## 六、验收指标

| 目标 | 最低验收标准 |
| --- | --- |
| 身份一致 | 单人页、群聊页、员工目录对同一项目/员工使用同一 ID、名称和角色；不再存在前端二次改名 |
| 历史一致 | 同一来源在不同入口使用同一游标和日期边界；不再由调用方自行 `slice` |
| 消息一致 | 相同 `ContentBlock` 在单人、群聊和员工投影中渲染结果一致，外壳差异除外 |
| 发送可靠 | 重试和断线恢复不产生重复用户消息、重复 Agent 运行或重复投影 |
| 任务可恢复 | 服务重启后可识别并处理未完成的 `queued/running/failed` 任务 |
| 路由效率 | 只向目标 Agent 投递；未参与的 Agent 不创建 Thread、不消费上下文 |
| 启动效率 | 目录、身份和能力注册只加载一次；页面刷新使用版本化缓存，不重复拼装 |
| 模块化 | 页面不读 Store；Route 不写文件；Registry 不执行业务；组合根不包含投影逻辑 |
| 可删除性 | 旧适配器和兼容代码有引用清单，迁移后可一次性删除且无隐藏入口 |
| 质量门禁 | 服务端测试、`pnpm build:ui`、`git diff --check` 和最小浏览器 smoke 均有固定入口 |

## 最终建议

最高收益的顺序是：

1. 先收敛身份、绑定、消息和发送回执四类契约。
2. 再删除前端名称映射、默认 ID 分支、重复时间/渲染/历史逻辑。
3. 然后把群聊任务从内存状态升级为可恢复账本，并统一实时恢复和缓存版本。
4. 最后拆组合根、超长 Hook 和重复 Store 模板，完成物理目录清理。

这样可以同时满足“删除、公共、优化、集中”：删除的是冲突和重复，公共化的是稳定契约，优化的是读取/事件/任务路径，集中的是身份和策略定义；Thread、Room、员工运行时和历史数据仍保留各自必要的边界。
