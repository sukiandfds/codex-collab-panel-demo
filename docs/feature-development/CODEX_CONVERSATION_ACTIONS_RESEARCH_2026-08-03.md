---
document_type: feature_research
schema_version: 1
research_id: RESEARCH-2026-08-03-CODEX-CONVERSATION-ACTIONS
project_id: negus
status: discovery
last_updated: 2026-08-03 14:18:01 +08:00
product_branch: codex/publish-current-panel
product_base_commit: 208c9e48eb0f5855018fee5d697c68c376278fb5
---

# Codex 对话操作功能调研

## 1. 调研目标

本次针对三个用户需求评估技术路径和实现边界：

1. 在消息下方增加内容快捷复制按钮。
2. 增加类似 Codex 的“从当前对话继续”操作。
3. 增加类似 Codex 的项目对话归档和恢复。

本报告先完成想法和调研，不修改生产代码，不改变基础 UI 样式，也不把三个功能合并成一个难以回滚的大提交。

## 2. 官方资料结论

### 2.1 资料可访问性

2026-08-03 通过官方 Codex 手册入口
`https://developers.openai.com/codex/codex-manual.md` 获取资料时返回 HTTP 403（Vercel `X-Vercel-Mitigated: deny`）。因此本报告不把无法访问的桌面端私有 UI 行为当成已确认事实。

可核对的官方一手实现来自 OpenAI 官方开源仓库 `openai/codex`：

- 仓库：<https://github.com/openai/codex>
- 本次固定核对提交：`bb5054fe47abe73ecbbd454751066a28c89f4bb9`
- 该仓库的 app-server 协议 schema 和 CLI 实现可证明协议能力，但不能证明桌面端每一个按钮的最终视觉布局。

### 2.2 “继续”要区分两种行为

官方协议中有两个容易混淆的动作：

| 行为 | 官方协议 | 用户看到的结果 | 本项目现状 |
| --- | --- | --- | --- |
| 继续同一个对话 | `thread/resume` 后再 `turn/start` | 仍在原 Thread 中追加一轮 | 已有。`app-server-conversation-store.mjs` 的 `sendMessage()` 会先 `resumeThread()` |
| 从某个历史位置分叉继续 | `thread/fork` | 创建一个新的 Thread，保留历史前缀，后续内容独立 | 尚未接入 |

用户截图中消息下方的斜向箭头更接近第二种“从这里继续/分叉”，不是简单重新打开原对话。因此建议按钮文案使用“从这里继续”，避免让用户误以为会修改原对话。

官方 `ThreadForkParams` 明确支持：

- `threadId`：源 Thread；
- `lastTurnId`：分叉包含到哪一个 Turn（包含该 Turn）；
- `model`、`modelProvider` 等可选配置覆盖；
- 不能从仍在进行中的 Turn 分叉。

官方 `ThreadForkResponse` 返回新的 Thread。官方 `Thread` 类型还提供 `forkedFromId`，可用于显示来源或建立分支关系。

来源：

- <https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/app-server-protocol/schema/json/v2/ThreadForkParams.json>
- <https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/app-server-protocol/schema/json/v2/ThreadForkResponse.json>
- <https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/app-server-protocol/schema/typescript/v2/Thread.ts>

### 2.3 归档是服务端可恢复操作，不是前端删除

官方 app-server 提供：

- `thread/archive`：归档一个已物化的 Thread；
- `thread/unarchive`：恢复一个已归档的 Thread；
- `thread/list` 的 `archived` 参数：分别查询归档或未归档列表；
- `thread/archived`、`thread/unarchived` 通知：客户端可以更新列表，不必依赖整页刷新。

官方 CLI 的归档实现也直接调用 app-server，而不是只在 UI 中隐藏项目：

- `codex archive` 与 `codex unarchive` 共用会话归档实现；
- 归档会把 rollout 移到归档目录；
- 归档仍可按 UUID 或精确名称定位；
- 归档和删除是不同动作，删除需要额外确认并且不可逆。

