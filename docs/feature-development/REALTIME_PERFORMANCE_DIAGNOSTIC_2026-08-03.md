---
document_type: realtime_performance_diagnostic
schema_version: 1
date: 2026-08-03
status: confirmed_with_open_boundaries
scope: read_only_runtime_and_source_diagnosis
---

# 2026-08-03 实时、卡顿与加载问题排查报告

## 1. 排查范围

本次只做只读排查：

- 保护并确认现有未提交改动。
- 盘点历史文档中与卡顿、延迟、加载慢、状态冲突和任务失联有关的条目。
- 读取真实代码链路，定位现象对应的文件和代码位置。
- 使用当前已经运行的真实 Turn 做受控观察。
- 测量本地接口、会话读取、SSE 连接和项目管理接口。

本次没有修改业务代码、没有重启服务、没有发送额外的 Codex 任务、没有改变 UI。

当前工作区另有两份未提交文档改动，属于用户已有内容，本报告没有覆盖：

- docs/feature-development/features/FEAT-002-group-multi-agent.md
- docs/project-management/items/FEAT-002/updates.md

## 2. 先给结论

当前体验“卡、慢、但基本能用”的主要原因不是一个刷新参数，也不是所有接口都慢，而是下面三件事叠加：

1. 长会话读取仍然接近全量读取。当前真实会话有 764 条消息；即使前端只请求最近 1 条，服务端仍先读取完整 Thread，并同时读取 JSONL 作为媒体补偿。
2. 一次发送或状态变化会触发多次会话刷新。POST 发送确认、turn/started、item/completed 和 sessions_changed 都可能触发同一个会话重新读取。
3. 实时事件、执行 tracker、浏览器流式草稿、localStorage 快照和持久化会话没有统一的 runId、turnId、eventSeq 交接规则。终态、重连和下一 Turn 时，旧状态可能覆盖新状态，或新状态短暂显示旧过程。

因此，继续调整“刷新频率”“状态文案”或局部样式，不能解决主要体感。优先级应放在历史读取成本和事件生命周期交接。

## 3. 已有进度记录中的相关问题

| 条目 | 当前状态 | 已记录现象 | 本次判断 |
| --- | --- | --- | --- |
| FEAT-001-I02 | mitigated | 长对话和会话列表加载慢，手机重新打开需要等待 | 没有关闭。当前长 Thread 实测仍需约 3.0-5.5 秒 |
| FEAT-001-I08 | implemented_pending_review | 任务运行 1-2 分钟后过程不再更新，重开页面才看到完成 | 代码有重连和快照补偿，但真实长任务仍未闭环验证 |
| FEAT-001-I12 | planned_p0 | 端口在线但 Turn 无真实事件，核心接口半失效 | 防卡死与受控恢复仍是待开发项 |
| FEAT-001-I15 | implemented_pending_review | 手机约 2 分钟后过程更新停止 | SSE 恢复机制存在，移动端长任务证据仍不足 |
| FEAT-001-I17 | active | 新消息短暂显示上一 Turn 的过程 | 与当前缺少 Turn 级事件隔离相符 |
| FEAT-001-I21 | mitigated | 长时间只显示“正在运行”，无法判断正常处理还是卡死 | 只能说明有恢复边界，不能证明状态链路已经稳定 |
| FEAT-001-I24 | active | 终态恢复、流式回答交接、新 Turn 切换时状态不一致 | 与本次代码链路发现的多源状态和重复刷新直接相关 |
| PROC-019 | active, P0 | Turn 停滞后拖成项目服务半失效，端口仍在线但接口超时 | 本次仍应作为服务级故障边界处理 |
| PROC-020 | active, P0 | 在承载当前请求的服务进程内 Stop/Start 会自中断 | 本次未执行重启，规则仍有效 |
| PROC-022 | active | 跨设备终态、流式文本和新 Turn 没有统一顺序 | 是当前最核心的状态冲突记录 |
| PM-001-P03 | mitigated | 项目管理页面切换慢于 Codex 切换对话 | 接口本身不慢，整页导航和首屏策略仍是体感来源 |
| FEAT-005 | discovery | Desktop/Web 共享持久化 Thread，但不共享实时事件 | 不能通过前端刷新假装解决桌面端当前窗口热同步 |

