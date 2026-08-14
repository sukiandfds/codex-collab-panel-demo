# 02 前端模块与共用 UI

## 模块职责表

| 模块 | 主要职责 | 当前共用关系 | 审查评价 |
| --- | --- | --- | --- |
| `conversations` | 单人会话列表、消息、输入、历史、操作 | 使用 `execution`、`context-management`、`attachments`、`models` | 当前最完整，但核心 Hook 和组件过重 |
| `execution` | 执行状态、活动过程、控制和状态模型 | 被单人页使用，群聊有自己的活动模型 | 应抽象稳定的活动显示契约，不强行共用 Thread 状态 |
| `group-chat` | 房间、成员、Agent、群消息、流式、历史 | 使用项目目录、附件、Artifact 和共享跳转到底部组件 | 业务边界合理，但基础对话体验仍有独立实现 |
| `project-directory` | 项目、员工项目、会话目录和导航 | 单人页、群聊页共同使用 | 已经是系统导航能力，不应被视为单页私有 Feature |
| `attachments` | 草稿、上传、预览、附件类型 | 单人和群聊共同使用 | 共用方向正确，群聊和单人仍需统一内容模型 |
| `artifacts` | 交付物读取、预览、审核和下载 | 群聊消息挂载 Artifact，单人结果也可展示 | 接口相对独立，适合继续保持领域边界 |
| `models`、`context-management` | 模型、推理强度、上下文设置 | 目前主要服务单人页，群聊入口只是部分占位 | 需要按 Agent/Provider 定义，而不是直接复制单人设置 |
| `project-management`、`project-progress`、`usage-monitor` | 产品管理、进度、用量 | 与对话页面共享外壳和 API 基础设施 | 应通过项目身份接口接入，不直接读取会话内部状态 |

## 共用与重复表

| 能力 | 单人实现 | 群聊实现 | 当前问题 | 最小系统级方向 |
| --- | --- | --- | --- | --- |
| 项目导航 | `ConversationSidebar + ProjectDirectory` | `GroupApp + ProjectDirectory` | 同一组件有 `navigationOnly`、员工点击、普通项目点击多种分支 | 保留组件，先抽出 `DirectoryEntry` 标准化和导航动作接口 |
| 消息渲染 | `ContentRenderer` 支持内容块、图片查看器、音视频和文件 | `MessageTimeline` 直接使用 `ReactMarkdown`，再挂附件和 Artifact | 群聊缺少单人页的内容块能力，展示结果可能不一致 | 共享内容块渲染器，群聊只提供发送者和消息外壳 |
| 时间显示 | `ConversationView` 和 `MessageTimeline` 各自格式化 | 两边都精确到秒，但格式和日期分隔逻辑分散 | 时区、无效时间和日期边界可能出现不同结果 | 放入共享 `time-format` 模块，统一时区和无效值策略 |
| 自动滚动 | `ConversationView` 使用 `useReturnToBottom` 和虚拟列表 | `MessageTimeline` 复用 `useReturnToBottom`，另有历史锚点逻辑 | 基础能力有共用，但历史/流式状态分别维护 | 抽象为“消息源 + 阅读窗口 + 追随策略”接口 |
| 实时事件 | `useConversationEvents` 消费 Thread 事件 | `useGroupEvents` 消费房间事件 | 事件类型、恢复、快照合并和活动状态不统一 | 共享传输层和恢复状态，业务域保留事件解释器 |
| 输入框 | `ConversationComposer` 有完整 slash command、模型和上下文 | `GroupComposer` 有 `@员工`、能力菜单和占位入口 | 交互行为相似但没有共享输入状态/菜单协议 | 共享菜单数据和插入协议，保留不同发送目标和权限 |

## 超长或多职责文件

| 文件 | 行数 | 当前混合职责 | 清理判断 |
| --- | ---: | --- | --- |
| `conversations/components/ConversationView.tsx` | 434 | 列表布局、滚动、流式、状态占位、时间、消息操作和内容展示 | 先保留行为，拆成消息窗口、消息行、执行占位和阅读控制 |
| `conversations/hooks/useProjectConversations.ts` | 424 | 目录、选中会话、发送、重试、分叉、归档、实时和执行状态 | 高风险核心 Hook，先建立调用方清单再拆 |
| `execution/hooks/useCodexExecution.ts` | 379 | 执行控制、状态缓存、恢复、超时和展示数据 | 区分控制接口、状态订阅和状态缓存 |
| `conversations/components/ConversationComposer.tsx` | 349 | 草稿、附件、slash command、模型、上下文和发送 | 把菜单状态与发送适配器分开 |
| `project-directory/components/ProjectDirectory.tsx` | 299 | 数据归类、员工名称、路由判断、展开状态和打开行为 | 抽出目录视图模型和动作解析 |
| `group-chat/components/GroupComposer.tsx` | 284 | 员工提及、能力菜单、附件、草稿、发送和外部点击 | 与单人输入框共享菜单协议后再拆 |
| `group-chat/hooks/useGroupRoom.ts` | 223 | 房间列表、快照、实时、发送、历史、缓存和 presence | 接近边界，下一步应拆历史/发送/房间状态 |

## 结论

前端不适合继续复制单人组件到群聊。正确方向是：共用稳定的展示和交互协议，保留单人 Thread 与群聊 Room 的业务状态隔离。先统一数据视图，再做文件拆分。
