---
feature_id: FEAT-002
title: 项目群聊与多 Agent 讨论
status: implemented_pending_review
current_version: v0.3.0
last_updated: 2026-07-25 22:49 +08:00
owners: [group_chat, multi_agent]
key_paths:
  - web-ui/src/features/group-chat
  - windows/server/group-room-store.mjs
  - windows/server/multi-agent-service.mjs
---

# FEAT-002：项目群聊与多 Agent 讨论

## 当前快照

- 项目群有真实成员、持久化群消息和四个真实 Codex Agent：项目经理、研究、开发、审查。
- 用户可以在讨论/开发模式中发送消息、选择或 `@` 一个或多个 Agent。
- Agent 收到必要群聊上下文后按有限轮次回复，并能在回复中邀请其他 Agent 继续讨论。
- 页面显示 Agent 当前阶段、增量回复、在线成员和附件。
- 当前不是无限自主 Agent 社会，也没有正式账号、权限、持久化任务队列和冲突仲裁。

## 用户可见结果

用户与朋友可以进入项目群，在群里看到真人和多个 Agent 的消息；点名 Agent 后会得到真实 Codex 回复，Agent 之间可以进行有限轮次讨论。用户可以随时继续发言，但当前还没有正式的队列管理、审批和多人控制权提示。

## 目标与边界

目标：验证“用户旁观并介入多个 Agent 讨论和工作”的核心体验，而不是只展示静态聊天原型。

当前不解决：

- 无限自动讨论或无限 Token 使用；
- 多项目、多租户、企业权限与正式成员账号；
- 服务重启后的任务队列恢复；
- 把群聊状态强行合并进单人 Turn 状态；
- 保证群聊完整上下文出现在 Codex Desktop 当前页面。

## 架构与数据链路

```text
GroupApp / useGroupRoom
  -> /api/group/*
  -> group-room-store (房间、成员、消息)
  -> multi-agent-service (目标 Agent、上下文、有限轮次)
  -> Codex app-server threads
  -> realtime-hub /events
  -> Agent 状态、增量文本、群消息
```

单人页的 `threadId/turnId` 状态和群聊的房间/Agent 队列属于不同功能域。目前只共享稳定的附件、实时连接和导航 UI。

## 开发计划与关键决策

- 先完成一个真实项目群，不扩展多个群和组织管理。
- 默认由项目经理 Agent 接收未点名消息；明确 `@` 时按目标 Agent 调度。
- 上下文只包含完成当前讨论所需的群消息和角色责任，限制轮次避免 Token 无边界增长。
- Agent 完整工作日志和跨会话总结属于后续能力，本轮只保留群消息和状态。
- 真实任务与测试分开，自动验证不向群历史发送污染消息。

## 问题记录

| 问题编号 | 分类 | 状态 | 问题 | 根因与正确路径 |
| --- | --- | --- | --- | --- |
| `FEAT-002-I01` | 特例 | resolved | 早期页面只是静态原型，用户发言后没有真实回复 | 没有连接 Agent 调度；后续接入真实 app-server 和 multi-agent service |
| `FEAT-002-I02` | 特例 | resolved | 商讨模式无人回复 | 发送模式和默认 Agent 调度不完整；未点名时现在回退到项目经理 |
| `FEAT-002-I03` | 特例 | mitigated | `@` 菜单可能与中文输入法组合态冲突 | 键盘行为必须检查 `isComposing`，仍需真实手机输入体验确认 |
| `FEAT-002-I04` | 特例 | active | 服务重启会丢失未完成讨论队列 | 当前队列在内存；正式版需要持久化 Job/Run 状态 |
| `FEAT-002-I05` | 普适 | active | 单人页和群聊看似相近但状态模型不同 | 见 `PROC-011`，只共享稳定组件，不强行共享运行对象 |

## 版本时间线

### 2026-07-24 00:44 +08:00 | v0.1.0 | implemented_pending_review

- 计划：快速做出可真实使用的项目群和多 Agent 雏形。
- 实际：完成独立群聊页、成员、群消息、四个 Agent、讨论/开发模式和 `@` 提及。
- 偏差：首版调度仍不完整，出现“没人回复”。
- 问题：`FEAT-002-I01`、`FEAT-002-I02`、`FEAT-002-I03`。
- 验证：构建和接口通过；见 `DEVELOPMENT_LOG_2026-07-24.md`。
- Git：`74bfa88`。

### 2026-07-25 00:55 +08:00 | v0.2.0 | implemented_pending_review

- 计划：让多个 Agent 真正共享必要上下文并进行有限轮次讨论。
- 实际：支持同时点名多个 Agent、按顺序执行、上下文提示和 Agent 邀请其他 Agent。
- 偏差：仍保留单内存队列，没有扩展正式组织系统。
- 问题：`FEAT-002-I04`。
- 验证：multi-agent 定向测试和 `pnpm build:ui` 通过。
- Git：`f26e22b`。

### 2026-07-25 22:49 +08:00 | v0.3.0 | implemented_pending_review

- 计划：补足群聊附件、消息反馈、过程动画、移动端和实时体验。
- 实际：增加附件、增量展示、新消息提示、日期分隔、移动端 `@` 菜单和更明确的 Agent 状态。
- 偏差：正式排队、取消、重试和权限仍未进入本轮。
- 问题：`FEAT-002-I03` mitigated；`FEAT-002-I04` active。
- 验证：`pnpm build:ui` 和定向测试通过。
- Git：`5a8ad71`。

## 下一步

- 优先根据真实使用体验决定消息排队、取消、失败重试和冲突反馈。
- 再决定是否需要持久化 Agent Run，而不是先增加 Agent 数量。
- 继续保持单项目范围，避免提前扩展企业组织结构。
