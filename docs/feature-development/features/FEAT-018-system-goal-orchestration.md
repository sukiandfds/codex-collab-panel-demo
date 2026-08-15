---
feature_id: FEAT-018
title: Codex 原生 Goal 目标模式入口
status: implemented_pending_review
version: v0.2.0
updated_at: 2026-08-14 21:42 +08:00
product_base_commit: 081787798e211a5b2399d61e8a305261a7594b12
scope: platform
---

# FEAT-018 Codex 原生 Goal 目标模式入口

## 用户体验

- 单聊和群聊的能力菜单只保留一个“Goal 目标模式”入口。
- 选择后输入目标并发送，`/goal <目标>` 走现有 Codex Thread/消息通道，由 Codex 原生 Goal 创建、持续执行和结束。
- Negus 不再显示或维护第二套 Goal 创建结果、暂停、继续、清除、任务树或运行状态。

## 实现边界

- `web-ui/src/features/goals/model/capability.ts` 只定义能力菜单项。
- 单聊和群聊 Composer 不再拦截 Goal 命令，发送行为与普通 Codex 消息一致。
- Goal 生命周期、持久化、恢复和完成状态全部归 Codex 原生能力所有；Negus 不提供 `/api/goals` 或 `runtime/goals.json` 状态源。
- 已删除 Negus 自建的 Goal Store、Service、Runtime Adapter、Routes、Provider、API Client、类型和专项测试。

## 验证

- 桌面端历史运行证据已确认同一 Negus Thread 调用了原生 `create_goal`，并通过原生 `update_goal` 完成。
- Windows Node 回归测试：`146/146` 通过。
- `pnpm build:ui`、修改后 MJS 语法检查和 `git diff --check` 通过。
- 待运行验收：安全重启服务后，从 Negus 能力菜单发起一个短 Goal，确认原生创建、过程和完成结果在当前会话中可见。

## 回滚

移除能力菜单中的单个 Goal 项即可；不会影响 Codex 自己保存的原生 Goal 数据。
