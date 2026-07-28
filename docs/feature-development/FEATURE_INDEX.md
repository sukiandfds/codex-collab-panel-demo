---
document_type: feature_index
schema_version: 1
last_updated: 2026-07-28 01:02 +08:00
---

# 功能开发索引

AI 助手应先根据任务定位功能编号，再读取对应文件。不要默认读取所有功能历史。

## 当前功能

| 功能编号 | 功能 | 当前状态 | 当前版本 | 最近更新 | 当前结论 | 记录 |
| --- | --- | --- | --- | --- | --- | --- |
| `FEAT-001` | 单人 Codex Web 对话与控制 | `implemented_uncommitted` | `v0.8.1` | 2026-07-28 01:02 +08:00 | 手机会话快照和后台同步已通过定向功能检查；公开分析摘要与可读命令通过测试，等待用户实际体验；桌面任务状态与防卡死机制仍待开发 | [`FEAT-001-single-codex-web.md`](./features/FEAT-001-single-codex-web.md) |
| `FEAT-002` | 项目群聊与多 Agent 讨论 | `implemented_pending_review` | `v0.3.0` | 2026-07-25 22:49 +08:00 | 已有真实群消息、成员、四个 Agent、共享上下文和有限轮次讨论；队列恢复和正式权限未完成 | [`FEAT-002-group-multi-agent.md`](./features/FEAT-002-group-multi-agent.md) |
| `FEAT-003` | 附件与对话内容渲染 | `implemented_pending_review` | `v0.3.0` | 2026-07-25 22:49 +08:00 | 支持上传、图片/音频/视频/文件展示和 Markdown 本地图片登记；仍是 Demo 级上传协议 | [`FEAT-003-attachments-content-rendering.md`](./features/FEAT-003-attachments-content-rendering.md) |
| `FEAT-004` | PWA、设备身份与移动/平板入口 | `implemented_pending_review` | `v0.1.0` | 2026-07-26 00:22 +08:00 | 已完成主屏幕应用配置、设备名/在线状态、iPad 布局和单人/群聊切换；公网 HTTPS 尚未配置 | [`FEAT-004-pwa-device-identity.md`](./features/FEAT-004-pwa-device-identity.md) |
| `FEAT-005` | Desktop/Web 连续性与统一控制权 | `discovery` | `v0.3.0` | 2026-07-27 20:36 +08:00 | 用户已验证 Desktop 冷启动可读取 Web 对话；已打开页面仍不热刷新，统一 Connector 和控制权继续保持后续方向 | [`FEAT-005-desktop-web-continuity.md`](./features/FEAT-005-desktop-web-continuity.md) |
| `FEAT-006` | 固定公网入口与正式访问控制 | `in_progress` | `v0.2.1` | 2026-07-27 23:16 +08:00 | 最小 Quick Tunnel 入口已恢复并与 Named Tunnel 配置隔离；固定域名、Access 和开机恢复按用户要求延期研究 | [`FEAT-006-stable-remote-access.md`](./features/FEAT-006-stable-remote-access.md) |
| `FEAT-007` | Agent 交付物生成、预览与版本管理 | `implemented_uncommitted` | `v0.2.1` | 2026-07-27 22:23 +08:00 | M1 已实现交付物发布、预览、版本和审核；功能问题与防再犯记录已整理，等待用户体验 | [`FEAT-007-agent-artifacts.md`](./features/FEAT-007-agent-artifacts.md) |
| `FEAT-008` | HTML 网页生成与 PDF 双文件交付 | `implemented_uncommitted` | `v0.2.0` | 2026-07-27 23:47 +08:00 | 已完成静态 HTML、Edge 转 PDF、安全网页打开和群聊双文件发布；基本检查通过，等待用户体验 | [`FEAT-008-html-page-pdf-generation.md`](./features/FEAT-008-html-page-pdf-generation.md) |

## 当前待办开发顺序

以下顺序按当前沟通记录整理；未到对应阶段时不提前扩展：

| 顺序 | 功能项目 | 当前要做什么 | 前置条件或边界 |
| --- | --- | --- | --- |
| `P1` | `FEAT-001` 单人 Codex 基础体验收尾 | 用户实际体验会话快照、后台同步、公开分析摘要、命令显示、新对话、模型切换和发送失败恢复；只修真实出现的问题 | 不修改基础 UI，不顺带处理 Desktop 同步、群聊或公网入口 |
| `P2` | `FEAT-001-I12` 防卡死与受控恢复 | 识别端口/SSE 存活但核心接口无响应的半失效状态，并提供受限恢复 | 先确定业务健康检查、异常阈值、重启频率限制和状态记录；当前只有需求记录，没有确定技术方案 |
| `P3` | `FEAT-003` 真实附件与内容链路 | 使用真实图片、音视频和文件会话确认上传、识别、展示、下载和失败恢复 | 先验证现有链路，只针对真实失败修复；不升级为通用文件平台 |
| `P4` | `FEAT-005` Desktop/Web 连续性 | 研究并实现统一任务状态、控制权和 Connector，使 Desktop 与 Web 不再各自维护互不感知的运行状态 | 不能在 React 层伪造同步；依赖明确的事件生产者、运行实例和恢复协议 |
| `P5` | `FEAT-002` / `FEAT-007` 群聊、多 Agent 与交付物后续 | 在单人基础稳定后，再处理讨论队列恢复、交互体验和 M2 以后能力 | 不提前扩展 Agent 数量、企业权限、工具市场或通用任务系统 |
| `deferred` | `FEAT-006` 固定公网入口 | 后续再研究固定域名、正式鉴权和开机恢复 | 当前开发阶段不修改公网入口；避免再次扩大为基础设施长任务 |
| `low` | `FEAT-001-I11` 浏览器审批与补充提问 | 个人可信环境需要时再设计 | 当前允许必要时回到电脑确认；不能扩展为公网或多人默认放行 |

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
