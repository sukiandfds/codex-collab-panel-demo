# 实时事件与长会话读取架构审计

审计日期：2026-08-03
审计分支：`codex/realtime-architecture-audit`
代码基线：`af9af11`（`origin/codex/publish-current-panel`）
审计范围：任务 A / B / C
业务代码修改：无

## 1. 执行摘要

当前系统已经具备三层恢复能力：Codex app-server 协议监听、服务端执行状态快照、浏览器 SSE 断线重放与状态补偿。但它们使用的是不同的顺序和状态来源：

- Codex 协议事件只有 `threadId`，部分事件带 `turnId`；代码中没有统一的 `runId` 或业务层 `eventSeq`。
- SSE 的 `eventId` 是整个服务实例共享的传输游标，不是某个会话或某一轮任务的事件序号。
- 服务端协议事件、健康探测、文件监听和前端页面恢复都可以触发状态更新或会话重新读取。
- 会话读取接口虽然向前端暴露 `limit=60`，但 App Server 和 JSONL 路径都会先获得/构造完整消息集合，再在内存中切片；`conversation-service.findSession` 还会并行读取 JSONL fallback 以补媒体。

因此，当前第一优先级不是立即拆分长文件，而是先固定事件语义和读取性能事实。没有统一的事件边界、调用方清单和定向测试，直接拆分可能把“旧事件覆盖新状态”或“最终消息暂时消失”问题分散到多个文件，增加定位难度。

## 2. 任务 A：实时事件链路审计

### 2.1 一条消息从发送到完成

```text
浏览器 useProjectConversations.sendMessage
  -> useCodexExecution.sendMessage
  -> POST /api/session/message
  -> conversation-routes
  -> app-server-conversation-store.sendMessage / steerMessage
  -> execution.markSubmitted
  -> app-server-client.request("turn/start" / "turn/steer")
  -> Codex app-server stdout JSONL
  -> app-server-client.subscribe listeners
  -> app-server-conversation-store.handleProtocolMessage
  -> execution-tracker.handleProtocolMessage
  -> realtime-hub.broadcast
  -> SSE event id + data
  -> useConversationEvents
  -> useProjectConversations.handleEvent
  -> useCodexExecution.handleEvent
```

### 2.2 事件生产与消费

| 事件/状态 | 产生位置 | 消费位置 | 当前顺序标识 |
| --- | --- | --- | --- |
| `turn/started` | Codex app-server | `app-server-conversation-store`、`execution-tracker`、上下文服务 | `threadId` + `turn.id` |
| `turn/completed` | Codex app-server | 同上 | `threadId`，`turn.id` 可存在 |
| `thread/status/changed` | Codex app-server | `execution-tracker` | `threadId` |
| `item/started` / `item/completed` | Codex app-server | `execution-tracker` | `threadId` + item id；无统一 turn 校验 |
| `item/agentMessage/delta` | Codex app-server | `execution-tracker` -> 前端 Hook | 运行时转发参数；类型要求 `turnId`，测试样例未始终提供 |
| `execution_status` | `execution-tracker.publish` | `realtime-hub`、前端执行 Hook | 只有状态快照，没有 `eventSeq` |
| `assistant_delta` | `execution-tracker` | 前端执行 Hook | SSE 全局 `eventId`；无业务序号 |
| `sessions_changed` | `execution-tracker`、JSONL 文件监听、其他服务 | 前端会话目录和详情刷新 | 只有可选 `threadId` |
| `connected` / 重放事件 | `realtime-hub` | `useConversationEvents` | SSE 全局 `eventId` |

### 2.3 已确认事实

