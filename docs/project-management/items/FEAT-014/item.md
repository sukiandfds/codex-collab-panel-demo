---
id: FEAT-014
type: feature
title: 项目对话归档与恢复
category: development
priority: P2
status: implemented_uncommitted
updated_at: 2026-08-03 14:47 +08:00
source: docs/feature-development/features/FEAT-014-conversation-archive.md
related: [FEAT-001]
---

# 项目对话归档与恢复

## 用户原话

和 Codex 一样的项目对话归档功能。

## 助手初步理解

用户需要把暂时不用的项目对话从活动列表移开，但保留内容，并能在需要时恢复继续使用。

## 简短摘要

活动与已归档项目对话分开管理，可恢复。

## 具体内容

使用场景：项目会话变多后，用户希望保留历史但只在活动列表看到当前工作。

当前体验：侧栏提供活动/归档视图；归档和恢复调用服务端操作。归档会话加载后只读，避免误发送。

## 预计效果

归档后活动列表立即移除该会话，内容不会删除；进入归档视图可恢复，恢复后回到活动数据源。失败时保留现状并显示真实错误。

## 关联条目

`FEAT-001`

## 当前状态

已实现但未提交；旧版 Codex 运行时兼容性和手机体验待确认。

## 当前证据

- `docs/feature-development/features/FEAT-014-conversation-archive.md`
- `windows/server/jsonl-conversation-store.mjs`
- `web-ui/src/features/conversations/hooks/useConversationCatalog.ts`