原始记录位置：

- docs/feature-development/features/FEAT-001-single-codex-web.md
- docs/feature-development/DEVELOPMENT_COMMON_MISTAKES.md
- docs/project-management/items/FEAT-001/process.md
- docs/project-management/items/PM-001/process.md

## 4. 当前运行环境与受控实测

### 4.1 服务与进程

- 分支：codex/publish-current-panel
- 9360：由 PID 34720 监听，Node 工作集约 425 MB。
- app-server 子进程：另有 Node PID 18504，工作集约 64 MB。
- /api/project：HTTP 200，约 111 ms。
- 这只能证明项目服务端口和基础健康接口可用，不能证明 Turn、SSE 或会话读取健康。

### 4.2 真实 Turn 观察

本次没有额外发送一条测试消息，因为当前已经存在一个真实活动 Turn；额外发送会改变用户的 Codex 任务。使用该真实 Turn 做了只读观察：

- threadId：019fb3b3-ebde-7db2-9cad-478e0a5c6598
- turnId：019fc563-1f82-7ad2-8a0c-0e6fe4ff9f51
- 观察时状态：phase=command，active=true
- 服务端能够持续更新 lastEventAt，说明当前 Turn 的命令事件仍在产生。
- /api/execution-status 不带 reconcile：约 32-52 ms。
- /api/execution-status 带 reconcile=1：一次实测约 2446 ms。它会触发 app-server 的 thread/read 权威探针，不能当作普通轻量状态查询。

### 4.3 SSE 实测

- 建立 /events SSE：HTTP 200，约 24-25 ms。
- 连接首个 connected 事件：约 26-27 ms。
- 12 秒观察到：1 次 heartbeat、2 次 sessions_changed、1 次 context_status。
- 观察窗口没有捕获 assistant_delta；这不能单独证明增量丢失，因为窗口内主要是只读检查命令，而且增量可能已经在建立 SSE 前发送。
- 结论：SSE 传输层当时可连接，但“传输已连接”不等于当前会话已经正确完成终态交接。

### 4.4 接口测量

| 请求 | 实测结果 | 体积 | 说明 |
| --- | --- | --- | --- |
| /api/project | 200，约 111 ms | 约 0.1 KB | 基础健康接口很快 |
| /api/device | 200，约 6 ms | 54 B | 设备信息不是瓶颈 |
| /api/models | 200，约 7-10 ms | 3.2 KB | 模型目录不是当前卡顿主因 |
| /api/sessions | 200，约 490-811 ms | 3.8 KB | 会话列表明显慢于基础接口，但不是最大瓶颈 |
| /api/session，当前会话 limit=60 | 200，约 3.0-3.8 s | 约 296 KB | 长会话读取主瓶颈 |
| /api/session，当前会话 limit=1 | 200，约 3.6 s | 约 2.3 KB | 只减少响应体，没有减少服务端全量读取成本 |
| /api/session，小会话 5 条消息 | 200，约 20 ms | 约 7.4 KB | 说明延迟随会话内容和解析量增长 |
| /api/session，595 条消息 | 200，约 3.1 s | 约 123 KB | 长会话延迟再次复现 |
| /api/project-management | 200，约 41-108 ms | 约 37 KB | 接口本身不慢 |
| /api/project-progress | 200，约 123-210 ms | 约 265 KB | 返回内容较大，页面没有旧摘要首屏缓存 |

### 4.5 列表和详情元数据不一致

同一个当前会话的实测结果：

- /api/sessions 中 updatedAt：2026-08-03T02:19:38.000Z
- /api/session 中 updatedAt：2026-07-30T15:45:40.000Z
- /api/session 的 latestUser 已是 2026-08-03 的本轮用户消息

这说明列表使用 thread/list 的更新时间，详情使用 thread/read 的更新时间；详情数据已经更新，但更新时间字段仍可能是旧值。用户会看到“内容更新了，时间却没更新”的状态冲突。

