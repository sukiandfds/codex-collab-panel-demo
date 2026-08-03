---
document_type: research_result
research_id: RESEARCH-001
title: 项目文件功能与模块交叉关系调研结果
date: 2026-08-03
product_branch: codex/publish-current-panel
product_commit: bb56a3700d03036bdeccefa9e87b77defb70ed1f
status: recorded
---

# 项目文件功能与模块交叉关系调研结果

本文件只记录当前代码和现有文档中的事实，不包含改造建议或拆分结论。

## 1. 调研基线

- 仓库：`codex-collab-panel-demo`
- 分支：`codex/publish-current-panel`
- 提交：`bb56a3700d03036bdeccefa9e87b77defb70ed1f`
- 相关架构文档：`docs/architecture/MODULE_BOUNDARIES.md`
- 模块边界文档更新时间：`2026-07-28`

## 2. 当前目录分组

```text
web-ui/src/
  App.tsx                         单人页面组装
  components/                     跨功能 UI 和应用外壳
  features/<feature>/             功能组件、Hook、接口、类型和实时逻辑
  shared/                         跨功能 HTTP 和共享类型

windows/server/
  routes/                         HTTP 路由处理
  http/                           鉴权和请求辅助
  execution/                      执行活动辅助逻辑
  multi-agent/                    群聊 Agent 辅助逻辑
  *-service.mjs                   功能服务
  *-store.mjs                     状态或会话存储
```

## 3. 已记录的物理拆分

提交 `ad79225` 修改了 68 个文件，涉及：

- 前端页面组件从通用组件目录迁入对应 `features/`；
- 会话列表和会话详情 Hook 分开；
- 群聊页面样式和组件按功能拆分；
- 后端 `request-handler.mjs` 的路由处理迁入 `routes/`；
- 执行活动逻辑迁入 `execution/activity.mjs`；
- 多 Agent 的提示词、输出任务和协议状态迁入 `multi-agent/`；
- HTTP 访问控制和请求辅助逻辑迁入 `http/`。

## 4. 后端文件功能与调用关系

| 文件 | 文件内导出或入口 | 直接关系 |
|---|---|---|
| `windows/scripts/remote-room-demo.mjs` | 创建服务、路由、实时模块并启动 HTTP Server | 调用所有主要 server 工厂 |
| `windows/server/request-handler.mjs` | `createRequestHandler` | 创建 artifact、conversation、group、system、usage、version 路由 |
| `windows/server/routes/conversation-routes.mjs` | `createConversationRoutes` | 调用 conversations、execution、contextManagement、media |
| `windows/server/routes/group-routes.mjs` | `createGroupRoutes` | 调用 groupRoom、media、multiAgent、webOutputs |
| `windows/server/routes/artifact-routes.mjs` | `createArtifactRoutes` | 调用 groupRoom、artifacts、webOutputs |
| `windows/server/routes/system-routes.mjs` | `createSystemRoutes` | 调用 project stores、media、realtime 和 observer |
| `windows/server/app-server-client.mjs` | `createAppServerClient` | 被会话 store 和 multi-agent service 调用 |
| `windows/server/app-server-conversation-store.mjs` | `inputFromAttachments`、`createAppServerConversationStore` | 调用 App Server Client；处理主会话读取和写入 |
| `windows/server/jsonl-conversation-store.mjs` | `createJsonlConversationStore` | 读取 JSONL 会话、媒体和内容块 |
| `windows/server/conversation-service.mjs` | `createConversationService` | 组合 primary conversation store 和 fallback store |
| `windows/server/execution-tracker.mjs` | `createExecutionTracker` | 消费协议消息，维护执行状态并广播事件 |
| `windows/server/realtime-hub.mjs` | `createRealtimeHub` | 管理 SSE 连接和广播 |
| `windows/server/multi-agent-service.mjs` | `createMultiAgentService` | 排队群聊 Agent 任务并调用 App Server Client |
| `windows/server/group-room-store.mjs` | `createGroupRoomStore` | 保存群聊成员、消息、Agent 状态和 Artifact 关联 |
| `windows/server/artifact-service.mjs` | `createArtifactService` | 保存、读取和审核 Artifact |

## 5. 前端文件功能与调用关系

| 文件 | 文件内入口 | 直接关系 |
|---|---|---|
| `web-ui/src/main.tsx` | 创建单人 `App` | 加载单人页面和更新提示 |
| `web-ui/src/App.tsx` | `App` | 组装会话侧栏、标题、视图、输入框和用量控件 |
| `web-ui/src/features/conversations/hooks/useProjectConversations.ts` | `useProjectConversations` | 组合会话目录、会话详情、实时事件、执行、上下文和模型 Hook |
| `web-ui/src/features/conversations/hooks/useConversationSession.ts` | `useConversationSession` | 读取当前会话、加载更早消息、更新选中会话 |
| `web-ui/src/features/conversations/hooks/useConversationCatalog.ts` | `useConversationCatalog` | 读取项目和会话列表、创建会话、刷新列表 |
| `web-ui/src/features/conversations/realtime/useConversationEvents.ts` | `useConversationEvents` | 连接 `/events`，处理单人会话事件和恢复 |
| `web-ui/src/features/execution/hooks/useCodexExecution.ts` | `useCodexExecution` | 发送、停止、执行状态、流式文本和事件处理 |
| `web-ui/src/features/group-chat/GroupApp.tsx` | `GroupApp` | 组装群聊组件和 `useGroupRoom` |
| `web-ui/src/features/group-chat/hooks/useGroupRoom.ts` | `useGroupRoom` | 组合群聊快照、成员、发送和群聊实时 Hook |
| `web-ui/src/features/group-chat/realtime/useGroupEvents.ts` | `useGroupEvents` | 连接 `/events`，更新群聊快照 |
| `web-ui/src/shared/api/http.ts` | `fetchJson`、`postJson`、访问令牌处理 | 被各功能 data API 调用 |

