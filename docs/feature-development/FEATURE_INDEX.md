---
document_type: feature_index
schema_version: 1
last_updated: 2026-07-27 00:43 +08:00
---

# 功能开发索引

AI 助手应先根据任务定位功能编号，再读取对应文件。不要默认读取所有功能历史。

## 当前功能

| 功能编号 | 功能 | 当前状态 | 当前版本 | 最近更新 | 当前结论 | 记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `FEAT-001` | 单人 Codex Web 对话与控制 | `implemented_pending_review` | `v0.5.0` | 2026-07-27 00:18 +08:00 | 已支持真实会话、发送、引导、停止、模型与上下文占用、手动/自动压缩；Desktop 当前页面不会热同步 Web 外部事件 | [`FEAT-001-single-codex-web.md`](./features/FEAT-001-single-codex-web.md) |
| `FEAT-002` | 项目群聊与多 Agent 讨论 | `implemented_pending_review` | `v0.3.0` | 2026-07-25 22:49 +08:00 | 已有真实群消息、成员、四个 Agent、共享上下文和有限轮次讨论；队列恢复和正式权限未完成 | [`FEAT-002-group-multi-agent.md`](./features/FEAT-002-group-multi-agent.md) |
| `FEAT-003` | 附件与对话内容渲染 | `implemented_pending_review` | `v0.3.0` | 2026-07-25 22:49 +08:00 | 支持上传、图片/音频/视频/文件展示和 Markdown 本地图片登记；仍是 Demo 级上传协议 | [`FEAT-003-attachments-content-rendering.md`](./features/FEAT-003-attachments-content-rendering.md) |
| `FEAT-004` | PWA、设备身份与移动/平板入口 | `implemented_pending_review` | `v0.1.0` | 2026-07-26 00:22 +08:00 | 已完成主屏幕应用配置、设备名/在线状态、iPad 布局和单人/群聊切换；公网 HTTPS 尚未配置 | [`FEAT-004-pwa-device-identity.md`](./features/FEAT-004-pwa-device-identity.md) |
| `FEAT-005` | Desktop/Web 连续性与统一控制权 | `discovery` | `v0.2.0` | 2026-07-27 00:43 +08:00 | Windows 暂不能复用官方 daemon；先验证冷启动恢复和轻量交接，不能把同一 Thread 等同于同一客户端 UI | [`FEAT-005-desktop-web-continuity.md`](./features/FEAT-005-desktop-web-continuity.md) |

## 当前优先阅读的普适问题

开发前至少检查 [`PROCESS_ISSUES.md`](./PROCESS_ISSUES.md) 中这些条目：

- `PROC-001`：没有先确认架构和功能所有权就修改。
- `PROC-002`：Windows 端口与进程检查使用了不适配本机的方法。
- `PROC-003`：SSE 页面使用错误的加载完成条件。
- `PROC-004`：服务端改动后误以为启动脚本会自动重启。
- `PROC-005`：浏览器和视觉检查超过任务需要，或验证工具自身造成误判。
- `PROC-006`：扫描、补丁和命令范围过大，局部失败放大成整轮阻塞。
- `PROC-007`：工具被策略拦截后重复尝试同类命令。

## 历史原始日志映射

| 原始日志 | 主要关联功能 |
| --- | --- |
| `DEVELOPMENT_LOG_2026-07-22.md` | `FEAT-001`、`FEAT-003`、`FEAT-005` |
| `DEVELOPMENT_LOG_2026-07-24.md` | `FEAT-002`、`FEAT-005` |
| `DEVELOPMENT_LOG_2026-07-25.md` | `FEAT-001`、`FEAT-002`、`FEAT-003` |
| `DEVELOPMENT_LOG_2026-07-26.md` | `FEAT-004`、AI 功能开发记录体系 |
| `DEVELOPMENT_BUG_LOG_2026-07-24_DESKTOP_WEB_SYNC.md` | `FEAT-005` |
| `DEVELOPMENT_BUG_LOG_2026-07-25.md` | `FEAT-001`、`FEAT-003`、`FEAT-005` |
| `DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md` | `PROCESS_ISSUES.md` |

## 状态含义

| 状态 | 含义 |
| --- | --- |
| `discovery` | 正在理解问题和技术路径，尚未承诺实现 |
| `planned` | 目标和边界已确认，尚未开始编码 |
| `in_progress` | 正在开发 |
| `implemented_uncommitted` | 已实现并完成基本检查，但尚未提交 |
| `implemented_pending_review` | 已实现，等待用户体验或验收结论 |
| `accepted` | 用户已确认当前结果可接受 |
| `paused` | 主动暂缓，当前不投入开发 |
| `blocked` | 存在明确外部阻塞，无法继续 |
| `retired` | 已被其他功能或方案替代 |
