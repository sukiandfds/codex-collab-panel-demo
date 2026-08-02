---
id: FEAT-011
type: feature
title: 浮生云算用量监控
category: development
priority: P2
status: pending_review
updated_at: 2026-08-03 00:22 +08:00
source: docs/feature-development/features/FEAT-011-fusheng-usage-monitor.md
related: [FEAT-001]
---

# 浮生云算用量监控

## 用户原话

需要更新日期时间、分组倍率、今日用量，然后可以点击查看详情。就在我们的标题栏多加一个显示的组件。页面打开不查询，回复完成查询；固定显示 `gpt 易燃易爆炸`，点击详情查看其他分组和详细信息。

## 助手初步理解

在单人 Codex 标题栏增加一个低干扰用量组件，不进行后台轮询；每轮真实回复完成后更新，标题栏突出固定 GPT 分组，点击后查看账户和全部分组数据。

## 简短摘要

在 Codex 标题栏查看浮生云算今日消耗、倍率和更新时间。

## 具体内容

使用场景：用户在网页版 Codex 连续开发时，不离开当前对话即可判断当日用量。

当前体验：代码和构建已完成，后端服务尚未重启；页面打开不查询，完成后的真实触发待体验。

交互变化：桌面显示固定 GPT 倍率、今日金额和更新时间；手机显示今日金额；点击查看请求数、Token、余额、历史用量和全部分组倍率。

## 预计效果

每轮回复完成约 2 秒后标题栏更新一次，同一 Turn 的多设备请求被合并。查询失败保留旧数据，不影响对话发送和回复。

## 关联条目

`FEAT-001`

## 当前状态

已实现，等待服务重启和用户体验。

## 当前证据

- `docs/feature-development/features/FEAT-011-fusheng-usage-monitor.md`
- `web-ui/src/features/usage-monitor/`
- `windows/server/fusheng-usage-service.mjs`
- `windows/tests/fusheng-usage-service.test.mjs`
