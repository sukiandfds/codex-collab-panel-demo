---
document_type: migration_record
title: 文档分支内容迁移记录
date: 2026-08-03
product_commit: d382a469d9670743f82142b3b0408f2b9f0471b4
source_branch: codex/project-docs-and-audits
source_commit: 12155fca55aea45436656713c065a21c5cdef8ca
target_branch: codex/publish-current-panel
target_commit: f1ad197
status: completed
---

# 文档分支内容迁移记录

## 1. 迁移范围

本次迁移只处理文档、审计、研究和资料归档，不迁移文档分支上的生产代码、测试代码、UI、构建配置或删除性改动。

来源：`codex/project-docs-and-audits`，提交 `12155fca55aea45436656713c065a21c5cdef8ca`。

目标：`codex/publish-current-panel`，迁移开始前提交 `d382a469d9670743f82142b3b0408f2b9f0471b4`。

## 2. 已迁移内容

### 架构与审计

- `docs/architecture/README.md`
- `docs/architecture/domains/`
- `docs/architecture/exceptions/cross-domain-files.md`
- `docs/architecture/audits/REALTIME_CONVERSATION_ARCHITECTURE_AUDIT_2026-08-03.md`
- `docs/architecture/audits/CODEX_NATIVE_READ_AND_REGRESSION_REVIEW_2026-08-03.md`

这些内容归入 `docs/architecture/`，用于记录文件职责、调用边界、实时事件链路和 Codex 原生读取能力。架构索引中的过时分支说明已按当前开发分支修正。

### 功能与项目管理

- `docs/feature-development/features/FEAT-010-orca-group-runtime-adapter.md`
- `docs/feature-development/FEATURE_INDEX.md` 中的 FEAT-010 索引行
- `docs/project-management/PRODUCT_BASELINE.md`

FEAT-010 保留为已暂停的历史技术试验，不把它描述为路线 2 已完成。产品基线记录改为当前开发分支的基线，并保留来源文档分支与来源 SHA。

### 战略与外部评估资料

- Orca 完整底座审计报告迁入 `项目战略与多角色评审/12-...`
- 一人三 AI 组织架构讨论迁入 `项目战略与多角色评审/13-...`
- 产品 AI 标准回答原文迁入 `项目战略与多角色评审/14-...`
- 外部机构评估说明从根目录归档到 `项目战略与多角色评审/15-...`
- `00-调研文档索引与推荐阅读顺序.md` 已补充 12—15 的定位和使用方式

## 3. 未迁移内容及原因

1. 文档分支对 `AI_ASSISTANT_READ_FIRST.md` 的旧版本：当前开发分支版本更新，已包含实际仓库路径、交付清单和当前流程，不能覆盖。
2. 文档分支对 `docs/project-management/INDEX.md`、`README.md`、`WORKFLOW_RULES.md` 的旧版本：当前开发分支已经包含 RESEARCH-001、RESEARCH-002 和单分支流程，保留较新版本。
3. 文档分支上的 `.github`、`package.json`、`pnpm-lock.yaml`、`web-ui/`、`windows/` 代码和删除性改动：属于旧代码线或产品实现，不属于本次文档迁移范围。
4. `资料库/` 中的图片和资料索引在当前开发分支已经存在，无重复迁移。
5. 与当前开发分支内容相同的根目录日志和已有战略资料不重复复制。

## 4. 文件归属变化

| 内容 | 原位置 | 目标位置 | 处理 |
| --- | --- | --- | --- |
| 架构职责与审计 | 文档分支新增内容 | `docs/architecture/` | 新增 |
| Orca Runtime 技术试验 | 文档分支功能记录 | `docs/feature-development/features/` | 新增并登记 FEAT-010 |
| 产品基线 | 文档分支项目管理记录 | `docs/project-management/PRODUCT_BASELINE.md` | 新增并更新当前基线 |
| 外部评估说明 | 根目录 | `项目战略与多角色评审/15-...` | 归档并更新索引 |

## 5. 验证记录

- 已核对来源分支完整 SHA：`12155fca55aea45436656713c065a21c5cdef8ca`。
- 已核对目标分支迁移前完整 SHA：`d382a469d9670743f82142b3b0408f2b9f0471b4`。
- 已确认迁移清单不包含生产代码、UI、测试和构建配置。
- 已运行：`git diff --check`、工作区状态核对、提交后文件清单核对。
- 迁移提交：`f1ad197`。

## 6. 后续清理

迁移提交推送并完成内容复核后，删除本地和远程 `codex/project-docs-and-audits`。删除前不得再从该分支读取文档作为当前规则来源。本记录完成后，来源分支仅作为 Git 历史对象保留，不再作为工作入口。
