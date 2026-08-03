# Codex 原生读取能力与最小回归测试审计

日期：2026-08-03
分支：`codex/realtime-contract-review`
基于提交：`af9af11`（`origin/codex/publish-current-panel`）
业务代码修改：无

## 1. 结论摘要

当前长会话性能问题不能通过给现有 `thread/read` 增加 `limit/before` 参数解决：Codex 原生 `thread/read` 的参数只有 `threadId` 和 `includeTurns`。但 Codex app-server 另有按 turn/item 分页的读取方法，可以作为后续最小性能修复的底座。

当前实现已经使用 `thread/list` 的 `cursor/limit`，但详情读取仍固定使用：

```js
client.request("thread/read", { threadId, includeTurns: true })
```

因此，下一步如果要减少长会话读取量，应增加一个兼容适配层，优先尝试原生分页读取，失败或能力不足时再保留旧 `thread/read` 路径；不能直接把新方法名写死，也不能在没有“媒体是否完整”判据的情况下贸然移除 JSONL fallback。

## 2. 任务 A：确认 Codex 原生读取能力

### 2.1 本机核对方式

本机存在两个 Codex CLI 版本：

- `codex-cli 0.130.0-alpha.5`
- `codex-cli 0.146.0-alpha.9.2`

两者均支持只生成协议 schema 的命令：

```text
codex app-server generate-json-schema --experimental --out <temporary-directory>
```

未启动 app-server，未连接远程服务。

### 2.2 `thread/read` 原生参数

生成的 `ThreadReadParams` 只有：

| 参数 | 含义 |
| --- | --- |
| `threadId` | 必填，会话 ID |
| `includeTurns` | 是否把 rollout history 中的 turns/items 一并返回 |

没有以下参数：

- `limit`
- `before`
- `cursor`
- `offset`
- 按 message/item 的窗口参数

因此，当前 Web API 的 `limit=60&before=...` 只是本项目自己的分页参数；在 App Server 路径中，它们没有传递给 Codex 原生读取层。

### 2.3 原生分页读取方法

#### Codex 0.146.0-alpha.9.2

`thread/turns/list`：

- `threadId`
- `cursor`
- `limit`
- `sortDirection`：`asc` / `desc`
- `itemsView`：`notLoaded` / `summary` / `full`

返回：`data`、`nextCursor`、`backwardsCursor`。每个 turn 包含 `id`、`startedAt`、`completedAt`、`status`、`durationMs`，并按 `itemsView` 决定 item 详情量。

`thread/items/list`：

- `threadId`
- `turnId`（可选）
- `cursor`
- `limit`
- `sortDirection`

返回带 `turnId` 的 item entry，并提供 `nextCursor` / `backwardsCursor`。

#### Codex 0.130.0-alpha.5

仍支持 `thread/turns/list`，参数和分页语义基本一致；item 分页方法名为：

```text
thread/turns/items/list
```

其参数同样包含 `threadId`、`turnId`、`cursor`、`limit`、`sortDirection`。

### 2.4 当前代码是否已经封装

当前 `app-server-client.mjs` 的 `request(method, params)` 是通用 JSON-RPC 转发，没有针对分页方法的专用封装或能力检测。

当前 `app-server-conversation-store.mjs` 的使用情况：

- `thread/list`：已使用 `cursor`、`limit`、`sortDirection`。
- `thread/read(includeTurns:false)`：用于状态探测和恢复。
- `thread/read(includeTurns:true)`：用于完整详情读取。
- `thread/turns/list`：未使用。
- `thread/items/list` / `thread/turns/items/list`：未使用。
- `thread/resume.initialTurnsPage`：未使用；当前只传 `persistExtendedHistory: true`。

### 2.5 已确认事实、推测和未知

已确认事实：

- `thread/read` 本身没有原生分页参数。
- 原生分页能力存在，而且是按 turn/item 设计的。
- 分页方法名在已安装版本之间存在兼容差异。
- 当前项目没有封装或调用这些详情分页方法。

