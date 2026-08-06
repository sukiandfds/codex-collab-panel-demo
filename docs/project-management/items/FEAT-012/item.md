---
id: FEAT-012
type: feature
title: 消息内容快捷复制
category: development
priority: P2
status: pending_review
updated_at: 2026-08-06
source: docs/feature-development/features/FEAT-012-conversation-copy.md
related: [FEAT-001]
---

# 消息内容快捷复制

## 用户原话

内容快捷复制按钮。

## 助手初步理解

在每条已保存消息附近增加一个轻量复制入口，让用户不用手动选中文本即可复制消息内容。

## 简短摘要

一键复制对话消息原始内容。

## 具体内容

使用场景：用户在手机或电脑查看 Codex 回复，需要把原始 Markdown、代码或文本转发到其他位置。

当前体验：已保存消息下方提供复制按钮；复制不改变对话，也不触发服务端请求。

## 预计效果

点击后立即复制原始内容，代码、换行和 Markdown 标记保持不变；失败时看到明确失败状态，不丢失消息。

## 关联条目

`FEAT-001`

## 当前状态

已实现并已进入提交历史，等待用户在手机和电脑浏览器实际点击确认。

## 当前证据

- `docs/feature-development/features/FEAT-012-conversation-copy.md`
- `web-ui/src/features/conversations/components/MessageActions.tsx`
