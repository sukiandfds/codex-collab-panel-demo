# 06 持久化、安全与运行数据

## 运行数据分布

| 数据 | 当前路径/来源 | 主要写入方 | 审查结果 |
| --- | --- | --- | --- |
| Codex 会话 | app-server，失败时读取 JSONL | `app-server-conversation-store`、`jsonl-conversation-store` | 主数据源和 fallback 已区分 |
| 执行状态 | `runtime/execution-runs.json` | `execution-tracker` | 有快照，但运行时事件仍在内存流转 |
| 群聊房间 | `runtime/group-room.json`、`runtime/group-rooms/*.json` | `group-room-store` | 消息持久化，活动任务不作为完整任务账本持久化 |
| 员工绑定 | `runtime/employee-projects.json`、`project-identities.json` | 注册表和项目身份 store | 有同步机制，但定义与快照会产生多个显示来源 |
| 员工会话 | `runtime/employee-conversations.json`、`runtime/employee-conversations/*.jsonl` | `agent-conversation-store` | append-only 历史，群聊投影另走房间读取 |
| 上下文设置 | `runtime/context-settings.json` | `context-management-service` | 独立存储，适合继续保持 |
| 上传和预览 | `runtime/uploads`、`media-previews` | `media-service` | 有恢复逻辑和路径解析 |
| Artifact/图片 | `runtime/artifacts.json`、`agent-artifacts`、`generated-images` | Artifact 和图片服务 | 有允许根目录，仍需统一生命周期策略 |
| 队列/提交/版本 | 多个 `runtime/*.json` | 各自 store/service | 每个 store 都重复实现加载、临时文件和 rename |

## 持久化实现重复

| 重复模式 | 当前出现位置 | 风险 | 建议 |
| --- | --- | --- | --- |
| 读取 JSON，失败返回空值 | 多个 `*-store.mjs` | 损坏数据和首次启动无法区分 | 统一记录恢复原因，保留安全 fallback |
| 临时文件写入再 rename | execution、context、artifact、project、employee 等 store | 各自处理失败、并发和关闭时机 | 提取通用 `atomic-json-store`，只提供可靠写入，不承载业务模型 |
| 内存 Map + 写队列 | 多个 store 和 service | 服务关闭时需要逐个等待，生命周期容易遗漏 | 统一 `close/flush` 契约，组合根按领域关闭 |
| 运行时快照限制 | 单人 localStorage、群聊 snapshot、员工群聊投影 | 不同入口显示不同历史完整度 | 由 `HistoryPage` 明确限制和游标，不让调用方猜 slice 语义 |

## 当前安全边界

| 边界 | 当前实现 | 评价 |
| --- | --- | --- |
| API 和 SSE 鉴权 | `request-handler` 对 `/api/*` 和 `/events` 统一要求 token | 基础保护存在，应继续保持所有新接口自动继承 |
| Codex 项目根 | `app-server-conversation-store` 使用允许的项目根列表 | 符合多项目要求，不能绕过到任意 cwd |
| Artifact 文件根 | Artifact 服务配置 `allowedRoot` | 方向正确，读取和预览都应继续经过该边界 |
| 媒体文件 | `media-service` 解析已登记媒体并限制路径 | 不应允许前端直接提交任意本地路径 |
| 员工主对话权限 | 员工确认后才允许 workspace-write/on-request | 符合“先只读讨论，确认后修改”的系统规则 |
| 员工上下文 | `contextRoot` 与 `projectRoot` 分离 | 符合员工内置目录和目标项目分离原则 |

## 仍需补齐的可靠性问题

| 问题 | 影响 | 级别 |
| --- | --- | --- |
| 群聊讨论 `workQueue/currentRun` 未持久化 | 重启后无法恢复未完成讨论、交接和等待状态 | P1 |
| 房间活动状态和最终消息分开到不同事件 | 重连时可能出现 pending 消息、activeWork 和最终消息短暂不一致 | P1 |
| 大型 JSONL/JSON 文件没有统一保留和压缩策略 | 员工会话和版本文件长期增长，恢复和列表读取成本增加 | P2 |
| 多个服务各自处理 close/flush | 新增服务容易漏关连接或漏等写队列 | P2 |
| 运行时 secrets、上传、日志与审查文档边界依赖 `.gitignore` | 误提交风险依赖开发者记忆 | P2 |

本部分不建议立即清空 `runtime/`。现有 `docs/TIDY_UP_PLAN_2026-08-10.md` 已将运行数据列为不可随意删除项，本审查沿用该边界。
