---
document_type: project_management_project
project_id: negus
title: negus
status: active
last_updated: 2026-08-05 09:20:00 +08:00
---

# negus

## 项目目标

让用户在一个可维护的协作面板中查看和控制真实 Codex 对话、项目工作、Agent 交付物和后续协作过程。

## 当前阶段

当前重点是单项目、少量真人成员和 Agent 的项目管理记录。项目管理页首先解决“现在有哪些工作、每项处于什么状态、最近发生了什么变化”，暂不扩展为完整 Jira 替代品。

## 资料边界

```text
docs/project-management/       当前项目管理面板的数据源
docs/feature-development/      既有功能开发档案和历史资料
web-ui/src/features/project-management/  当前项目管理前端功能
windows/server/project-management-store.mjs  项目管理数据读取器
```

项目管理条目可以引用既有功能文档作为证据，但不修改或混入既有功能文档的维护结构。

## 记录分层

```text
PROJECT_OPERATING_RULES.md                          通用开发、命名、交接和面板同步规则
PROJECT_RULES.md                                    本项目专属分支、安全和资料边界
AI_ASSISTANT_READ_FIRST.md                          AI 项目入口、当前阶段和硬性维护规则
docs/feature-development/PROCESS_ISSUES.md         跨功能通用错误、正确路径和防再犯规则（PROC-*）
docs/feature-development/features/FEAT-*.md        功能目标、架构、问题和版本时间线（FEAT-*）
docs/architecture/                                   技术架构职责、依赖边界和架构审计
docs/research/                                       日期化技术研究和证据记录
项目战略与多角色评审/                                 产品、竞品、Orca 和外部评估历史资料
docs/records/                                        新的开发日志、验证记录和事故复盘
docs/project-management/items/<ITEM-ID>/item.md   条目当前摘要、用户原话和预计效果
docs/project-management/items/<ITEM-ID>/updates.md 条目状态与版本更新
docs/project-management/items/<ITEM-ID>/process.md 条目专属弯路、阻塞、决策和效率复盘
```

同一问题只能有一个“完整正文”来源。项目条目记录可以描述本条目的影响，但跨功能规则以 `PROC-*` 为准；项目入口只放规则摘要和链接，不复制事故细节。

## 行业参考

- Jira：以工作项、状态流转、优先级、关联关系和历史记录组织工作。
- Linear：以项目、里程碑、工作项和带时间的 Project Updates 组织进度快照。
- OpenProject：以项目层级、Work Package、状态、责任和可追踪记录组织工作。

完整调研记录见 [`docs/feature-development/PROJECT_PROGRESS_MANAGEMENT_RESEARCH_2026-08-02.md`](../feature-development/PROJECT_PROGRESS_MANAGEMENT_RESEARCH_2026-08-02.md)。