## 6. HTTP 路径与文件对应关系

| 路径 | 服务端文件 | 前端主要调用文件 |
|---|---|---|
| `/api/sessions`、`/api/session` | `conversation-routes.mjs` | `conversationApi.ts` |
| `/api/session/message`、`/api/session/interrupt` | `conversation-routes.mjs` | `executionApi.ts` |
| `/api/execution-status` | `conversation-routes.mjs` | `executionApi.ts` |
| `/api/session/context*` | `conversation-routes.mjs` | `contextApi.ts` |
| `/api/group/*` | `group-routes.mjs` | `groupApi.ts` |
| `/api/artifacts/*` | `artifact-routes.mjs` | `artifactApi.ts` |
| `/api/project*`、`/api/device`、`/api/uploads`、`/api/media/*`、`/events` | `system-routes.mjs` | conversation、group、device、attachments 等功能 API |
| `/api/project-management*` | `system-routes.mjs` | `projectManagementApi.ts` |
| `/api/project-progress` | `system-routes.mjs` | `progressApi.ts` |
| `/api/usage/fusheng` | `usage-routes.mjs` | `usageApi.ts` |

## 7. 单人会话数据和实时链路

```text
main.tsx
  -> App.tsx
  -> useProjectConversations
  -> conversationApi / executionApi
  -> conversation-routes
  -> conversation-service
  -> app-server-conversation-store
  -> app-server-client
```

实时链路：

```text
Codex App Server 消息
  -> app-server-conversation-store
  -> execution-tracker
  -> realtime-hub.broadcast
  -> /events SSE
  -> useConversationEvents
  -> useCodexExecution
  -> useProjectConversations
  -> ConversationView / ExecutionTimeline
```

会话读取同时连接：

```text
conversation-service
  -> primary: app-server-conversation-store
  -> fallback: jsonl-conversation-store
```

## 8. 群聊数据和实时链路

```text
GroupComposer
  -> groupApi.send
  -> /api/group/message
  -> group-routes
  -> group-room-store.addMessage
  -> multi-agent-service.enqueueDiscussion
  -> app-server-client
  -> group-room-store / web-output-service
  -> realtime-hub.broadcast
  -> useGroupEvents
  -> useGroupRoom
  -> MessageTimeline / AgentRoster / Artifact components
```

群聊 Artifact 发布还经过：

```text
/api/artifacts/publish
  -> artifact-routes
  -> group-room-store.getAgent / getMessage
  -> artifact-service.publish
  -> group-room-store.attachArtifact
```

## 9. 现有大文件记录

当前文件大小如下，单位为字节：

| 文件 | 大小 |
|---|---:|
| `execution-tracker.mjs` | 15191 |
| `project-management-store.mjs` | 14934 |
| `project-progress-store.mjs` | 11113 |
| `app-server-conversation-store.mjs` | 10881 |
| `app-server-client.mjs` | 10414 |
| `multi-agent-service.mjs` | 10387 |
| `artifact-service.mjs` | 9854 |
| `jsonl-conversation-store.mjs` | 9634 |

## 10. 现有测试文件对应关系

| 测试文件 | 对应模块或功能 |
|---|---|
| `execution-tracker.test.mjs` | 执行状态和事件处理 |
| `realtime-hub.test.mjs` | SSE 广播和连接 |
| `conversation-controls.test.mjs` | 单人发送、停止和控制接口 |
| `conversation-service-media.test.mjs` | 会话服务和媒体 |
| `jsonl-conversation-media.test.mjs` | JSONL 会话媒体 |
| `multi-agent-service.test.mjs` | 群聊 Agent 服务 |
| `request-handler-routing.test.mjs` | 路由分发 |
| `project-management.test.mjs` | 项目管理读取 |
| `fusheng-usage-service.test.mjs` | 用量服务 |

## 11. 当前仓库可直接定位的文档

- 文件边界说明：`docs/architecture/MODULE_BOUNDARIES.md`
- 需求索引：`docs/feature-development/FEATURE_INDEX.md`
- 项目管理索引：`docs/project-management/INDEX.md`
- 流程规则：`docs/project-management/WORKFLOW_RULES.md`
- 本次调研条目：`docs/project-management/items/RESEARCH-001/`
