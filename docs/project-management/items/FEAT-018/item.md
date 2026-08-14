---
id: FEAT-018
type: feature
title: 系统级 Goal 持续目标与协调能力
category: platform
priority: P1
status: implemented_pending_review
updated_at: 2026-08-14 19:44 +08:00
source: docs/feature-development/features/FEAT-018-system-goal-orchestration.md
related: [FEAT-001, FEAT-002, FEAT-005, FEAT-017]
owner: platform_runtime
product_base_commit: 081787798e211a5b2399d61e8a305261a7594b12
product_commit: 964ad4e6297c369b9bf8e856c98bd5e67b13382e
docs_commit: c55ba8dcc5621288178959b7fb7af93c94acf67f
audited_product_commit: 964ad4e6297c369b9bf8e856c98bd5e67b13382e
sync_status: synced
next_action: 服务重启后验收真实 Goal 长任务、暂停继续、完成回写以及单聊和群聊命令反馈
last_user_visible_change: Goal 动作会精确作用于目标 Turn 并显示结果；暂停或等待后再清除、互转或超时不会因重复中断而卡住
---

# 系统级 Goal 持续目标与协调能力

## 用户要求

用户明确要求开发，并要求所有功能遵守：**“依然是要求，最小改动、最佳优化、最多共用、最好兼容、最多接口。”**

## 交付边界

Goal 是平台能力，不是当前项目的专用功能。当前仓库只是实现和验证落点；项目、群聊、Thread、Desktop/Web 和未来连接器通过上下文或适配器接入。

## 改动卡

- 现有能力复用：JSON 原子状态、服务端路由、员工运行时、Thread、SSE、AppShell、共享 HTTP 客户端。
- 新模块边界：`goal-store`、`goal-service`、`goal-runtime-adapter`、Goal routes、共享 Goal Provider 和控制条。
- 共用接口：Goal 创建/查询/编辑、生命周期动作、任务/运行记录、事件广播和运行适配器。
- 兼容影响：普通对话与群聊入口继续工作；只有 Goal API/控制条产生 Goal 记录。
- 回滚方式：移除 Goal 接线或停用模块，不删除 Goal 快照、事件和既有事实。
- 验收条件：后端聚焦测试、TypeScript 检查、UI 构建、`git diff --check`，再进行真实服务验收。
