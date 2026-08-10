# AI 助手工作规则

更新日期：2026-08-10

本文件只说明助手如何工作。

- 项目资料看根目录 PROJECT.md。
- 常犯错误看 docs/feature-development/DEVELOPMENT_COMMON_MISTAKES.md。
- 功能状态看 docs/feature-development/FEATURE_STATUS_INDEX.md。

## 1. 任务判断

- 先判断请求是讨论、研究、修改、Bug、复盘还是状态查询。
- 普通讨论和只读查询不建任务，不改文件。
- 修改、研究、测试或提交前，必须有任务编号、范围和产品基线 SHA。
- 功能使用 FEAT-编号，Bug 使用 BUG-编号，研究使用 RESEARCH-编号，项目管理使用 PM-编号。

## 2. 开始工作

先读取：

1. 本文件。
2. 根目录 PROJECT.md。
3. 相关功能文档和 FEATURE_STATUS_INDEX.md。
4. 与当前任务相关的 PROC-*。
5. 需要项目状态时，再读取 docs/project-management/items/<ITEM-ID>/。

开始修改前执行：

- git rev-parse --show-toplevel
- git branch --show-current
- git rev-parse HEAD
- git status --short

有未提交改动时先保护。不覆盖、不重置、不强制切换。

## 3. 修改边界

- 只做当前任务的最小改动。
- 不顺手扩展功能、移动文件或重构未确认归属。
- UI、内容、数据、功能和协议分开维护。
- 未经明确许可，不修改基础 UI 样式。
- 所有展示内容必须来自真实项目数据。
- 不擅自启动、重启服务或执行远程危险操作。
- 运行项目时只使用 PROJECT.md 标明的入口，不自行使用旧入口。
- 远程检查默认只读。可能触发浏览器、Node、监听、Firewall 或 UAC 时，先确认无桌面交互。
- 不输出 Token、密钥或敏感配置。
- 删除分支、worktree 或重要文件前，先确认内容已保存且可恢复。

## 4. 开发记录

- 功能变更更新对应 FEAT-*.md。
- 功能状态或版本变化时更新 FEATURE_STATUS_INDEX.md。
- 项目当前状态更新对应 item.md，过程更新 updates.md。
- 研究写入 docs/research/。
- 架构说明写入 docs/architecture/。
- 新开发日志、验证记录和事故复盘写入 docs/records/。
- 新的跨功能问题登记 DEVELOPMENT_COMMON_MISTAKES.md。
- 同一问题只保留一个完整正文来源。

## 5. 检查和交付

按改动范围选择检查：

- mjs：node --check 文件名。
- 相关测试：node --test 测试文件。
- 前端：pnpm build:ui。
- 提交前：git diff --check。

必须说明未运行的检查。测试、构建或 HTTP 200 不等于用户体验已验收。

交付必须说明：

- 修改文件和用户可见变化；
- 已运行和未运行的检查；
- 未验证风险；
- 当前分支、完整 SHA 和工作区状态；
- 项目管理同步状态；
- 提交和下一步。

缺少关键验证或记录时，状态只能是 handoff_pending。

## 6. 停止条件

出现以下任一情况，停止扩大操作并汇报：

- 第二种独立根因；
- 第二次提权或重装；
- 第三轮验证；
- 用户要求停止；
- 无法证明操作不会造成桌面确认或数据风险。