推测：

- 采用 `thread/turns/list(itemsView:"full")` 按 turn 分页，可能是最容易保留 turn 时间和 item 语义的路径。
- 如果需要严格按 item 数量分页，item list 方法更直接，但需要额外合并 turn 元数据和消息时间。

未知：

- 原开发电脑实际安装的 Codex CLI 版本。
- 原开发电脑是否支持新方法名 `thread/items/list`，还是旧方法名 `thread/turns/items/list`。
- 分页接口在真实长会话、包含图片/附件和正在运行 turn 时的返回细节。
- 当前 app-server 版本是否会对某些历史会话拒绝分页请求。

## 3. 任务 B：最小回归测试设计

### 3.1 主数据成功时不自动读取完整 JSONL fallback

测试位置建议：`windows/tests/conversation-service-media.test.mjs`。

测试方式：

1. primary 返回完整文本和媒体信息，并记录调用次数。
2. fallback 记录调用次数但不应被调用。
3. 断言结果内容、图片/附件 blocks 保留，且 fallback 调用数为 0。

当前缺口：项目没有明确的“primary 媒体信息完整”字段或判定函数。若不先定义这个判据，生产代码无法安全判断何时可以跳过 fallback。

### 3.2 主数据失败时仍可 fallback

测试方式：

1. primary.findSession 抛出异常。
2. fallback.findSession 返回正常会话。
3. 断言最终结果来自 fallback，且错误没有继续向上抛出。

现有测试结构可以支持，当前没有覆盖 primary 失败分支的独立测试。

### 3.3 fallback 媒体补偿不破坏图片附件

现有 `conversation-service-media.test.mjs` 已覆盖“primary 文本 + fallback 图片媒体”的合并路径。

后续修复必须保留以下断言：

- 文本消息不重复；
- 图片/audio/video blocks 仍存在；
- primary 已有的媒体不被 fallback 重复添加；
- `createdAt` 优先保留 primary，缺失时才使用 fallback。

### 3.4 旧 Turn 的终态事件不能覆盖新 Turn

测试位置建议：`windows/tests/execution-tracker.test.mjs`。

最小序列：

1. `turn/started(turn-1)`；
2. `turn/started(turn-2)`；
3. 延迟到达 `turn/completed(turn-1)`；
4. 断言最终状态仍属于 `turn-2`，且没有被标记为 completed/idle；
5. 再到达 `turn/completed(turn-2)`，才允许进入终态。

当前测试结构可以支持这个测试，但现有生产代码没有按 turnId 拒绝旧事件的逻辑，因此测试在修复前预期会暴露问题。

### 3.5 SSE 断档只触发一次恢复

现有 `windows/tests/realtime-hub.test.mjs` 只验证服务端 gap 标记和事件重放，不能覆盖 React Hook 的 `requestRecovery` 去重。

当前缺少：

- `useConversationEvents` 的浏览器/EventSource 测试环境；
- 对 `event-gap`、`reconnected`、`stale-execution` 合并优先级的直接断言；
- 对同一 gap 在 handshake 和后续事件乱序到达时只触发一次恢复的测试。

若暂时不引入前端测试工具，建议先把恢复决策抽成纯函数后再测试；本轮不修改生产代码，直接记录为测试基础设施缺口。

### 3.6 最小回归测试清单

| 编号 | 场景 | 当前可测试性 | 是否应先补 |
| --- | --- | --- | --- |
| T1 | primary 成功且 fallback 不调用 | Mock 容易；媒体完整判据未定义 | 是 |
| T2 | primary 失败转 fallback | Node 单测可直接补 | 是 |
| T3 | fallback 媒体补偿 | 已有基础测试 | 保留并扩展 |
| T4 | 旧 turn 终态不得覆盖新 turn | Node 单测可直接补 | 是 |
| T5 | SSE gap 单次恢复 | 缺前端 Hook 测试环境 | 先补测试边界，不改生产 |
| T6 | 分页参数真的减少原生读取量 | 需要 fake client 记录方法和参数 | 是 |
| T7 | 新旧 Codex 分页方法兼容 | 需要 capability/version fixture | 是 |