## 5. 逻辑链路

### 5.1 页面首次打开和切换

    HTML 导航
      -> Service Worker 缓存或网络请求
      -> React 入口
      -> useProjectConversations
      -> localStorage 受控快照
      -> 并行请求 /api/project、/api/sessions、/api/session
      -> 建立 /events SSE
      -> 当前会话执行状态刷新

关键代码：

- 多入口整页导航：web-ui/src/components/ViewSwitcher/ViewSwitcher.tsx:5-14
- 导航缓存策略：web-ui/public/sw.js:38-61
- 当前会话快照：web-ui/src/features/conversations/data/conversationSnapshot.ts:25-47
- 首次并行读取：web-ui/src/features/conversations/hooks/useConversationCatalog.ts:77-98
- 项目进度页没有旧数据首屏：web-ui/src/features/project-progress/ProjectProgressApp.tsx:13-26、54-70
- 项目管理页虽有 sessionStorage，但首次仍启动网络读取：web-ui/src/features/project-management/ProjectManagementApp.tsx:12-46

用户可见结果：

- Codex 页面切换会话时，已有缓存可以较快显示。
- 项目进度页每次进入都先等待 /api/project-progress，首屏没有可复用摘要。
- 多个 HTML 入口切换时，页面本身也需要重新初始化，不只是换数据。

### 5.2 发送一条消息

    Composer
      -> useProjectConversations.sendMessage
      -> 先追加 optimistic message
      -> useCodexExecution.sendMessage
      -> POST /api/session/message
      -> conversation-routes
      -> execution.markSubmitted
      -> app-server store resumeThread
      -> app-server turn/start
      -> Codex protocol events
      -> execution-tracker
      -> realtime-hub
      -> /events SSE
      -> useConversationEvents
      -> useCodexExecution.applyStatus / assistant_delta
      -> sessions_changed
      -> 再次读取完整会话

关键代码：

- 前端先显示临时用户消息：web-ui/src/features/conversations/hooks/useProjectConversations.ts:51-70
- 发送确认超时 20 秒、3 秒显示网络较慢：web-ui/src/features/execution/hooks/useCodexExecution.ts:5-6、116-169
- 服务端 POST 路由：windows/server/routes/conversation-routes.mjs:8-42
- 每次已有 Thread 发送前 resume，再 turn/start：windows/server/app-server-conversation-store.mjs:202-228
- 发送成功后立即重新读取会话：web-ui/src/features/conversations/hooks/useProjectConversations.ts:19-23、51-70
- sessions_changed 也会触发读取：web-ui/src/features/conversations/hooks/useProjectConversations.ts:72-81

主要问题：

- optimistic message 先出现是必要的，但真实保存消息确认后会触发完整会话替换。
- 同一轮可能同时由发送确认、turn/started、item/completed 和 sessions_changed 触发读取。
- 这些读取会被新的请求 abort，但服务端已经可能开始读取 84 MB 的 JSONL 或完整 Thread，浪费仍然发生。

### 5.3 实时事件和状态恢复

    Codex app-server protocol
      -> app-server-conversation-store.activeRuns
      -> execution-tracker.statuses
      -> realtime-hub history/clients
      -> browser EventSource
      -> execution hook 本地 status/streaming buffer
      -> session snapshot / persisted message

关键代码：

- app-server 活动运行监控：windows/server/app-server-conversation-store.mjs:27-100
- tracker 状态发布和持久化：windows/server/execution-tracker.mjs:6-88
- protocol 到状态的映射：windows/server/execution-tracker.mjs:169-276
- 权威探针和恢复状态：windows/server/execution-tracker.mjs:297-386
- SSE 事件历史只保留内存中最近 200 条：windows/server/realtime-hub.mjs:1-6、79-88
- SSE 连接、重放和心跳：windows/server/realtime-hub.mjs:24-75
- 浏览器重连、8 秒首事件、25 秒传输、30 秒无进展恢复：web-ui/src/features/conversations/realtime/useConversationEvents.ts:6-13、90-190
- 浏览器流式缓冲和完成态保护：web-ui/src/features/execution/hooks/useCodexExecution.ts:45-58、88-114

