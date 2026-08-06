---
feature_id: FEAT-013
title: 从当前消息分叉继续
status: implemented_pending_review
current_version: v0.1.0
last_updated: 2026-08-03 14:47 +08:00
owners: [app_server, conversations, web_ui]
key_paths:
  - windows/server/app-server-conversation-store.mjs
  - windows/server/routes/conversation-routes.mjs
  - web-ui/src/features/conversations/hooks/useProjectConversations.ts
  - web-ui/src/features/conversations/components/MessageActions.tsx
---

# FEAT-013：从当前消息分叉继续

## 当前快照

- 服务端使用 Codex 官方 `thread/fork`，以消息所属 `turnId` 为分叉边界。
- 前端只在已完成的助手消息上显示分叉入口；执行中的 Thread 禁用该操作。
- 分叉成功后自动切换到新 Thread，原对话保持不变。

## 目标与边界

这是“从这里继续”的新分支，不是继续原 Thread 的普通发送。分叉只包含指定 Turn（官方语义为 inclusive），本轮不增加分支树可视化、批量合并或跨项目分叉。

## 用户可见结果

用户在某条已完成助手回复下点击分叉按钮后，会进入一个可继续发送的新对话；原对话不会被追加新内容。分叉失败时显示真实错误，不伪造成功。

## 问题记录

| 编号 | 分类 | 状态 | 现象与处理 |
| --- | --- | --- | --- |
| `FEAT-013-I01` | 特例 | resolved | `SessionMessage` 原先没有 Turn 来源，无法准确调用 `thread/fork`；服务端映射并携带 `turnId`。 |
| `FEAT-013-I02` | 特例 | deferred | 当前本机 Codex app-server 是否支持 `thread/fork` 尚未做真实运行时探测；不支持时由请求错误直接反馈。 |

## 版本时间线

### 2026-08-03 14:47 +08:00 | v0.1.0 | implemented_uncommitted

- 计划：复刻 Codex 从当前消息继续的分叉行为。
- 实际：新增 `POST /api/session/fork`、Turn 来源映射、前端分叉操作和自动切换。
- 偏差：未加入能力探测和分支关系视图，留在后续范围。
- 问题：`FEAT-013-I01` resolved，`FEAT-013-I02` deferred。
- 验证：定向 Node 测试 9/9；`pnpm build:ui` 通过；`git diff --check` 通过。
- 用户可见变化：从已完成回复分叉后获得独立可继续的对话，原对话不受影响。
- Git：`uncommitted`。

## 下一步

- 用当前安装的 Codex app-server 做一次能力探测；若不支持，保留明确不可用状态，不留下半可用按钮。