1. `execution-tracker.mjs` 按 `threadId` 保存状态，`turnId` 只作为当前状态字段保留；`publish` 没有基于 turn 版本拒绝旧事件的逻辑（`execution-tracker.mjs:54-88`）。
2. `app-server-conversation-store.mjs` 的 `activeRuns` 只按 `threadId` 跟踪，不保存当前 `turnId` 作为监控键（`app-server-conversation-store.mjs:27-55`）。
3. `realtime-hub.mjs` 只维护一个服务级递增 `nextEventId` 和最多 200 条历史；SSE `id:` 不写入 JSON 数据体（`realtime-hub.mjs:1-6,19-21,79-87`）。
4. 浏览器通过 `Last-Event-ID`/查询参数进行服务级重放，并通过 `connected.gap` 触发快照恢复；它没有会话级或 turn 级排序（`useConversationEvents.ts:90-166`）。
5. `turn/completed`、最终 `agentMessage` 完成、健康探测确认 idle、JSONL 文件变化都可能触发会话刷新（`execution-tracker.mjs:181-192,231-240`、`app-server-conversation-store.mjs:67-101`、`jsonl-conversation-store.mjs:99-112`）。
6. `useProjectConversations` 在消息发送确认后主动加载一次会话；收到 `sessions_changed` 后又可能再次加载会话并刷新目录（`useProjectConversations.ts:19-23,72-81`）。
7. 前端把执行状态、流式文本和已持久化会话放在不同状态容器中。`completed` 状态本身会清空快照中的流式字段，但 Hook 有条件地保留尚未落盘的本地流式缓冲（`useCodexExecution.ts:45-57`）。

### 2.4 风险判断（当前为推测，需定向测试确认）

- **旧事件覆盖新状态**：`execution-tracker` 接收事件时没有验证事件所属 turn 是否仍是当前 turn；旧 turn 的 `item/agentMessage/delta`、`item/completed` 或 idle 状态理论上可能覆盖新 turn。当前代码能证明“缺少防护”，不能单凭静态审计证明线上一定发生。
- **最终答案短暂消失**：最终 item 完成、turn 完成和会话持久化由不同事件驱动；前端在 `sessions_changed` 后重新读取会话并可能清空流式缓冲。如果持久化读取落后于实时事件，存在短暂显示空白的可能，需要模拟事件顺序确认。
- **状态与消息刷新重复**：发送确认、最终 item、turn 完成、文件监听和页面恢复都可能各自触发读取；目前有 180ms 的 `sessions_changed` 合并，但没有按请求/版本去重所有详情读取。
- **重启后的游标语义**：服务重启后 SSE `eventId` 从 1 重新开始，客户端收到 `gap` 后恢复快照；这解决了传输重放边界，但不能恢复服务重启前未持久化的流式事件。

### 2.5 仍未知的问题

- Codex app-server 实际发送的每类事件是否都带 `turnId`，以及 item id 是否跨 turn 全局唯一。
- `turn/completed`、最终 assistant item 完成和 JSONL 落盘的真实先后顺序。
- 用户报告的“完成后仍运行中”和“最终答案短暂消失”是否由同一事件交错造成，还是由服务端持久化延迟造成。
- 同一线程快速连续 steer 时，Codex 是否可能把上一轮事件延迟发送到下一轮之后。

### 2.6 拆分边界建议（任务 A）

可以拆出的纯逻辑：

- SSE 连接、游标、重连和 gap 判断；
- 协议事件到公开事件的字段映射；
- 执行状态快照的纯状态转移；
- 前端流式文本按 `itemId`/turn 边界的合并逻辑。

暂时不能直接拆分：

- `execution-tracker.publish` 与 `handleProtocolMessage`：当前同时承担 turn 生命周期、活动列表、流式文本和健康探测交接；先确认事件协议；
- `app-server-conversation-store.handleProtocolMessage`：它同时维护 active run 监控和向执行追踪器转发；先确认监控与协议监听是否可以分离；
- `app-server-client` 的 stdout 解析、pending 请求和重启生命周期；这是一条协议适配边界，不能按文件长度机械切开。

拆分前置条件：统一公开事件 envelope，至少明确 `threadId`、`turnId`、`itemId`、传输 `eventId` 与业务序号的关系；补齐重复、乱序、旧 turn 事件和最终落盘延迟测试。

## 3. 任务 B：会话读取性能审计

### 3.1 已确认事实

