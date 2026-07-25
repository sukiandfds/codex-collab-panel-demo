---
feature_id: FEAT-001
title: 单人 Codex Web 对话与控制
status: implemented_pending_review
current_version: v0.4.0
last_updated: 2026-07-25 22:49 +08:00
owners: [conversations, execution, web_ui]
key_paths:
  - web-ui/src/features/conversations
  - web-ui/src/features/execution
  - windows/server/conversation-service.mjs
  - windows/server/app-server-conversation-store.mjs
  - windows/server/execution-tracker.mjs
---

# FEAT-001：单人 Codex Web 对话与控制

## 当前快照

- 用户可以在浏览器读取当前项目的真实 Codex/Happy 会话、选择对话、加载较早消息并发送指令。
- Web 发起的任务使用 Codex app-server；任务运行中可以追加引导并停止。
- 助手增量、中文状态和执行活动通过 SSE 到达页面，不使用固定频率轮询刷新整个会话目录。
- 手机页面使用窄屏布局；电脑和 iPad 保留侧栏与主对话布局。
- 当前状态为“已实现，等待用户持续体验确认”，不是完整替代 Codex Desktop。

## 用户可见结果

用户在手机或浏览器中可以看到真实对话、Codex 是否运行、当前活动和助手回复，并能继续发送内容。Web 追加到 Thread 的内容不保证立即出现在 Codex Desktop 当前已经打开的页面中。

## 目标与边界

目标：让用户离开电脑后仍能查看一个项目中的真实 Codex 对话并继续控制任务。

当前不解决：

- Codex Desktop 当前窗口对 Web 外部事件的热刷新；
- 多人正式权限和同时控制同一个 Turn 的仲裁；
- 修改 Codex JSONL 来伪造客户端同步；
- 完整复制 Codex Desktop 所有内部工具事件和审批 UI。

## 架构与数据链路

```text
Web UI
  -> /api/sessions, /api/session
  -> conversation-service
      -> app-server store (发送和实时执行主路径)
      -> JSONL store (历史读取与回退)

Codex app-server protocol
  -> execution-tracker
  -> realtime-hub
  -> /events SSE
  -> useConversationEvents / useCodexExecution
```

重要事实：Thread 的持久化记录、Web app-server 连接和 Codex Desktop 当前 UI 状态是三个层次，不能只因为 `threadId` 相同就视为同一实时客户端。

## 开发计划与关键决策

- 保留现有 Codex 风格 UI，内容、执行状态和附件分别放入功能目录。
- 历史读取采用分页、缓存和增量事件，避免每次刷新全量扫描。
- 发送优先走 app-server 协议，JSONL 只作为历史数据来源和受限回退，不直接改写。
- 用户运行中追加内容时使用 `turn/steer`，没有活动 Turn 时使用 `turn/start`。
- 当前连接状态以 SSE 为准，执行活动以服务端 tracker 为准，不把浏览器局部计时当成权威状态。

## 问题记录

| 问题编号 | 分类 | 状态 | 问题 | 根因与正确路径 |
| --- | --- | --- | --- | --- |
| `FEAT-001-I01` | 特例 | resolved | 对话标题曾显示正文而不是真实标题 | 解析层混淆标题来源；标题必须读取会话元数据，找不到时明确回退，不能拿正文冒充 |
| `FEAT-001-I02` | 特例 | mitigated | 长对话和会话列表加载慢 | 固定长度读 JSONL 首行、重复扫描和目录轮询；改为完整首行读取、分页、缓存和语义事件 |
| `FEAT-001-I03` | 特例 | active | Web 消息不在 Desktop 当前页面实时出现 | 独立客户端连接与 UI 状态不共享；转交 `FEAT-005`，不能在 React 层伪修复 |
| `FEAT-001-I04` | 特例 | resolved | 运行中不能输入、状态不一致、计时跨 Turn | 前端禁用输入且 tracker 没按 Turn 重置；已接入 steer、服务端状态和按 Turn 时间 |
| `FEAT-001-I05` | 普适 | active | 接入真实内容时曾误改 UI 和组件边界 | 见 `PROC-001`，后续内容/功能修改不得顺带重做 UI |

## 版本时间线

### 2026-07-21 | v0.1.0 | prototype

- 计划：先让浏览器展示单个项目中的真实对话。
- 实际：形成基础会话列表和内容展示 Demo。
- 偏差：标题和内容结构仍有误判，加载方式偏全量。
- 问题：`FEAT-001-I01`、`FEAT-001-I02`。
- 验证：原始记录见 `DEVELOPMENT_BUG_LOG_2026-07-21.md`。
- Git：历史提交见仓库日志。

### 2026-07-22 | v0.2.0 | implemented

- 计划：接入真实 JSONL 内容并优化加载性能。
- 实际：完成真实会话、结构化内容、分页和功能目录拆分。
- 偏差：发现数据接入过程中曾误动 UI，重新明确 UI/内容/功能边界。
- 问题：`FEAT-001-I01`、`FEAT-001-I02`、`PROC-001`。
- 验证：见 `DEVELOPMENT_LOG_2026-07-22.md`。
- Git：`8cf1e3e` 包含后续交互控制与同步边界记录。

### 2026-07-22 | v0.3.0 | implemented_pending_review

- 计划：让浏览器不仅能看，还能真实启动 Codex 工作。
- 实际：接入 app-server 发送、执行 tracker 和 SSE 状态。
- 偏差：Web 与 Desktop 当前窗口不是同一个运行实例，产生连续性问题。
- 问题：`FEAT-001-I03`、`FEAT-001-I04`。
- 验证：构建和基础接口通过；详细记录见 `DEVELOPMENT_LOG_2026-07-22.md`。
- Git：`8cf1e3e`。

### 2026-07-25 22:49 +08:00 | v0.4.0 | implemented_pending_review

- 计划：修复手机单人对话的发送、附件、状态、助手消息框和实时体验。
- 实际：完成运行中引导、停止、实时状态、附件入口、消息流和移动端体验修复。
- 偏差：Desktop/Web 连续性仍属于架构问题，没有在本轮伪装解决。
- 问题：`FEAT-001-I03` 保持 active；`FEAT-001-I04` resolved。
- 验证：`pnpm build:ui`、定向测试和真实服务接口通过。
- 用户可见变化：手机可继续控制任务并看到更明确的实时状态与助手回复。
- Git：`5a8ad71`。

## 下一步

- 由用户继续体验手机端实时性、引导和停止行为。
- 需要正式双端连续性时转入 `FEAT-005`，先做 Connector/控制权设计。
- 不在本功能中扩展正式多人权限或群聊队列。
