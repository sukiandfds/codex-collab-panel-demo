---
document_type: project_workflow_rules
schema_version: 1
project_id: codex-collab-panel-demo
status: active
last_updated: 2026-08-03 11:46 +08:00
---

# 开发、文档与审计协同规则

## 目标

把一次有用户影响的开发变更固定成一条可复查链路：

```text
任务条目 -> 产品提交 -> 文档同步 -> 同一提交审计 -> 合入 main
```

所有状态必须绑定可验证的完整 commit SHA。聊天中的“已完成”或无法在 Git 中找到的短 SHA 不算交付。

每次研究、修改、测试、提交和交接必须执行 [`ASSISTANT_DELIVERY_CHECKLIST.md`](./ASSISTANT_DELIVERY_CHECKLIST.md)。本清单是执行层规则；本文件负责状态、分支和审计边界，清单负责逐项交付核对。

## 长期分支职责

| 分支 | 唯一职责 |
| --- | --- |
| `codex/publish-current-panel` | 产品代码、项目条目、开发日志、研究资料和审计报告 |
| `main` | 已完成闭环、可发布的稳定版本 |

临时审计分支或 worktree 必须从指定产品提交创建，不能成为长期代码来源。

## 条目当前字段

每个 `item.md` 至少维护：

```yaml
status: planned
owner: <负责人>
product_base_commit: <开始时的产品完整 SHA>
product_commit: <功能完成后的产品完整 SHA 或 pending>
docs_commit: <文档提交完整 SHA 或 pending>
audited_product_commit: <审计对应的产品完整 SHA 或 pending>
sync_status: synced | behind | docs_pending | audit_pending
next_action: <下一步动作>
last_user_visible_change: <用户实际看到的变化>
```

`item.md` 保存当前快照；`updates.md` 只追加里程碑；`process.md` 只记录该条目的弯路、阻塞、决策和效率复盘；研究和审计正文按根目录命名规则放在 `docs/research/`，开发和事故记录放在 `docs/records/`。

## 状态流转

```text
planned
  -> in_progress
  -> code_ready
  -> docs_synced
  -> audit_pending
  -> completed
```

异常状态：

- `docs_pending`：产品代码已提交，文档尚未同步。
- `audit_findings`：审计发现问题，不能合入 `main`。
- `handoff_pending`：对方声称完成，但 SHA 或工作区尚未验证。
- `paused`：用户主动暂缓，不继续修改。
- `blocked`：存在明确外部阻塞。
- `behind`：产品已有新提交，文档或审计仍对应旧 SHA。

## 标准流程

### 1. 建立任务

先创建或定位 `FEAT-*`、`BUG-*` 或 `RESEARCH-*` 条目，记录用户原话、预计体验、范围、负责人和产品基线 SHA，状态设为 `in_progress`。

如果没有任务编号、产品基线 SHA 或明确范围，不进入代码修改、研究正文或提交阶段；先将条目补齐，或把状态保持为 `handoff_pending`。

### 2. 产品开发

在 `codex/publish-current-panel` 上完成最小变更。需要并行分析时，临时 worktree 必须基于准确的产品 SHA；最终代码必须回到产品分支。

产品提交必须尽量保持单一目的，并记录：

- 完整产品 commit SHA；
- 修改文件和需求编号；
- 用户可见变化；
- 已运行与未运行的检查；
- 已知风险和下一步。

提交后状态为 `code_ready`，并把 `product_commit` 写入条目。

### 3. 文档同步

在 `codex/publish-current-panel` 的 `docs/` 目录追加或更新文档。代码和文档属于同一提交链，不建立独立文档分支。每次同步必须写明：

```text
本记录对应产品提交：<完整 SHA>
```

文档提交和产品提交属于同一开发分支；以文档中的 `product_commit` 为绑定依据。文档提交完成后填写 `docs_commit`，状态改为 `docs_synced`。

### 4. 独立审计

审计人员从产品提交 `product_commit` 创建独立 worktree。审计报告写入当前开发分支的 `docs/research/`，并使用 `_AUDIT_YYYY-MM-DD.md` 命名。审计报告必须记录：

```text
代码基线：<产品完整 SHA>
审计提交：<文档完整 SHA>
审计结论：passed | findings | blocked
```

如果产品分支产生新提交，旧审计自动失效，必须重新审计新 SHA。

### 5. 合入 main

只有同时满足以下条件才能合入：

- 产品代码检查和测试已通过；
- 文档记录引用正确的产品完整 SHA；
- 审计针对同一个产品 SHA；
- 没有未处理的 `audit_findings` 或 `blocked`；
- 当前开发分支已经推送；
- 工作区没有未说明的改动。

合入后把 `main_commit` 和最终用户影响追加到 `updates.md`，状态改为 `completed`。

### 6. 清理临时环境

只有在提交已保存或推送、审计正文已回写、worktree 干净且没有未交付改动后，才能删除临时分支和 worktree。发现未提交文件时不得直接删除。

## 交接凭证

任何 Agent 或协作者交付时必须提供：

```text
实际仓库路径：
当前分支：
基线完整 SHA：
当前 HEAD 完整 SHA：
git status --short：
修改文件：
测试与检查结果：
```

负责人必须能在本地或远程执行 `git show <完整 SHA>`。无法验证的交接标记为 `handoff_pending`，不能写成已完成。

## 轻量例外

- 纯文档、研究或日志变更：不需要产品代码提交和生产审计，但仍需文档提交和来源记录。
- P0 应急修复：可以先提交最小产品修复，再在同一产品 SHA 上补齐文档和审计；不能省略闭环。
- UI、内容和功能属于不同维护边界；没有用户明确许可，不因流程同步顺手修改基础 UI。

## 项目进度页面规则

项目进度页面只读取 `item.md` 的当前状态和 `updates.md` 的里程碑，不根据分支名推断完成情况。开发开始时可以先记录 `in_progress` 和 `product_base_commit`；代码提交后再补正式 `product_commit`。