## 4. 任务 C：拆分前置条件

### 可以独立抽出

- Codex 版本/能力检测：识别 `thread/items/list` 与 `thread/turns/items/list`。
- 分页读取适配器：对外提供统一的 `listTurns` / `listItems`，内部选择原生方法。
- turn/item 到项目消息模型的纯映射逻辑。
- primary/fallback 选择策略的纯判断函数。
- SSE 恢复原因合并和优先级计算的纯逻辑。

### 必须留在协议适配边界

- `app-server-client` 的 JSON-RPC 子进程、pending request、重启和协议通知分发。
- `app-server-conversation-store` 的 thread resume、active run 监控和 Codex 调用生命周期。
- 原生分页方法的版本兼容与错误 fallback。
- `execution-tracker` 对协议事件的 turn 生命周期判断，直到旧 turn 测试通过。

### 必须先有的调用方清单

- `conversation-service.findSession` 的 primary/fallback 调用关系；
- `app-server-conversation-store.findSession`、`resumeThread`、`getThreadStatus` 的共享 client 调用关系；
- `multi-agent-service` 对 `app-server-client` 的独立使用方式；
- 前端 `useConversationSession`、`useProjectConversations` 的详情刷新触发方；
- `useConversationEvents` 的恢复回调与 `sessions_changed` 刷新关系。

### 必须先通过的测试

- T1/T2/T3：fallback 策略和媒体兼容；
- T4：旧 turn 事件隔离；
- T6/T7：原生分页方法、参数和版本兼容；
- 至少一个详情请求去重/重复刷新测试；
- SSE 恢复测试缺口有可执行的测试方案后，再进入实时状态补丁。

### 当前不应该做

- 不直接修改 `thread/read` 参数名假装实现分页；
- 不在没有媒体完整判据前删除 JSONL fallback；
- 不把新版本 `thread/items/list` 写死为唯一方法；
- 不先做 `execution-tracker`、`app-server-client`、`app-server-conversation-store` 的大范围物理拆分；
- 不把 runId/turnId/eventSeq 设计和长会话性能补丁混在一个提交中；
- 不修改 UI、群聊、服务启动方式或远程入口。

## 5. 建议交付顺序

1. 负责人先在产品分支处理 `conversation-service.findSession` 的 fallback 策略，但先补 T1/T2/T3，明确媒体完整判据。
2. 另一条线先补 T6/T7 所需的 client mock/capability fixture，不调用真实服务。
3. 原开发电脑确认 Codex CLI 版本后，再决定使用 `thread/turns/list`、新旧 item list 兼容层，还是保留旧 `thread/read` fallback。
4. 长会话性能修复稳定并通过定向测试后，再单独处理实时状态的 T4/T5 和事件合同。

## 6. 测试与检查

本轮未启动或重启服务，未修改生产代码和 UI。

已完成的只读确认：

- 本机两个 Codex CLI 版本号；
- 两个版本的 app-server JSON Schema；
- `thread/read`、`thread/turns/list`、item list 的参数和返回字段；
- 当前项目对这些原生方法的调用情况；
- 当前 Node 测试目录和前端测试基础设施情况。

已运行：

- 相关服务端 Node 测试：27 passed，0 failed；
- `git diff --check`：通过。

未运行：

- `pnpm build:ui`；

## 7. 提交边界

- 本文档是独立审计/测试设计交付物。
- 不包含生产逻辑修改。
- 不修改已冻结的 `codex/realtime-architecture-audit`。
- 不合入 `codex/publish-current-panel`。