来源：

- <https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/app-server-protocol/schema/json/v2/ThreadArchiveParams.json>
- <https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/app-server-protocol/schema/json/v2/ThreadUnarchiveParams.json>
- <https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/app-server-protocol/schema/json/v2/ThreadListParams.json>
- <https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/tui/src/session_archive_commands.rs>
- <https://github.com/openai/codex/blob/bb5054fe47abe73ecbbd454751066a28c89f4bb9/codex-rs/app-server/tests/suite/v2/thread_archive.rs>

### 2.4 快捷复制不是 Thread 协议动作

官方 app-server 协议没有“复制消息” RPC。复制属于客户端消息操作：读取当前消息的可复制文本，调用浏览器 Clipboard API，并反馈短暂的成功或失败状态。

因此复制不应触发服务端请求、会话重读、Turn 状态变化或项目日志记录。

## 3. 当前项目代码现状

### 3.1 已有能力

- `windows/server/app-server-conversation-store.mjs`
  - 已有 `thread/list`、`thread/read`、`thread/start`、`thread/resume`、`turn/start`。
  - `sendMessage()` 已经先恢复 Thread，再开始新的 Turn。
  - `app-server-client.mjs` 的 `request(method, params)` 可以传递任意 RPC 方法，理论上不需要新增底层传输层。
- `windows/server/routes/conversation-routes.mjs`
  - 已有发送、停止、模型、推理程度、上下文压缩和会话读取路由。
  - 尚无 fork、archive、unarchive 路由。
- `web-ui/src/features/conversations/rendering/ContentRenderer.tsx`
  - 已负责 Markdown、代码块、图片、音频、视频和普通文件渲染。
  - 尚无消息级操作栏。
- `web-ui/src/features/conversations/model/types.ts`
  - `SessionMessage` 只有消息 id、角色、文本、内容块和时间。
  - 没有 `turnId`，因此暂时不能从某条消息准确定位 `thread/fork` 的 `lastTurnId`。
- `web-ui/src/features/conversations/components/SessionList.tsx`
  - 只显示当前会话列表，没有归档筛选、归档入口或恢复入口。
- `windows/server/jsonl-conversation-store.mjs`
  - 会递归扫描 JSONL。若直接增加归档视图，必须明确区分活动目录和归档目录，避免归档会话又出现在活动列表。

### 3.2 当前没有必要重复开发的部分

“继续原对话”本身已经由发送链路覆盖：发送前调用 `thread/resume`，然后在原 Thread 上 `turn/start`。如果再做一个名称叫“继续当前对话”的按钮，但仍只调用这条链路，用户不会获得新的能力。

真正有价值的是消息级“从这里继续”，即创建一个可独立推进的新分支。

## 4. 三项功能评估

| 建议编号 | 功能 | 用户操作后的变化 | 主要实现边界 | 难度 | 主要风险 |
| --- | --- | --- | --- | --- | --- |
| `FEAT-012` | 消息快捷复制 | 点击消息下方复制图标，立即复制该消息的原始文本；按钮短暂显示已复制，失败时显示可理解的失败状态 | 纯前端；`navigator.clipboard.writeText(message.text)`；不改 Thread 数据 | 低 | 非安全上下文或浏览器权限导致 Clipboard API 失败；需要保留 Markdown/代码格式而不是复制破坏后的 DOM 文本 |
| `FEAT-013` | 从当前消息继续 | 点击斜向箭头后，以当前消息所属 Turn 为边界创建新 Thread，自动切换到新分支，原对话保持不变，用户可继续输入 | 需要消息携带 `turnId`；服务端调用 `thread/fork`；新 Thread 写入会话列表并选择 | 中 | 当前 Turn 运行中不能分叉；本地 Codex 版本可能尚未支持该 RPC；分叉点错误会造成用户以为复制了完整上下文 |
| `FEAT-014` | 项目对话归档/恢复 | 从会话菜单归档后，活动列表立即移除；在“已归档”视图可恢复；归档不删除内容，恢复后可继续对话 | `thread/archive`、`thread/unarchive`、`thread/list(archived)`；活动/归档列表分开；处理选中会话被归档的情况 | 中高 | 旧 app-server 不支持参数或 RPC；空 Thread 未物化时归档可能失败；JSONL fallback 可能把归档目录误当活动会话 |

