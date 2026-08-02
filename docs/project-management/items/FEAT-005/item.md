---
id: FEAT-005
type: research
title: Desktop/Web 连续性与同任务提示
category: research
priority: P3
status: discovery
updated_at: 2026-07-28 22:20 +08:00
source: docs/feature-development/features/FEAT-005-desktop-web-continuity.md
related: [FEAT-001, FEAT-009]
---

# Desktop/Web 连续性与同任务提示

## 用户原话

历史功能文档未保存原始用户原话，待补录；不能根据文件内容倒推原话。

## 助手初步理解

该部分原始对话上下文未被独立保存，初步理解待补录。

## 简短摘要

让 Desktop 与 Web 使用同一任务时能够明确提示并避免互相干扰。

## 具体内容

使用场景：用户在电脑使用 Codex Desktop，离开后通过 Web 查看或继续同一个 Thread。

当前体验：持久化 Thread 可以共享，但实时事件和当前桌面页面不会同步；双端同时操作有失联风险。

交互变化：先提供同任务运行提示、查看优先和最小控制权，再评估交接。

## 预计效果

用户打开 Web 时能知道桌面端是否正在处理同一任务，避免重复发送或误以为任务没有运行。

## 关联条目

`FEAT-001`、`FEAT-009`

## 当前状态

调研中。

## 当前证据

- `docs/feature-development/features/FEAT-005-desktop-web-continuity.md`
