# 本项目规则

本文件只记录 `negus` 的项目专属约束；本地仓库目录和 `origin` 远程仓库统一使用 `negus`，通用的开发、命名和项目管理同步规则见 [`PROJECT_OPERATING_RULES.md`](./PROJECT_OPERATING_RULES.md)。

## 1. 分支

- `main`：稳定版本，只接收已验证的改动。
- `codex/publish-current-panel`：当前开发分支，代码和项目文档在同一提交链上。
- 临时审计或实验使用临时 worktree，交付后删除，不保留长期文档分支。

## 2. 本项目的资料入口

| 内容 | 入口 |
| --- | --- |
| AI 交接和当前项目阶段 | `AI_ASSISTANT_READ_FIRST.md` |
| 功能状态和需求记录 | `docs/feature-development/` |
| 项目管理面板数据 | `docs/project-management/` |
| 技术架构目录和架构审计 | `docs/architecture/` |
| 日期化研究和证据记录 | `docs/research/` |
| 产品、竞品和战略历史资料 | `项目战略与多角色评审/` |
| 图片、截图和外部资料归档 | `资料库/` |

功能状态以功能记录和项目管理条目为准；架构目录、研究资料和战略历史资料不自动改变功能状态。

## 3. 本项目的记录边界

- 新需求、功能变更和状态更新进入 `docs/feature-development/` 及对应项目管理条目。
- 技术架构只描述真实文件职责、调用关系、依赖方向和审计事实，不写开发进度。
- 产品、竞品和 Orca 等调研结果保留在研究资料目录，不直接当作已确认开发任务。
- 新的开发日志、验证记录和事故复盘放入 `docs/records/`；历史根目录日志保留，不强行移动。
- `docs/project-management/` 是项目管理面板的数据源，不复制功能正文。

## 4. 安全与范围

- 不擅自启动、重启服务或执行远程危险操作。
- 不在无关任务中顺手修改 UI、群聊、UAC 或公网入口。
- 不覆盖用户已有未提交改动。
- 删除分支、worktree 或重要文件前，先确认内容已迁移并可恢复。

### 4.1 GitHub 分支同步

- 开始拉取前先运行 `git status --short --branch`，确认工作区状态；不得用 `reset`、强制切换或覆盖操作隐藏用户改动。
- 远程分支同步使用 `git fetch origin <branch>`；已有本地分支切换后用 `git merge --ff-only origin/<branch>`，没有本地分支则用 `git switch --track origin/<branch>`。
- 同步后核对 `git rev-parse HEAD`、`git rev-parse origin/<branch>` 和 `git log -1`，确认本地确实落在目标提交后再开始开发。
- Git 网络失败时只做一次有边界的重试；可用官方 `gh api` 或 `git ls-remote`核对远程 SHA，但 API 能看到提交不等于 Git 对象已拉到本地，不得把“已查到”报告成“已拉取”。
- 归档下载只能作为临时内容检查或明确授权的回退方案，不能直接覆盖 `.git` 或把非 Git 工作树冒充为已同步分支。

## 5. 本项目的轻量归档边界

- 本项目使用 `FEAT-*`、`BUG-*` 和 `RESEARCH-*` 关联开发、问题和研究；普通闲聊不自动创建条目。
- 功能当前状态以 `docs/feature-development/` 和 `FEATURE_INDEX.md` 为准；项目当前是否投入工作以 `docs/project-management/items/<ITEM-ID>/item.md` 为准。两者出现差异时先报告，不静默覆盖。
- 代码或功能变更需要同步对应功能记录和项目管理条目；`updates.md` 记录用户影响和进展，`process.md` 只记录本功能弯路，可复用问题才回链 `PROCESS_ISSUES.md`。
- 技术研究写入 `docs/research/` 并关联任务；架构文档只记录真实职责和边界，不代替功能进度。

## 6. 当前实现补充

- 服务统一使用 `9360`；`4173` 不作为交付入口。
- Windows 远程检查优先采用无弹窗、只读方式。
- 架构文件拆分必须先确认导出、调用方、协议边界和定向测试，不以文件长度单独决定拆分。