### 4.1 推荐开发顺序

1. **先做 `FEAT-012` 复制**：不碰服务端协议，最快验证消息操作栏的布局和手机触控体验。
2. **再做 `FEAT-013` 分叉继续**：先加入 Turn 来源字段和 capability 检查，再接 `thread/fork`，避免生成错误分支。
3. **最后做 `FEAT-014` 归档**：它会影响列表数据源、当前选择、fallback 和跨设备状态，不能只加一个隐藏按钮。

## 5. 推荐的数据和接口形状

以下是实现前的建议合同，不代表本轮已经写入代码。

### 5.1 消息来源字段

在 `SessionMessage` 增加可选字段：

```ts
turnId?: string;
itemId?: string;
```

服务端将 `thread.turns` 展平为消息时，把所属 Turn id 一起带出。普通复制不依赖这两个字段；分叉按钮依赖 `turnId`。

### 5.2 分叉

建议增加：

```text
POST /api/session/fork
body: { threadId, lastTurnId }
result: { session: SessionSummary, sourceThreadId, forkedFromTurnId }
```

服务端调用：

```text
thread/fork({ threadId, lastTurnId, cwd: projectRoot })
```

成功后前端将新 Thread 设为当前选择；不自动发送额外文本，不重复原消息，不修改源 Thread。

### 5.3 归档与恢复

建议增加：

```text
GET  /api/sessions?archived=0|1
POST /api/session/archive    body: { threadId }
POST /api/session/unarchive  body: { threadId }
```

服务端统一使用 app-server 的 archive/unarchive RPC。列表查询优先使用 `thread/list` 的 `archived` 参数；如果当前 Codex 版本不支持，必须明确显示“当前运行时不支持归档”，不能默默改成只在浏览器隐藏。

## 6. 用户体验验收标准

### 6.1 复制

- 用户在电脑和手机上都能看到消息下方的复制图标。
- 点击后不刷新对话、不触发同步、不改变执行状态。
- 成功反馈只保留短暂状态，不新增永久文字噪音。
- 复制的是消息原始 Markdown/文本；代码块、换行和链接文本不被渲染层破坏。
- Clipboard 不可用时明确显示失败，并保留原消息。

### 6.2 从这里继续

- 当前对话已经完成时按钮可用；Turn 执行中按钮禁用或明确提示稍后使用。
- 点击后源对话内容不变化，新分支立即出现在项目会话列表并被选中。
- 新分支标题有可识别的来源，不能继续显示为同一个无法区分的标题。
- 在新分支发送消息只影响新 Thread，源对话不会追加这条消息。
- 后端不支持 `thread/fork` 时，按钮不显示或给出明确不可用原因，不伪造成功。

### 6.3 归档

- 归档前应有明确的会话名称，不能误把删除当归档。
- 归档成功后活动列表立即移除该会话；如果它是当前会话，页面切换到下一个可用会话或显示空状态。
- “已归档”是独立筛选视图，不与活动列表混排。
- 恢复后会话回到活动列表，可重新打开和继续发送。
- 归档失败时保留列表和当前会话，不显示“已完成”的假状态。

## 7. 风险与前置验证

### 必须先验证

1. 当前本机 Codex app-server 是否支持 `thread/fork`、`thread/archive`、`thread/unarchive`，以及 `thread/list` 的 `archived` 参数。
2. 当前运行时返回的 `thread.turns` 是否包含稳定的 Turn id，且消息映射能保留该 id。
3. 当前项目的 JSONL fallback 是否能识别归档目录，不能让归档项重复进入活动列表。
4. 当前服务端的 projectRoot 校验能否同时覆盖 fork、archive、unarchive，避免跨项目操作。

