---
id: FEAT-018
type: feature
title: Codex 原生 Goal 目标模式入口
category: platform
priority: P1
status: implemented_pending_review
updated_at: 2026-08-14 21:42 +08:00
source: docs/feature-development/features/FEAT-018-system-goal-orchestration.md
related: [FEAT-001, FEAT-002, FEAT-005, FEAT-017]
owner: platform_runtime
product_base_commit: 081787798e211a5b2399d61e8a305261a7594b12
product_commit: pending
docs_commit: pending
audited_product_commit: pending
sync_status: local_uncommitted
next_action: 安全重启后从 Negus 能力菜单发起短 Goal，核对原生创建、过程和完成结果
last_user_visible_change: 能力菜单只保留一个 Goal 目标模式，发送后由 Codex 原生 Goal 接管，不再经过 Negus 自建状态流
---

# Codex 原生 Goal 目标模式入口

## 当前交付

- 单聊、群聊能力菜单保留一个“Goal 目标模式”。
- `/goal <目标>` 通过现有消息通道发送给 Codex。
- Negus 自建 Goal 后端、前端状态层和生命周期操作已删除。

## 待验收

- 服务安全重启后的真实短 Goal。
- 单聊和群聊中的原生过程、完成结果可见性。
