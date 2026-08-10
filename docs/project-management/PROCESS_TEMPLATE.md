---
document_type: project_management_process_template
schema_version: 1
last_updated: 2026-08-02 18:00 +08:00
audience: ai_assistants_and_maintainers
---

# 项目条目过程记录模板

## 使用边界

本模板只用于 `docs/project-management/items/<ITEM-ID>/process.md`。

- `item.md` 记录当前快照、用户原话、助手初步理解和预计效果。
- `updates.md` 记录状态、版本和用户可见变化的时间线。
- `process.md` 记录这个条目独有的弯路、阻塞、决策和效率损失。
- 能指导其他功能的经验必须升级到 `docs/feature-development/DEVELOPMENT_COMMON_MISTAKES.md`，使用 `PROC-*`；条目内只保留本条目影响和链接。
- 未验证的根因必须写“待验证”，不能用推测替代证据。

## 文件头

```yaml
---
document_type: project_management_process
schema_version: 1
item_id: PM-001
last_updated: 2026-08-02 18:00 +08:00
---
```

## 记录模板

```markdown
### 2026-08-02 18:00 +08:00 | PM-001-P01 | detour | P1 | mitigated

- 条目：PM-001
- 用户可见现象：用户实际看到或无法完成的操作。
- 用户原话：有原文才填写；没有就写“待补录”，不能反推。
- 助手初步理解：只解释原话字面意思，不分析源码。
- 错误路径：实际走过的错误判断或低效操作。
- 影响：耗时、用户操作、数据一致性或维护成本。
- 正确路径/决策：已经确认的较短处理方式。
- 防再犯触发器：下次遇到什么信号时，必须先做什么检查。
- 归属判断：`条目专属`；若可跨功能复用，另建或关联 `PROC-*`。
- 证据：文件、日志、命令结果、提交或用户反馈；未知事实标为“待验证”。
- 关联：`FEAT-*`、`PROC-*`、`updates.md` 或其他项目条目。
```

## 枚举

- `type`：`detour`（弯路）、`blocker`（阻塞）、`decision`（决策）、`efficiency`（效率）、`validation`（验证边界）。
- `severity`：`P0` 至 `P3`。资源、时间或用户信任发生严重损失时使用 `P0`。
- `status`：`active`、`mitigated`、`resolved`、`deferred`。

记录按发现时间正序追加，不覆盖旧记录。一次问题如果从条目专属升级为跨功能问题，保留原 `ITEM-ID-Pxx`，并在 `DEVELOPMENT_COMMON_MISTAKES.md` 新增 `PROC-*` 后建立双向链接。