1. 前端详情请求固定带 `limit=60`（`conversationApi.ts:4,32-37`），服务端只将其解析为 API 参数（`request-utils.mjs:27-35`）。
2. App Server 路径的 `findSession` 始终请求 `thread/read({ threadId, includeTurns: true })`，随后把所有 turns/items 展开成完整 `messages`，最后才执行 `before/limit` 切片（`app-server-conversation-store.mjs:170-199`）。因此 `limit` 没有限制底层 Codex 读取量。
3. JSONL 路径使用按文件 offset 的增量缓存，避免每次重新读取未变化的字节；但缓存保存的是完整 `state.messages`，`findSession` 仍在完整消息数组上切片（`jsonl-conversation-store.mjs:187-233`）。
4. `conversation-service.findSession` 每次同时调用 primary 和 fallback，即使 primary 成功也会等待 fallback，用于补充媒体块和时间字段（`conversation-service.mjs:37-53`）。这意味着一次详情请求可能触发一次 App Server 完整读取和一次 JSONL 增量解析。
5. App Server 的 `listSessions` 使用 `thread/list` 分页，每页 100 条并持续拉取 cursor；此路径只生成摘要。JSONL fallback 的 `listSessions` 会为所有项目文件调用 `readSession`，构造完整消息后路由层再去掉 `messages`（`app-server-conversation-store.mjs:104-137`、`jsonl-conversation-store.mjs:215-221`、`conversation-routes.mjs:133-136`）。
6. 前端在初始加载、消息确认、`sessions_changed`、重连/页面恢复和选择会话时都可能调用详情读取；已有请求取消和 session cache，但没有统一的详情请求版本或服务端快照版本（`useConversationSession.ts:23-62`、`useConversationCatalog.ts:33-74`、`useProjectConversations.ts:19-23,72-103`）。

### 3.2 性能热点排序

| 优先级 | 热点 | 影响 |
| --- | --- | --- |
| P0 | App Server `thread/read(includeTurns:true)` 后内存切片 | 长会话打开和切换的主要等待来源，分页无法降低 Codex 返回量 |
| P0 | primary/fallback 并行详情读取 | 每次打开/刷新长会话都增加一次 JSONL 解析和媒体合并成本 |
| P1 | `sessions_changed` 多源触发详情重读 | 最终答案、文件变更和页面恢复时可能形成连续重复请求 |
| P1 | JSONL 完整消息数组长期缓存 | 单次读取后内存占用随会话增长，不能直接支持后端窗口化读取 |
| P2 | fallback `listSessions` 为所有文件构造完整消息 | 仅在 App Server 列表失败时触发，但故障恢复阶段可能放大等待 |

### 3.3 可研究但暂不实施的方向

- 先确认 Codex `thread/read` 是否支持服务端分页、摘要模式或按 turn 范围读取；若不支持，再评估本地索引/快照。
- 将详情读取拆成“主消息读取”和“媒体补充”两条按需路径，避免每次都并行 fallback。
- 为会话详情建立版本/mtime/turn 级缓存，让相同状态下的 `sessions_changed` 不重复读取。
- JSONL 保留增量 offset，但把完整消息状态与最近窗口分离；只有用户请求更早消息时才继续解析/索引。
- 为 `findSession` 增加底层调用计数和读取字节数测试，验证 `limit=60` 是否真的减少了读取量。

## 4. 任务 C：拆分边界审计

### 4.1 当前导出接口与调用方

| 模块 | 导出接口 | 主要调用方 |
| --- | --- | --- |
| `execution-tracker.mjs` | `createExecutionTracker` | `windows/scripts/remote-room-demo.mjs`、`windows/tests/execution-tracker.test.mjs` |
| `app-server-client.mjs` | `createAppServerClient` | `app-server-conversation-store.mjs`、`multi-agent-service.mjs`、测试替身 |
| `realtime-hub.mjs` | `createRealtimeHub` | `remote-room-demo.mjs`、`request-handler.mjs` 间接使用、`realtime-hub.test.mjs` |
| `useConversationEvents.ts` | `useConversationEvents` | `useProjectConversations.ts` |
| `useCodexExecution.ts` | `useCodexExecution` | `useProjectConversations.ts` |
| `app-server-conversation-store.mjs` | `inputFromAttachments`、`createAppServerConversationStore` | `conversation-service.mjs`、`remote-room-demo.mjs`、`conversation-controls.test.mjs` |
| `jsonl-conversation-store.mjs` | `createJsonlConversationStore` | `remote-room-demo.mjs`、媒体/会话测试 |
| `conversation-service.mjs` | `createConversationService` | `remote-room-demo.mjs`、路由和媒体测试 |

