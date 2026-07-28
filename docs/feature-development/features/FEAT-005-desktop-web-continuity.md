---
feature_id: FEAT-005
title: Desktop/Web 连续性与统一控制权
status: discovery
current_version: v0.3.0
last_updated: 2026-07-27 20:36 +08:00
owners: [connector, task_state, cross_device_continuity]
key_paths:
  - windows/server/app-server-client.mjs
  - windows/server/app-server-conversation-store.mjs
  - windows/server/execution-tracker.mjs
  - windows/server/realtime-hub.mjs
  - DEVELOPMENT_BUG_LOG_2026-07-24_DESKTOP_WEB_SYNC.md
---

# FEAT-005：Desktop/Web 连续性与统一控制权

## 当前快照

- 手机或浏览器可以通过独立 Codex app-server 向真实持久化 Thread 发送消息并接收回复。
- Codex Desktop 已打开的同一任务页面不会热刷新 Web 侧新增的消息。
- “引用同一个 Thread”只表示持久化任务可能相同，不表示 Desktop 与 Web 共享同一个运行实例、事件订阅或实时 UI 状态。
- Desktop 完全关闭后重新打开任务，能否在当前 Codex 版本中稳定恢复全部 Web 新消息，仍待真实验证。
- 当前没有统一 Connector、控制权租约、跨端事件序号和断线恢复协议。
- 本机 Codex `0.146.0-alpha.3.1` 已包含 app-server daemon、proxy 和 remote-control 协议入口，但 daemon 生命周期实测仅支持 Unix，当前 Windows 不能直接用它让 Desktop 与 Web 共享同一个受管理实例。

## 用户可见结果

当前用户可以在手机/Web 中独立继续真实 Codex 工作，但回到已经打开的 Desktop 页面时，不应期待它自动出现 Web 的最新消息。问题解决前，同一 Thread 同一时间只使用一个发送入口；切换设备前等待当前 Turn 完成并核对最新上下文。

## 目标与边界

目标：让用户在 Desktop、电脑浏览器和手机之间切换时，可以承接同一任务的最新指令、执行状态和必要上下文，同时避免两个客户端并发控制造成消息顺序或审批状态冲突。

当前 discovery 阶段不承诺：

- 修改 Codex Desktop 内部实现或强制刷新其 DOM；
- Desktop 与 Web 逐字复制所有群聊和内部日志；
- 在没有协议依据时直接修改 Codex JSONL；
- 默认允许多个客户端同时向同一 Thread 发起 Turn；
- 已经实现断线重连、事件补偿和正式控制权交接。

## 已验证架构

```text
Mobile / Web
  -> local Node service :9360
  -> independent Codex app-server
  -> persisted Thread

Codex Desktop
  -> Desktop-managed runtime and subscriptions
  -> same persisted Thread may be referenced

Shared persisted Thread != shared live app-server != shared UI state
```

Web SSE 只分发 Web 所连接 app-server 的 Notification；已经打开的 Desktop 页面没有被证实会订阅这条外部事件流，也没有被证实会监视 Thread 文件变化并自动重载。

## 开发计划与关键决策

### 阶段 A：验证恢复边界

一次用户实测已确认：完全关闭 Desktop、通过 Web 继续对话后，再启动 Desktop 可以读到这些持久化内容。后续只需在正式投入双端连续性开发前补测多轮和异常中断，不再把冷启动能力视为未知。

### 阶段 B：轻量控制权与交接

在统一连接前，为每个 Thread 约束单一发送入口；记录当前控制端、Turn 状态和简短交接摘要。交接只包含目标、最新决定、执行结果、待确认事项和下一步。

### 阶段 C：统一 Connector

由一个稳定 Connector 负责 Thread 恢复、Turn 发送/中断、Notification 分发、控制权、事件序号和重连恢复。Desktop、Web 与手机订阅同一个任务事件源，而不是各自启动互不感知的实时实例。

当前 Windows 版本不能把官方 daemon 当作已经可用的实现。可先让电脑浏览器、手机和 PWA 统一连接现有 Connector；原生 Desktop 若要实时同步，仍需要官方 Windows 共享实例能力，或经过单独验证的 Desktop 集成入口。

### 阶段 D：群聊到 Agent Thread 的上下文映射

完整群聊留在协作层；项目经理只把已确认的必要任务包写入对应 Agent Thread，再把执行结果和状态返回项目群，避免上下文污染和 Token 浪费。

## 问题记录

