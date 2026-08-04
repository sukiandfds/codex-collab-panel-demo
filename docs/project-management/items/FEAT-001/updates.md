# FEAT-001 更新记录

### 2026-08-02 11:39 +08:00

- 状态：pending_review
- 本次更新：按 Codex/Happy 的事件快路径与权威快照恢复模式整理弱网发送、停止确认、完成后过程折叠和思考程度显示；跨设备终态与流式交接记录为 I24。
- 用户影响：等待手机长任务真实体验确认。
- 证据：`docs/feature-development/features/FEAT-001-single-codex-web.md`

### 2026-08-02 18:00 +08:00

- 状态：pending_review
- 本次更新：新增 FEAT-001 条目专属过程索引，区分标题/内容渲染特例与已升级到 `PROC-019`、`PROC-020`、`PROC-022` 的跨功能问题。
- 用户影响：后续复盘单人 Codex 时，可以先看本条目的影响，再跳转到通用运行规则，不需要重复阅读完整事故记录。
- 证据：`docs/project-management/items/FEAT-001/process.md`、`docs/feature-development/PROCESS_ISSUES.md`

### 2026-08-03 11:32 +08:00

- 状态：paused
- 本次更新：完成实时事件、长会话读取、Codex 原生读取能力和最小回归测试缺口审计。确认 `thread/read` 本身没有分页参数，当前 `limit/before` 只在本项目内存切片；同时确认 primary/fallback 双读、重复详情刷新和 Turn 事件隔离不足是后续修复重点。代码修复暂缓，避免中断现有功能。
- 用户影响：当前页面行为不变；旧性能问题已有可追踪的根因和修复边界，后续可在不混入 UI 或新功能的情况下单独修复。
- 后续方向：旧问题进入待修复状态；新功能先做需求、模块归属、接口和验收标准准备，不立即实现。
- 证据：远程分支 `codex/remote-work-web-reliability` 提交 `deaa5c5999d96c0e3a01cd53669a315ba663823b`；`docs/architecture/audits/REALTIME_CONVERSATION_ARCHITECTURE_AUDIT_2026-08-03.md`；`docs/architecture/audits/CODEX_NATIVE_READ_AND_REGRESSION_REVIEW_2026-08-03.md`

### 2026-08-03 20:42 +08:00

- 状态：paused
- 本次问题：服务重启后，旧 Thread 仍显示“Codex 自动恢复失败”，页面无法区分历史恢复失败和当前服务状态。
- 根因：`execution-runs.json` 中的非 active `systemError` 在启动时被原样恢复；原有启动归一化只处理 `active: true` 的任务。
- 修复：启动加载时仅将标签为“Codex 自动恢复失败”的历史终态归一化为“项目服务已重启，上一任务已中断”，并清空残留流式文本；不修改对话内容，不伪造任务成功。
- 用户影响：重启后该对话显示上一任务已中断，用户可以重新发送，不会一直卡在自动恢复失败。
- 验证：`node --test windows/tests/execution-tracker.test.mjs windows/tests/conversation-controls.test.mjs windows/tests/jsonl-conversation-media.test.mjs`（24/24）；`pnpm build:ui`；`git diff --check`；本机 `/api/execution-status` 已返回 `interrupted`。
- 证据：`windows/server/execution-tracker.mjs`；`windows/tests/execution-tracker.test.mjs`；Git：`uncommitted`。

### 2026-08-04 09:27 +08:00

- 状态：in_progress / P0 regression
- 本次更新：逐字保存用户连续报告的三条真实手机使用反馈和记录要求，并关联截图；不以助手概括替代用户原话。
- 用户影响：当前产品提交存在消息顺序错误、新发送消息不能立即跨 Web 设备显示、最终光标持续闪烁和同一助手答案重复显示，不能视为可交付。
- 代码范围：本次没有修改代码、没有启动或重启服务。
- 产品基线：`63e8f948b8058d8236e7a4672b5c1f8bdbf8eb70`
- 证据：`docs/project-management/items/FEAT-001/process.md#2026-08-04--feat-001-p05--regression--p0--active`

### 2026-08-04 09:55 +08:00

- 状态：in_progress / code_ready_for_runtime_review
- 本次更新：修复 `FEAT-001-I25` 四项 P0 回归。统一本机乐观消息和跨设备 SSE 消息的提交身份；会话刷新按返回时最新缓存合并并拒绝旧版本；最终答案完成持久化交接后移除流式副本，终态未交接草稿停止闪烁光标。
- 用户影响：重启加载新后端后，发送消息应立即在本机及其他 Web 设备各出现一次；慢会话刷新或加载旧页不再用旧内容覆盖最新消息；助手完成后只保留一份答案且没有持续闪烁光标。
- 验证：Windows Node 测试 `84/84`；`pnpm build:ui`；后端语法检查；`git diff --check`；构建产物确认包含 `user_message_submitted`。
- 运行边界：按用户要求未启动或重启服务；当前运行后端仍是旧代码，本轮不宣称真实手机或跨设备验收通过。
- 证据：`web-ui/src/features/conversations/hooks/useConversationSession.ts`；`web-ui/src/features/conversations/components/ConversationView.tsx`；`windows/server/routes/conversation-routes.mjs`；`windows/tests/conversation-routes.test.mjs`。
