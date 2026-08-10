---
document_type: project_management_schema
schema_version: 1
last_updated: 2026-08-02 18:00 +08:00
---

# 项目管理条目格式

## `item.md` frontmatter

```yaml
id: FEAT-001
type: feature
title: 单人 Codex Web 对话与控制
category: development
priority: P1
status: pending_review
updated_at: 2026-08-02 11:39 +08:00
source: ../feature-development/features/FEAT-001-single-codex-web.md
related: [FEAT-005]
```

## `item.md` 内容顺序

```markdown
## 用户原话
## 助手初步理解
## 简短摘要
## 具体内容
## 预计效果
## 关联条目
## 当前状态
## 当前证据
```

“具体内容”和“预计效果”都按用户体验描述：使用场景、当前/目标体验、用户操作变化和完成判定。助手初步理解只解释用户字面意思，不分析相关文件。

## `updates.md` 记录格式

```markdown
### 2026-08-02 15:30 +08:00
- 状态：in_progress
- 本次更新：完成独立数据目录和页面入口设计。
- 用户影响：用户可以从项目面板查看摘要，不会被完整日志淹没。
- 证据：docs/project-management/INDEX.md
```

更新记录只追加，不覆盖以前的记录。

## `process.md` 记录格式

`process.md` 不是每日开发日志，也不是 `updates.md` 的重复版本。只有该条目独有的弯路、阻塞、决策或效率问题才写入；如果经验可以跨功能复用，必须在 `docs/feature-development/DEVELOPMENT_COMMON_MISTAKES.md` 建立 `PROC-*`，本文件只回链。

推荐 frontmatter：

```yaml
document_type: project_management_process
schema_version: 1
item_id: PM-001
last_updated: 2026-08-02 18:00 +08:00
```

每条记录使用以下字段：

| 字段 | 取值/要求 |
| --- | --- |
| `process_id` | `<ITEM-ID>-Pxx`，例如 `PM-001-P01` |
| `type` | `detour`、`blocker`、`decision`、`efficiency` 或 `validation` |
| `severity` | `P0`、`P1`、`P2` 或 `P3`；资源和用户信任损失按 P0 记录 |
| `status` | `active`、`mitigated`、`resolved` 或 `deferred` |
| `user_visible_symptom` | 从用户角度看到的具体现象 |
| `wrong_path` | 实际走过的错误或低效路径 |
| `impact` | 时间、交互、数据或维护成本 |
| `correct_path` | 已确认的较短处理路径或当前决策 |
| `prevention_trigger` | 下次遇到什么信号时先做什么检查 |
| `evidence` | 功能文档、通用问题编号、日志或提交；未知事实标为“待验证” |

详细模板见 [`PROCESS_TEMPLATE.md`](./PROCESS_TEMPLATE.md)。
