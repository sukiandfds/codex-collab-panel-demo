---
id: FEAT-001
type: feature
title: 单人 Codex Web 对话与控制
category: development
priority: P1
status: pending_review
updated_at: 2026-08-10
source: docs/feature-development/features/FEAT-001-single-codex-web.md
related: [FEAT-005]
---

# 单人 Codex Web 对话与控制

## 用户原话

2026-08-04 P0 回归的用户原文已逐字保存在 [`process.md` 的 `FEAT-001-P05`](./process.md#2026-08-04--feat-001-p05--regression--p0--active)，并关联用户提供的手机截图。不得用助手概括替换该原文。

## 助手初步理解

该部分原始对话上下文未被独立保存，初步理解待补录。

## 简短摘要

解决 Web 端读取、发送和持续显示真实 Codex 对话的问题。

## 具体内容

使用场景：用户离开电脑后，通过手机或浏览器继续查看和控制一个项目中的 Codex 对话。

当前体验：已有真实会话、发送、停止和过程展示；跨设备终态和流式交接仍需真实长任务验证。会话切换定位修复已完成源码修改，尚未运行态验收。

交互变化：保留事件重连、权威状态、会话补拉和当前模型/上下文设置；切换会话返回时优先恢复到之前看到的消息锚点。

## 预计效果

用户可以在手机或浏览器中看到真实对话、执行过程和最终回复；断线或后台恢复后可以补齐内容，不需要反复关闭页面。

## 关联条目

`FEAT-005`

## 当前状态

当前产品提交 `ddf43a6c406d010357dce7ebdc133b97de66b5b9` 已包含消息身份幂等、恢复与最终回复交接、加载完成前隐藏旧快照、历史消息加载位置保持等修复。本轮又在未提交工作区中补充了会话切换锚点恢复，当前状态是代码已完成、等待最新构建的真实体验确认；不能把已完成的源码修复描述成尚未开发。

## 当前证据

- `docs/feature-development/features/FEAT-001-single-codex-web.md`
- `docs/feature-development/FEATURE_INDEX.md`
- 远程分支 `codex/remote-work-web-reliability` 提交 `deaa5c5999d96c0e3a01cd53669a315ba663823b`
- `docs/architecture/audits/REALTIME_CONVERSATION_ARCHITECTURE_AUDIT_2026-08-03.md`
- `docs/architecture/audits/CODEX_NATIVE_READ_AND_REGRESSION_REVIEW_2026-08-03.md`
- `docs/project-management/items/FEAT-001/process.md#2026-08-04--feat-001-p05--regression--p0--active`
- `runtime/uploads/61c5a17451b53379c463a09f0e7845646c989efd0333fe762b9b661fde337782__Screenshot_2026-08-04-09-12-11-142_com.microsoft.emmx.jpg`
- `web-ui/src/features/conversations/hooks/useConversationSession.ts`
- `windows/server/routes/conversation-routes.mjs`