### 不应提前做

- 不要先改基础 UI 样式或重排整个消息卡片。
- 不要为了复制按钮引入新的状态管理库或服务端存储。
- 不要把“继续同一 Thread”和“分叉新 Thread”混成一个接口。
- 不要把归档实现成删除 JSONL 文件，也不要先做永久删除功能。
- 不要在 app-server 能力未确认前把按钮做成永远可点击。

## 8. 与项目管理功能的闭环流程

### 8.1 条目拆分

建议分别建立三个条目，避免一个“大功能”同时修改消息渲染、Thread 协议和会话列表：

| 条目 | 初始状态 | 关联报告 | 关闭判定 |
| --- | --- | --- | --- |
| `FEAT-012` 消息快捷复制 | `planned` | 本报告第 4、6.1 节 | 复制成功/失败反馈、移动端触控和定向测试完成 |
| `FEAT-013` 从当前消息分叉继续 | `planned` | 本报告第 2.2、4、5.2、6.2 节 | 源 Thread 不变，新 Thread 可继续发送，fork 能力兼容已验证 |
| `FEAT-014` 项目对话归档恢复 | `planned` | 本报告第 2.3、4、5.3、6.3 节 | 活动/归档列表分离，恢复可继续，fallback 和失败状态可解释 |

### 8.2 一次完整的想法—调研—实操—修复—关闭

1. **想法**：在对应 `item.md` 记录用户原话、助手字面理解、用户当前痛点和预计体验；不根据代码反推用户原话。
2. **调研**：把官方来源、当前代码入口、已确认事实、未知事实、实现边界和风险写入本报告或条目 `process.md`；状态保持 `discovery`/`planned`，不宣称已实现。
3. **实操**：在 `codex/publish-current-panel` 上按一个条目一个产品提交开发。记录 `product_base_commit`、修改文件、用户可见变化和定向检查结果。
4. **修复**：发现问题时新增对应 bug 或条目更新，记录用户看到的现象、根因、修复提交和回归检查；不要直接覆盖原研究结论。
5. **文档同步**：在 `codex/project-docs-and-audits` 写明“本记录对应产品提交：<完整 SHA>”，填入 `docs_commit` 和 `sync_status`。
6. **独立审计**：审计人员从该产品完整 SHA 创建独立 worktree，只审计对应功能；报告写明代码基线和审计结论。
7. **关闭**：只有产品代码、文档、审计都指向同一产品 SHA，且用户可见验收标准完成，条目才从 `audit_pending` 进入 `completed`。随后清理临时 worktree。

### 8.3 推荐的提交切分

- `FEAT-012`：一个前端提交，必要时一个定向测试提交；不带 fork 或归档代码。
- `FEAT-013`：先提交消息 Turn 来源和 fork API，再提交 UI 操作；若协议不兼容，记录为 `blocked`，不留下半可用按钮。
- `FEAT-014`：先提交能力探测/列表合同，再提交归档操作和恢复视图；不要把 fallback 修复和大规模 UI 重构混在一起。

## 9. 当前结论

- 三项需求都可做，但不是同一难度：复制最简单，分叉继续需要 Thread/Turn 语义，归档涉及服务端状态和列表数据源。
- 当前项目已经具备复用的 app-server 请求层和会话组件，不需要另起一套对话架构。
- “从当前对话继续”建议明确实现为官方 `thread/fork` 的“从这里继续”；同一 Thread 的继续发送已经存在。
- 归档必须是可恢复的服务端操作，活动列表和归档列表分开，不能只做前端 CSS 隐藏。
- 本轮只完成调研文档和流程设计；生产代码仍未修改，三个功能等待进入各自条目后的实操阶段。