| 问题编号 | 分类 | 状态 | 问题 | 根因与正确路径 |
| --- | --- | --- | --- | --- |
| `FEAT-005-I01` | 特例 | active | Web 新消息不在已打开的 Desktop 任务页实时出现 | 两端实时运行实例和 Notification 通道分离；先验证冷启动恢复，再设计统一 Connector |
| `FEAT-005-I02` | 特例 | active | Desktop 与 Web 并发写同一 Thread 时，Turn 顺序和控制归属不明确 | 当前缺少单一控制权、事件序号和恢复协议；正式并发前必须先建立这些约束 |
| `FEAT-005-I03` | 普适 | active | 曾把相同 Thread、相似页面或同一 SSE 概念误当成统一运行状态 | 关联 `PROC-011`；先确认事件生产者、连接实例、状态所有权和恢复机制 |
| `FEAT-005-I04` | 特例 | active | 新版 Codex daemon 暂时不能直接解决 Windows 双端同步 | 本机命令返回 daemon 生命周期仅支持 Unix；保留协议适配层，不能把存在命令误写成 Windows 已可用 |
| `FEAT-005-I05` | 特例 | resolved | Desktop 冷启动后能否承接 Web 已持久化的对话内容此前没有实测结论 | 用户已实测：完全关闭并重新打开 Codex Desktop 后，可以看到 Web 端发送的对话；这只证明冷启动读取持久化 Thread，不代表已打开页面会热刷新 |

## 禁止的伪修复

- 不直接编辑 Codex append-only JSONL 来伪造同步。
- 不复制全部消息制造两端“看起来一致”。
- 不默认创建平行 Thread 掩盖连续性问题。
- 不依赖未经验证的 Desktop DOM 注入或强制刷新。
- 不在缺少控制权机制时允许 Web 与 Desktop 长期并发发送。

## 版本时间线

### 2026-07-24 23:58 +08:00 | v0.1.0 | discovery

- 计划：排查手机/Web 消息为什么没有出现在 Codex Desktop 当前页面，并明确后续修复方向。
- 实际：确认 Web 使用独立 app-server；记录持久化 Thread、实时运行实例和客户端 UI 三者的差异。
- 偏差：本轮只完成问题边界和技术路径，没有实现同步修复。
- 问题：`FEAT-005-I01` active；`FEAT-005-I02` active；关联 `PROC-011`。
- 验证：手机/Web 可以继续真实 Thread，Desktop 已打开页面不热刷新；Desktop 冷启动恢复仍待验证。
- 用户可见变化：无代码变化；形成明确临时使用约束，避免把当前 Demo 误认为无缝多端同步。
- Git：文档源记录见 `DEVELOPMENT_BUG_LOG_2026-07-24_DESKTOP_WEB_SYNC.md`，本功能档案为 `uncommitted`。

### 2026-07-27 00:43 +08:00 | v0.2.0 | discovery

- 计划：重新核对新版 Codex 是否已经提供可复用的统一运行实例。
- 实际：确认 runtime 包含 daemon、proxy 和 remote-control 协议，但 Windows daemon 生命周期当前不可用。
- 结论：内容连续性可以通过单一控制端和交接解决；原生 Desktop 已打开页面的实时热刷新仍不能由当前 Web Demo 保证。
- 推荐：先验证 Desktop 冷启动恢复，再实现轻量接管/释放；需要完全实时一致时，电脑和手机优先共用 Web/PWA Connector。
- 验证：本机 `codex app-server daemon version` 返回 `codex app-server daemon lifecycle is only supported on Unix platforms`。
- 用户可见变化：本轮只更新技术判断和开发边界，没有修改页面或同步行为。

### 2026-07-27 20:36 +08:00 | v0.3.0 | discovery

- 用户实测：关闭 Codex Desktop 后重新打开，可以看到此前通过 Web 发送的对话内容。
- 结论：冷启动承接已验证可用；已打开的 Desktop 页面仍不会因 Web 外部事件自动热刷新，`FEAT-005-I01` 保持 active。
- 影响：短期可以用“离开电脑时使用 Web，回到电脑后重开对应任务”的方式承接，不把它描述成实时双端同步。

## 下一步

- 冷启动恢复已得到一次用户实测结论；后续再验证多轮和异常中断场景，不扩大本轮开发。
- 需要继续做双端连续性时，先提供轻量“接管/释放/重新打开任务”交接流程。
- 若后续多轮或异常中断暴露冷启动恢复不可靠，电脑与手机先统一使用 Web/PWA；原生 Desktop 实时同步等待可验证的 Windows 集成入口。
- 统一 Connector 继续明确事件 ID、控制权、重连和补偿，但不把 Unix-only daemon 写成 Windows 现成方案。
