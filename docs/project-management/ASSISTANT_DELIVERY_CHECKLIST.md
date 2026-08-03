---
document_type: project_management_delivery_checklist
schema_version: 1
project_id: codex-collab-panel-demo
status: active
last_updated: 2026-08-03
---

# AI 助手交付与项目管理联动清单

本清单是 AI 助手执行研究、修改、测试、提交和交接时的强制流程。未完成对应项目管理回写，不得把任务描述为已完成。

## 1. 开始前：建立任务身份

必须先执行并记录：

~~~text
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
~~~

然后：

1. 读取 AI_ASSISTANT_READ_FIRST.md、PROJECT_RULES.md、docs/project-management/README.md 和 WORKFLOW_RULES.md。
2. 读取 docs/feature-development/FEATURE_INDEX.md，定位相关 FEAT-*、BUG-* 或 RESEARCH-*。
3. 读取对应 items/<ITEM-ID>/item.md；需要历史时再读取 updates.md 和 process.md。
4. 没有现成条目时，先创建条目并记录用户原话、范围、产品基线 SHA，再开始修改。
5. 在开始回复中说明：任务编号、产品基线、是否修改源码、是否运行服务、预计交付文件。

## 2. 研究任务

研究任务必须同时维护三处：

- 正文：docs/research/<TOPIC>_RESEARCH_YYYY-MM-DD.md
- 当前快照：docs/project-management/items/<RESEARCH-ID>/item.md
- 里程碑：docs/project-management/items/<RESEARCH-ID>/updates.md

研究正文必须包含：

- document_type、research_id、title、date、product_branch、product_commit、status
- 调研范围和实际来源
- 已确认事实
- 推测内容
- 未知问题
- 测试或检查范围
- 不修改生产代码时必须明确写出

研究提交后必须：

1. 在 item.md 写入完整 docs_commit。
2. 将 sync_status 改为 synced。
3. 在 updates.md 追加本次研究和提交 SHA。
4. 在 docs/project-management/INDEX.md 登记条目。
5. 研究正文、条目和索引必须在同一产品分支提交链上。

## 3. 代码修改任务

代码任务开始前必须绑定 FEAT-* 或 BUG-* 条目，并读取对应功能档案。

修改过程中：

- 只改任务范围内的代码、测试和必要文档。
- 不把 UI、数据解析、协议适配和无关功能混在同一补丁中。
- 不因顺手整理而移动或重命名未确认归属的文件。
- 任何生产代码变化都必须同步对应功能文档的当前快照、问题状态或版本时间线。
- 项目管理 item.md 的 product_base_commit、next_action 和 last_user_visible_change 必须保持可追踪。

提交前必须执行与改动匹配的检查，至少包括：

~~~text
node --check <changed-mjs>
node --test <related-test-files>
pnpm build:ui
git diff --check
~~~

未运行的检查必须明确列出，不能写成已验证。

## 4. 提交与项目管理回写

提交前确认：

- git diff 和 git diff --cached 只包含本次任务范围。
- 没有用户已有未提交改动被覆盖。
- 提交信息能说明唯一目的。
- 相关 item.md、功能档案和 updates.md 已同步。

提交后必须执行：

~~~text
git rev-parse HEAD
git show --stat --oneline HEAD
git status --short
~~~

然后回写：

- product_commit：完整产品提交 SHA
- docs_commit：完整文档提交 SHA
- audited_product_commit：若尚未审计则保留 pending
- sync_status：synced、audit_pending 或 behind
- next_action：下一步真实动作
- last_user_visible_change：用户实际可见变化

只更新聊天内容、不回写项目管理文件，不算完成。

## 5. 审计任务

审计必须基于准确的 product_commit 创建独立 worktree，不能基于聊天中出现的短 SHA 或旧分支。

审计正文使用：

~~~text
docs/research/<TOPIC>_AUDIT_YYYY-MM-DD.md
~~~

必须记录：

- 代码基线完整 SHA
- 审计提交完整 SHA
- 已确认事实
- 推测和未知
- 测试与检查结果
- 审计结论：passed、findings 或 blocked

产品分支产生新提交后，旧审计不再自动适用，必须重新确认基线。

## 6. 固定交接格式

每次提交、研究或审计交付都必须回传：

~~~text
实际仓库路径：
当前分支：
基线完整 SHA：
当前 HEAD 完整 SHA：
git status --short：
任务编号：
完成内容：
修改文件：
用户可见变化：
已运行：
未运行：
项目管理同步：
提交：
下一步：
~~~

缺少完整 SHA、工作区状态或项目管理同步状态时，交付状态为 handoff_pending，不得写成 completed。

## 7. 不得跳过的边界

- 不在独立长期文档分支工作。
- 不把日期日志当作项目管理当前状态。
- 不把短 SHA 当作交付凭证。
- 不把测试通过推断为用户体验已验收。
- 不擅自启动、重启服务或执行可能触发 UAC、Firewall 或桌面确认的操作。
- 不把未确认的推测写成已确认事实。