状态冲突来源：

1. 服务端 tracker 状态和 app-server 权威状态各有一套生命周期。
2. SSE 事件历史在服务进程内存中，服务重启后 eventId 从头开始。
3. 浏览器还有 localStorage 快照和本地 streaming buffer。
4. UI 当前只按 threadId 过滤事件，没有贯穿每个 Run/Turn 的 eventSeq 单调约束。
5. sessions_changed 会清理流式内容并重新加载持久化会话，可能与最后一段 assistant_delta 交错。

这正对应 PROC-022 的“旧状态残留、流式文字短暂消失、上一 Turn 过程串入当前 Turn”记录。当前只能确认结构性风险和用户现象，不能把某一个 React 回调或某一个 app-server 内部锁写成唯一根因。

## 6. 现象到代码的对应表

| 用户现象 | 直接证据 | 对应文件和位置 | 根因边界 |
| --- | --- | --- | --- |
| 切换长对话卡住 | 当前会话 764 条消息，limit=1 仍约 3.6 s | app-server-conversation-store.mjs:170-200 | 服务端先全量 thread/read，再切片 |
| 会话读取反复拖慢 | 当前 JSONL 文件约 84 MB；sessions 根目录 96 个文件、约 1.59 GB | conversation-service.mjs:37-52；jsonl-conversation-store.mjs:187-220 | primary 成功时仍并行 fallback，用于媒体补偿 |
| 发送后消息和状态互相抢顺序 | optimistic message、POST 成功、sessions_changed 都会更新 | useProjectConversations.ts:19-23、51-81 | 多次刷新和本地草稿/持久化消息交接没有单一提交点 |
| 页面显示运行中但实际已完成 | 历史 P0 记录，当前 tracker 仍可更新 updatedAt | DEVELOPMENT_COMMON_MISTAKES.md PROC-019；execution-tracker.mjs:297-386 | tracker 查询时间不能代替真实 protocol 事件和终止事件 |
| 重新打开仍显示旧处理中 | 既有 FEAT-001-I08、I15、I24 | useConversationEvents.ts:169-190；useCodexExecution.ts:60-81 | 恢复时 status、snapshot、session 读取没有统一 Turn 顺序 |
| 上一轮过程串入新消息 | FEAT-001-I17 active | useCodexExecution.ts:88-114；useProjectConversations.ts:72-81 | 缺少 runId/turnId/eventSeq 约束和旧 buffer 丢弃边界 |
| 最终答案短暂消失 | FEAT-001-I24 active | useCodexExecution.ts:45-57；useProjectConversations.ts:72-81 | 流式缓冲和最终持久化消息交接可能交错 |
| 项目进度页切换慢 | API 约 123-210 ms，但页面每次空状态起步 | ProjectProgressApp.tsx:13-26；sw.js:38-61 | 整页导航和缺少摘要快照，不是接口本身慢 |
| 项目管理页首屏等待 | API 约 41-108 ms，已有 sessionStorage 缓存 | ProjectManagementApp.tsx:12-46；projectManagementApi.ts:34-51 | 缓存命中、网络刷新和页面导航仍未统一为同一首屏策略 |
| 同一消息更新时间不一致 | list 与 detail 的 updatedAt 相差数天 | app-server-conversation-store.mjs:122-130、170-199 | thread/list 和 thread/read 元数据来源不一致 |
| JSON 返回体偏大 | 当前会话约 296 KB，另一个 29 消息会话约 1 MB | windows/server/http/request-utils.mjs:1-3 | JSON 无压缩，媒体和工具输出会放大响应 |
| JSONL 更新可能延迟 | watcher 错误被吞掉，备用 reconcile 每 60 秒 | jsonl-conversation-store.mjs:99-115 | Windows watcher 是否正常需要单独运行时证据 |

## 7. 已确认、推测和暂时跳过

