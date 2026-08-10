---
document_type: research_result
research_id: RESEARCH-002
title: 核心运行链路、实时状态与项目数据源调研结果
date: 2026-08-03
product_branch: codex/publish-current-panel
product_commit: 5f817f0143368c98619011f0b1eaf050baf0efea
status: recorded
---

# 核心运行链路、实时状态与项目数据源调研结果

本文件只记录当前产品提交中的源码、测试和项目文档事实，不包含改造建议或拆分结论。

## 1. 调研基线

- 仓库：codex-collab-panel-demo
- 分支：codex/publish-current-panel
- 产品提交：5f817f0143368c98619011f0b1eaf050baf0efea
- 调研方式：只读检查源码、测试、构建入口和项目文档；未启动服务，未修改生产代码。

## 2. 服务端启动与调用关系

windows/scripts/remote-room-demo.mjs 创建并连接以下模块：

~~~text
realtime-hub
execution-tracker
jsonl-conversation-store
app-server-conversation-store
conversation-service
context-management-service
group-room-store
artifact-service
web-output-service
multi-agent-service
fusheng-usage-service
request-handler
~~~

request-handler.mjs 按以下顺序创建路由：

1. version
2. artifact
3. group
4. conversation
5. usage
6. system

所有 /api/* 和 /events 请求先经过鉴权；未匹配的请求交给静态文件服务。

## 3. 核心模块导出与直接调用方

| 模块 | 导出或入口 | 当前直接调用方 |
|---|---|---|
| app-server-client.mjs | createAppServerClient；request、probe、restart、subscribe、subscribeHealth、close | app-server-conversation-store、multi-agent-service |
| app-server-conversation-store.mjs | inputFromAttachments、createAppServerConversationStore | 附件测试、会话控制测试、remote-room-demo |
| jsonl-conversation-store.mjs | createJsonlConversationStore | remote-room-demo；由 conversation-service 作为 fallback 使用 |
| conversation-service.mjs | createConversationService | remote-room-demo；由 conversation-routes 调用 |
| execution-tracker.mjs | createExecutionTracker | remote-room-demo；由 conversation routes 和 app-server 回调调用 |
| realtime-hub.mjs | createRealtimeHub | remote-room-demo；system-routes 调用 connect，各服务调用 broadcast |
| project-management-store.mjs | readProjectManagement、readProjectManagementEntry | system-routes、项目管理测试 |
| project-progress-store.mjs | readProjectProgress | system-routes、请求路由测试 |
| context-management-service.mjs | createContextManagementService | remote-room-demo、conversation routes、app-server 协议回调 |
| group-room-store.mjs | createGroupRoomStore | remote-room-demo、group routes、multi-agent-service、artifact routes |
| multi-agent-service.mjs | createMultiAgentService | remote-room-demo、group routes |

## 4. 单人会话读取与发送

### 4.1 读取链路

~~~text
conversationApi.session
  -> GET /api/session
  -> conversation-routes
  -> conversation-service.findSession
  -> primary.findSession + fallback.findSession
  -> app-server thread/read + JSONL read
~~~

已确认：

- 前端请求 /api/session?threadId=...&limit=60&before=...。
- app-server-conversation-store.findSession 调用 thread/read，参数是 threadId 和 includeTurns: true。
- Codex 返回完整 Turn 和 Item 后，项目代码转换为网页消息。
- before 和 limit 在项目内存中对完整消息数组进行切片。
- JSONL store 也先读取并维护完整会话状态，再进行切片。
- conversation-service.findSession 当前使用 Promise.allSettled 同时读取主数据和 fallback。
- 主数据成功时，fallback 仍可能被用于补充图片、音频和视频块。
- 主数据失败且 fallback 成功时，返回 fallback 结果。

### 4.2 发送和控制链路

~~~text
conversationApi / executionApi
  -> conversation-routes
  -> execution.getStatus
  -> conversation-service
  -> app-server-conversation-store
  -> app-server-client.request
  -> turn/start / turn/steer / turn/interrupt
~~~

- 没有活动 Turn 时使用 turn/start。
- 有活动 Turn 且已有 turnId 时使用 turn/steer。
- 停止操作使用当前状态中的 turnId 调用 turn/interrupt。
- 发送确认超时后，路由和前端都会读取状态，判断请求是否实际上已经被接受。
- 模型和推理强度更新前会检查执行状态；运行中时由路由返回 409。

## 5. 实时事件链路

~~~text
Codex app-server
  -> app-server-client.subscribe
  -> app-server-conversation-store
  -> execution-tracker / context-management-service
  -> realtime-hub.broadcast
  -> SSE /events
  -> useConversationEvents
  -> useProjectConversations
  -> useCodexExecution / 会话页面
~~~

### 5.1 服务端事件处理

execution-tracker 当前处理：

- turn/started
- turn/completed
- thread/status/changed
- item/started
- item/completed
- item/reasoning/summaryTextDelta
- item/agentMessage/delta
- item/tool/requestUserInput
- mcpServer/elicitation/request
- 以 /requestApproval 结尾的审批事件

服务端广播的主要网页事件：

- execution_status
- assistant_commentary
- assistant_delta
- sessions_changed
- context_status
- heartbeat

执行状态以 threadId 为 Map 键保存；状态中另行保存当前 turnId、活动列表、流式文本、最后协议事件时间和最后探测时间。

### 5.2 SSE 连接和恢复

realtime-hub：

- 为每条广播分配全局递增事件 ID。
- 内存保留最近 200 条事件。
- 接收请求头 Last-Event-ID 或查询参数 lastEventId。
- 重连时回放仍在历史范围内的事件。
- 当客户端游标早于保留范围或来自旧服务进程时标记 gap: true。
- 发送 connected 事件，包含 eventId、requestedEventId、oldestEventId、replayed 和 gap。

useConversationEvents：

- 连接 /events 并保存客户端最后事件 ID。
- 发现连续事件断档时触发 event-gap 恢复。
- SSE 重新连接时触发 reconnected 恢复。
- 页面恢复可见、网络恢复或 pageshow 时触发 resumed 恢复。
- 等待首个事件超过 8 秒，或一般活动超过 25 秒无传输时重新连接。
- 当前会话 30 秒没有进度时触发 stale-execution 恢复。
- 恢复调用 executionApi.status(..., reconcile=true)，随后重新读取当前会话和会话列表。

### 5.3 标识和过滤事实

- 当前源码中检索到的是 threadId、turnId 和 SSE 全局事件 ID。
- 当前源码中未检索到 runId 或 eventSeq。
- useConversationEvents 对会话进度事件主要按 threadId 过滤。
- useCodexExecution.handleEvent 只检查事件的 threadId，没有独立的 turnId 或 runId 过滤分支。
- app-server-conversation-store 的活动运行监督以 threadId 为键，探测调用 thread/read 和 includeTurns: false。
- 最终答案 Item 完成时状态先进入 finalizing；权威状态返回 idle 后再记录 completed 或 idle。

## 6. 项目管理与项目进度数据链路

### 6.1 项目管理

~~~text
docs/project-management/PROJECT.md
docs/project-management/INDEX.md
docs/project-management/items/<ITEM-ID>/item.md
docs/project-management/items/<ITEM-ID>/updates.md
  -> project-management-store
  -> GET /api/project-management
  -> projectManagementApi
  -> ProjectManagementApp
~~~

已确认：

- INDEX.md 负责条目定位、计划和进行中 ID。
- item.md 提供条目当前摘要、状态、优先级和详情字段。
- updates.md 提供状态和更新历史。
- 摘要接口会移除用户原话、具体内容、证据和完整更新列表。
- 点击条目后通过 /api/project-management/entries/<ITEM-ID> 读取详情。
- 前端摘要和详情均使用 30 秒 sessionStorage 缓存。
- 页面提供手动刷新、摘要优先、分类折叠和详情面板。

### 6.2 项目进度

~~~text
docs/feature-development/FEATURE_STATUS_INDEX.md
  -> project-progress-store
  -> GET /api/project-progress
  -> progressApi
  -> ProjectProgressApp
~~~

已确认：

- FEATURE_STATUS_INDEX.md 定位功能记录，具体内容从 features/FEAT-*.md 读取。
- 接口一次返回项目进度、计划、进行中、分类、全部条目和日志。
- 条目详情字段在首次接口返回中一并包含，没有独立详情 API。
- 当前前端通过 URL 的 item 参数选择条目，并在本地打开详情。
- 项目进度模型使用 level、sourceStatus、sourcePath 等字段。
- 项目管理模型使用 priority、health、lead、stats 和独立更新详情字段。
- Vite 同时构建 progress.html 和 project-management.html。
- 静态服务器把 /progress 和 /project-management 都映射到 project-management.html。

## 7. 当前测试覆盖

| 测试文件 | 已覆盖事实 |
|---|---|
| conversation-controls.test.mjs | 会话创建、模型分页、模型/推理设置、权威状态、消息时间、活动 Turn 监督 |
| conversation-service-media.test.mjs | 主数据成功时从 JSONL 补充媒体和时间 |
| execution-tracker.test.mjs | 流式回复、评论、Turn、工具活动、权威状态、恢复、持久化 |
| realtime-hub.test.mjs | SSE 初始化、事件 ID、重连回放、历史断档、旧服务游标 |
| project-management.test.mjs | 项目管理目录读取、摘要/详情 API、/progress 静态别名 |
| request-handler-routing.test.mjs | 路由分发、鉴权、项目进度接口和结构化条目 |
| jsonl-conversation-media.test.mjs | JSONL 工具预览图片与最终消息关联 |
| multi-agent-service.test.mjs | Agent 提及顺序和讨论提示词 |

当前测试目录中未检索到：

- 独立的 app-server-client 测试文件。
- useConversationEvents 和 useCodexExecution 的前端测试文件。
- project-progress-store 的直接单元测试文件。
- conversation-service 主数据失败后 fallback 的完整失败路径测试。

## 8. 证据文件

- windows/scripts/remote-room-demo.mjs
- windows/server/app-server-client.mjs
- windows/server/app-server-conversation-store.mjs
- windows/server/conversation-service.mjs
- windows/server/execution-tracker.mjs
- windows/server/realtime-hub.mjs
- windows/server/project-management-store.mjs
- windows/server/project-progress-store.mjs
- web-ui/src/features/conversations/realtime/useConversationEvents.ts
- web-ui/src/features/execution/hooks/useCodexExecution.ts
- web-ui/src/features/project-management/ProjectManagementApp.tsx
- web-ui/src/features/project-progress/ProjectProgressApp.tsx
- windows/tests/conversation-controls.test.mjs
- windows/tests/execution-tracker.test.mjs
- windows/tests/realtime-hub.test.mjs
- windows/tests/project-management.test.mjs
- windows/tests/request-handler-routing.test.mjs