### 4.2 可以拆出的边界

- `app-server-client`：版本/可执行文件解析、子进程生命周期、JSON-RPC pending 请求、协议事件分发、健康恢复；但拆分后必须保持 `request/probe/restart/subscribe/subscribeHealth/close` 兼容接口。
- `execution-tracker`：公开状态快照纯函数、协议事件分类、活动项转换、持久化队列；先把状态转移规则写成测试。
- `realtime-hub`：SSE 帧写入、游标重放、历史窗口、客户端生命周期；当前边界相对清晰，可作为低风险审计样板。
- `jsonl-conversation-store`：目录发现/header 索引、增量读取器、单行解析、消息窗口化；拆分应保持 cache 和媒体合并语义。
- `conversation-service`：primary/fallback 选择、媒体合并、调用去重；需要先确定 fallback 的产品必要性。
- 前端两个 Hook：连接恢复机制、事件过滤/游标；执行状态机、流式文本缓冲、发送/停止控制。两者可以拆成纯逻辑模块，但暂时不改 Hook 公共返回值。

### 4.3 暂时不能拆出的边界

- 未确认 `turnId` 是否覆盖所有协议事件前，不能把协议事件转换和执行状态写入拆成互不知情的模块。
- 未确认最终 item、turn completed 和 JSONL 落盘顺序前，不能把“完成态”从会话刷新逻辑中独立替换。
- 未确认 fallback 媒体补全是否仍为产品必需前，不能简单移除或改为串行调用。
- 未确认 `multi-agent-service` 与单人 `app-server-client` 的共享生命周期前，不能改动客户端接口。

### 4.4 拆分前必须补的测试

1. 同一线程连续两轮 turn，旧轮 `delta`/`completed` 到达新轮之后不得覆盖新状态。
2. `turn/completed`、最终 item 完成、JSONL 落盘乱序时，最终答案仍可见且终态唯一。
3. 重复 `sessions_changed` 在同一版本下只触发一次详情读取。
4. App Server `findSession(limit=60)` 的底层返回/解析量与无分页请求对比。
5. primary 成功时 fallback 是否仍被调用；媒体缺失时的兼容行为。
6. JSONL 文件追加、截断、半行和缓存失效场景。
7. SSE 重连、历史 gap、服务重启后快照恢复，以及不同线程事件交错。

## 5. 交付结论

### 已确认事实

- 代码基线、主要调用链、SSE 游标和会话读取路径已核对。
- `runId` 和业务 `eventSeq` 当前不存在；只有 `threadId`、局部 `turnId` 和服务级 SSE `eventId`。
- `limit` 当前主要是内存切片参数，不是底层读取限制。
- 详情读取存在 primary/fallback 并行路径和多源刷新触发点。
- 现有相关测试 27 个全部通过。

### 推测内容

- 旧事件覆盖新状态、最终答案短暂消失和重复详情读取是当前最值得定向验证的三个风险。
- 后端长会话等待主要来自完整 `thread/read`、fallback 媒体补全和重复刷新叠加。

### 仍未知的问题

- Codex app-server 事件字段的完整 turn 归属和真实落盘顺序。
- 线上复现问题与上述静态风险的准确因果关系。
- `thread/read` 是否支持真正的服务端窗口化读取。

## 6. 测试与检查

已运行：

```text
node --test \
  windows/tests/execution-tracker.test.mjs \
  windows/tests/realtime-hub.test.mjs \
  windows/tests/conversation-controls.test.mjs \
  windows/tests/conversation-service-media.test.mjs \
  windows/tests/jsonl-conversation-media.test.mjs
```

结果：27 passed，0 failed。未运行 `pnpm build:ui`，未启动或重启服务，未修改 UI 和生产逻辑。

## 7. 本轮提交边界

- 包含：本审计文档。
- 不包含：生产代码、UI、物理文件移动、重命名、配置变更。
- 后续建议：先由负责人核对本报告中的 A/B 事实，再决定是否补定向测试或挑选生产修复提交。