### 已确认

- 长会话读取是当前最明确、可复现的延迟主因。
- limit 只减少响应体，不减少服务端完整 Thread 读取成本。
- primary 会话读取成功时仍会并行执行 JSONL fallback。
- SSE 当时可以快速建立连接并发送 connected/heartbeat/sessions_changed。
- execution-status 普通读取很快，reconcile 探针明显更慢。
- 列表和详情的更新时间字段确实不一致。
- 项目管理接口本身没有达到“后端很慢”的程度。

### 仍是边界判断

- app-server 内部具体为何在某些历史任务上长时间无响应。
- 手机浏览器后台节流是否是某次两分钟后停更的唯一原因。
- 固定公网线路、VPN 或 Tunnel 是否是本次当前实测的影响因素。
- JSONL fs.watch 在当前机器是否稳定工作。

这些内容没有被本次报告强行写成确定根因。

## 8. 建议修复顺序

### P0：先降低长会话读取成本

方向：

- 让服务端真正按窗口读取当前消息，而不是先构造完整 Thread 再切片。
- primary 成功时不要每次并行完整读取 JSONL；媒体补偿改为按需或增量索引。
- 保留现有 JSONL fallback，但不让它成为每次会话刷新必经路径。

用户会看到：

- 长对话切换和发送后的刷新不再随历史长度线性变慢。
- 只看最近消息时，不会因为旧的几百条消息和工具输出一起解析而等待数秒。

### P0：统一 Turn 生命周期和最终回复交接

方向：

- 每次 Run/Turn 建立单调的 runId、turnId、eventSeq。
- 终止事件和持久化快照优先于本地“正在运行”文案。
- 流式回答只追加；最终消息确认后一次性交接，不在 sessions_changed 中提前清空。
- 新 Turn 建立独立 buffer，拒绝旧 Turn 事件。

用户会看到：

- 回复完成后不会继续显示旧的处理中。
- 新消息不会短暂出现上一轮思考过程。
- 已出现的逐字回复不会在结束前突然消失。

### P1：合并重复刷新触发点

方向：

- 一轮 Turn 只安排必要的会话补拉。
- 发送确认、turn/started、item/completed 和 sessions_changed 需要去重，并区分“列表更新”和“当前会话内容更新”。

用户会看到：

- 发送后不会连续闪过多个同步状态。
- 手机端不会因为同一条消息重复加载会话而卡住。

### P1：统一列表和详情的时间元数据

方向：

- 明确更新时间的唯一来源，或在服务端合并 list/read 的最新时间。
- 不让详情返回旧 thread.updatedAt 覆盖已经读取到的新消息时间。

用户会看到：

- 消息内容、状态和更新时间保持一致。

### P2：改善页面切换首屏

方向：

- 项目进度页增加与项目管理页同等级的摘要快照。
- 保留 Service Worker 缓存优先，但把“旧内容立即显示、后台刷新、失败保留旧内容”作为统一导航策略。
- 这一步不需要重写成大型 SPA，也不需要引入数据库。

用户会看到：

- 从 Codex 切到项目进度时先看到上次摘要，不再整页空白等待。

## 9. 本轮不应做的事情

- 不继续增加高频轮询来掩盖事件顺序问题。
- 不先改基础 UI 样式。
- 不把 Desktop 当前页面热刷新当成 Web 会话读取问题。
- 不在活动 Turn 中切换 VPN、Tunnel 或重启 9360。
- 不引入数据库、通用任务系统或新的模型路由来解决当前读取瓶颈。
- 不把端口 200、SSE connected 或 tracker updatedAt 单独当成任务完成证据。

## 10. 报告结论

当前最值得先修的不是“再优化一次页面”，而是：

1. 长会话读取路径；
2. 重复刷新路径；
3. Run/Turn 事件顺序和最终消息交接。

这三项修复会同时改善卡顿、发送后等待、状态冲突和手机端“只能猜是否完成”的体验。项目管理页面的首屏缓存可以随后做，但它不是当前单人 Codex 卡顿的第一根因。
