---
feature_id: FEAT-018
title: 系统级 Goal 持续目标与协调能力
status: implemented_pending_review
version: v0.1.1
updated_at: 2026-08-14 19:44 +08:00
product_base_commit: 081787798e211a5b2399d61e8a305261a7594b12
scope: platform
---

# FEAT-018 系统级 Goal 持续目标与协调能力

## 本次范围

- Goal 属于平台核心能力，不绑定项目、群聊、Room、Thread、Desktop 或 Web 入口；这些对象只作为可选上下文。
- 新增 `goal_id → task_id → run_id` 的持久关系、版本、状态、任务树和事件记录。
- 复用现有消息、员工 Thread、执行运行时和 `/events` SSE；新增 Goal API 作为稳定接入面。
- 单人对话和群聊共用 Goal Provider，并从既有“能力菜单”调用 `/goal`、`/goal pause`、`/goal resume`、`/goal clear`；不新增常驻会话横幅。
- Goal 启动时通过运行适配器交给负责人；负责人可继续使用现有员工运行时和子 Agent 能力。
- 初版采用事件驱动状态更新，不加入周期性状态检查器；服务保持运行时 Goal 继续执行，暂停、清除、完成、失败或超时才停止。

## 模块与接口

| 模块 | 复用点 | 新增职责 |
| --- | --- | --- |
| `goal-store.mjs` | 现有 JSON 持久化和原子写入模式 | Goal、Task、Run、Event 的版本化快照和幂等读取 |
| `goal-service.mjs` | 现有服务层状态/事件模式 | 生命周期、超时计时器、任务树、运行适配器调用 |
| `goal-runtime-adapter.mjs` | 员工运行时、Thread、SSE | 运行时启动、暂停、继续和停止的通用边界 |
| `goal-routes.mjs` | 现有 `request-handler → routes → services` | `/api/goals` 查询、创建、编辑、动作和任务/运行接口 |
| `features/goals` | 现有 `fetchJson/postJson`、`/events` 和对话/群聊的能力菜单 | 跨单聊/群聊的 Goal 状态和可调用命令能力 |

## 兼容与回滚

- 普通群聊、旧任务、现有 Thread、Artifact、审批和执行接口继续使用原链路。
- Goal 核心不读取 `projectRoot` 或 `roomId` 作为业务边界；上下文只存引用。
- 停用 Goal 路由或前端入口不会删除已写入的 Goal 事实和事件；旧 API 与静态资源继续可用。
- 当前服务认证沿用既有访问令牌门禁；运行适配器继续继承现有员工运行时的权限策略，不新增全局工具权限。

## 验收

- `goal-store.test.mjs`：持久化、部分更新、版本冲突、任务/运行关联。
- `goal-service.test.mjs`：创建幂等、启动、暂停、继续、清除、停止和无轮询超时。
- `goal-routes.test.mjs`：鉴权、创建、查询、编辑和动作路由。
- `web-ui` TypeScript 检查、生产 UI 构建和 Windows 全量 Node 回归测试通过。

## 当前限制

- 初版没有周期性状态扫描器；状态依赖服务事件、SSE 和服务端超时计时器。
- Goal 的跨上下文 ACL 继续复用现有访问令牌和员工运行时策略；细粒度多用户 ACL 不在本次最小增量中。

## v0.1.1 审查修复

- Goal 暂停、继续、等待、完成和清除改为运行时操作成功后再持久化状态；失败时保留原状态并记录失败事件。
- Goal 保存并核对精确 `turnId`，不会再中断同一员工正在执行的其他任务；对应 Turn 完成、失败或中断后自动回写 Goal、Task 和 Run。
- Task/Run 更新接口禁止直接修改父子、归属和反向关系字段；Goal 容量满时不再淘汰运行中记录，失效幂等映射可恢复。
- 单聊和群聊中的 Goal 动作仅在目标唯一、刚创建后仍被明确选中，或命令携带 Goal ID 时执行；成功、失败和版本冲突会在输入区显示。
- 已暂停或等待的 Goal 在清除、状态互转和超时时不再重复中断同一 Turn，终态操作可以正常完成。
- 清除误提交的 Playwright YAML 与截图并加入忽略规则。
- 产品修复提交：`d755cad12e79d2ee11af1b28233dec82ad316297`；最终边界修复提交：`964ad4e6297c369b9bf8e856c98bd5e67b13382e`。
- 已验证：Windows Node 测试 `160/160`、`pnpm build:ui`、相关 MJS 语法检查和 `git diff --check` 均通过。
- 未验证：未重启当前服务，未进行真实 Goal 长任务、浏览器或移动端体验验收。
