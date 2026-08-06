---
feature_id: FEAT-012
title: 消息内容快捷复制
status: implemented_pending_review
current_version: v0.1.0
last_updated: 2026-08-03 14:47 +08:00
owners: [web_ui, conversations]
key_paths:
  - web-ui/src/features/conversations/components/MessageActions.tsx
  - web-ui/src/features/conversations/components/ConversationView.tsx
  - web-ui/src/features/conversations/data/conversationApi.ts
---

# FEAT-012：消息内容快捷复制

## 当前快照

- 已在已保存消息下方提供复制按钮。
- 复制使用原始 Markdown/文本，不请求服务端、不改变会话记录。
- 优先使用 Clipboard API，浏览器不支持时使用临时文本框回退。

## 目标与边界

用户点击后可以快速复制当前消息，代码块、换行和 Markdown 标记保持原样。本轮不把渲染后的 DOM 当作复制来源，也不新增服务端存储或复制历史。

## 用户可见结果

电脑和手机都能在消息操作栏看到复制入口；成功后短暂显示已复制状态，失败时保留原消息并显示失败提示。

## 问题记录

| 编号 | 分类 | 状态 | 现象与处理 |
| --- | --- | --- | --- |
| `FEAT-012-I01` | 特例 | resolved | 原消息组件没有操作栏；新增独立 `MessageActions`，避免把复制逻辑混进内容渲染器。 |
| `FEAT-012-I02` | 特例 | mitigated | Clipboard API 受浏览器上下文限制；增加 `execCommand` 回退，仍需真实手机浏览器验收权限差异。 |

## 版本时间线

### 2026-08-03 14:47 +08:00 | v0.1.0 | implemented_uncommitted

- 计划：增加轻量的消息复制按钮。
- 实际：新增独立消息操作组件和 Clipboard 回退，不触碰 Codex 协议。
- 偏差：无。
- 问题：`FEAT-012-I01` resolved，`FEAT-012-I02` mitigated。
- 验证：定向 Node 测试 9/9；`pnpm build:ui` 通过；`git diff --check` 通过。
- 用户可见变化：消息下方可以一键复制原始内容。
- Git：`uncommitted`。

## 下一步

- 用户在手机和电脑浏览器实际点击一次，确认权限受限时的失败提示是否足够清楚。
