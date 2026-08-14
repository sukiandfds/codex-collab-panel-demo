# 03 会话、执行与实时

## 当前数据链路

| 链路 | 当前实现 | 主要数据源 | 评价 |
| --- | --- | --- | --- |
| 单人会话 | `App -> useProjectConversations -> conversation-service -> app-server-conversation-store` | Codex app-server，JSONL fallback | 主链路最成熟，已经有发送幂等、历史分页和恢复机制 |
| 单人执行 | `useCodexExecution -> execution-tracker -> app-server protocol` | Thread/Turn 事件和本地执行快照 | 状态丰富，但核心文件职责过多 |
| 单人实时 | `useConversationEvents -> /events -> realtime-hub` | Thread 事件、状态快照和事件序号 | 有事件断档恢复和状态补偿，属于应复用的稳定能力 |
| 群聊消息 | `GroupApp -> useGroupRoom -> group-routes -> group-room-store` | 房间 JSON 状态、SSE 群事件 | 消息幂等和分页已接入，但契约与单人不同 |
| 群聊 Agent 执行 | `multi-agent-service -> app-server Thread -> group-room-store` | 内存队列、Agent Thread、群消息 | 能执行和流式展示，但队列状态不持久化 |
| 员工主对话 | `employee-runtime-service -> employee-conversation-store -> app-server Thread` | 员工绑定和本地 JSONL 历史 | 单独运行、权限和确认逻辑清楚 |
| 员工群聊投影 | `group-room-store onMessageCreated -> employee-conversation-store/realtime` | 群消息投影 | 目前是只读 Agent 回复投影，不是完整会话 |

## 同一概念的多套契约

| 概念 | 单人契约 | 群聊契约 | 员工契约 | 冲突影响 |
| --- | --- | --- | --- | --- |
| 消息 | `SessionMessage`，有 `role/blocks/turnId/itemId` | `GroupMessage`，有 `type/authorId/agentId/workId/attachments` | 本地消息有 `role/text/turnId/itemId` | 三种消息不能直接进入同一个渲染器或历史 API |
| 运行状态 | `ExecutionStatus`，有 phase、activities、eventSeq | `GroupAgent`、`GroupActiveWork`、`GroupStreamingMessage` | `employee_status` 和员工状态缓存 | 同样的“正在处理/等待/失败”由不同状态机表达 |
| 历史 | Thread 分页、delta 和内容版本 | sequence、before/after/date 分页 | 员工主对话本地历史，群聊投影从 snapshot 读 | 入口不同导致历史完整度和操作能力不同 |
| 发送结果 | submissionId、turnId、恢复状态 | clientMessageId、jobId、targetAgentIds | requestId、conversationId、threadId | 幂等键命名和错误语义不同，跨域重试难统一 |
| 实时恢复 | 事件序号、快照补偿、连接状态 | 重连快照、缓存合并、activeWorks | 运行时事件和员工消息事件 | 能力相似，但没有共同的恢复状态接口 |

## 已确认或高风险问题

| 项目 | 级别 | 证据 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| 群聊队列是内存 Promise 链 | P1 | `multi-agent-service.mjs` 的 `workQueue`、`currentRun` | 服务重启后未完成讨论无法恢复，用户看不到正式任务账本 | 引入 `DiscussionJob/AgentRun/ActivityEvent` 持久化接口，先保留当前执行器作为 adapter |
| 员工群聊投影只写 Agent 最终文本 | P1 | `remote-room-demo.mjs:152-180`、`agent-conversation-store.mjs` | 员工项目看不到用户原话、交接上下文和流式过程，不能称为完整普通对话 | 明确为只读投影，或按统一消息投影协议写入必要的用户上下文 |
| 群聊投影读取 `snapshot()` | P1 | `conversation-routes.mjs:104-142`、`group-room-store.mjs:97` | 只保留最近 300 条，和群聊完整分页接口不一致 | 投影读取统一走 `getMessagePage` 或独立历史查询接口 |
| 单人与群聊渲染/活动逻辑分裂 | P2 | `ConversationView`、`ContentRenderer`、`MessageTimeline` | 未来一个页面修复内容、时间或滚动，另一个页面可能再次出现差异 | 共享 `ConversationMessageView` 和 `ActivityView` 的稳定输入模型 |
| 同一 app-server 事件有多个消费者 | 结构风险 | `app-server-conversation-store` 回调执行、上下文和员工记录 | 新增消费者时容易重复写入或重复广播 | 引入只读事件总线或明确“一个事件一个持久化消费者”的职责表 |

## 推荐的系统接口

| 接口 | 最小字段 | 使用方 |
| --- | --- | --- |
| `ConversationBinding` | `conversationId/projectId/kind/runtimeKind/runtimeSessionId/readOnly` | 单人、员工主对话、员工群聊投影 |
| `MessageView` | `id/source/author/role/text/blocks/attachments/createdAt/parentId` | 单人和群聊渲染 |
| `ActivityView` | `id/source/phase/label/detail/active/startedAt/updatedAt/streaming` | 单人执行、群聊 Agent、员工运行 |
| `HistoryPage` | `items/cursor/hasOlder/hasNewer/dateScope` | Thread、Room、员工投影 |
| `SendReceipt` | `requestId/clientMessageId/submissionId/status/resourceId` | 所有发送入口 |

这些接口只统一视图和传输语义，不要求单人 Thread、群聊 Room 和员工 Runtime 共享存储实现。
