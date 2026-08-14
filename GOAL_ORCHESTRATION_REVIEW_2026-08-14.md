# Goal 编排审查问题列表

> 历史快照：以下内容记录于提交 `46f540a` 之前，其中 Git 状态与“未提交/未推送”描述仅代表当时审查状态。正文按原始总结保留。

## 修复状态

- 历史暂存区完整性问题已随完整功能提交 `46f540a` 消除。
- 生命周期一致性、精确 Turn 中断、终态回写、关系字段保护、容量/幂等、前端目标选择和可见反馈已在 `d755cad12e79d2ee11af1b28233dec82ad316297` 修复；暂停/等待状态再次清除、切换或超时时的重复运行时中断已在 `964ad4e6297c369b9bf8e856c98bd5e67b13382e` 修复。
- 误提交的 Playwright YAML 和截图已删除并加入忽略规则。
- Windows Node 测试 `160/160`、UI 生产构建、相关 MJS 语法检查及 `git diff --check` 通过。
- 尚未重启服务，也未完成真实 Goal 长任务、浏览器或移动端体验验收。

审查完成。刚才在等待最后一轮全量测试与 Git 快照。**结论：当前不要直接提交暂存区**；代码整体能构建、全量测试已通过，但暂存内容不完整，Goal 编排还有数项高风险逻辑问题。我没有修改、暂存、提交或推送任何代码。

### 审查结果

- **P0：当前暂存区无法独立构建。** 已暂存的 [GroupComposer.tsx](/D:/mylittlethings/codex-collab-panel-demo/web-ui/src/features/group-chat/components/GroupComposer.tsx:6) 引用了 `goals/model/capability` 和 `goals/hooks/useGoalCapability`，但整个 `web-ui/src/features/goals/` 仍未跟踪、未暂存。现在执行 `git commit` 会产生缺少模块的提交。

- **P1：暂存区与实际验证代码不是同一个版本。** 当前有 12 个暂存文件、52 个已跟踪差异、62 个未跟踪文件；`MemberProfileDrawer.tsx` 和 `useGroupRoom.ts` 同时存在已暂存和未暂存修改。构建与测试验证的是完整工作树，不代表当前 index 可以发布。

- **P1：Goal 状态与运行时可能不一致。** [goal-service.mjs](/D:/mylittlethings/codex-collab-panel-demo/windows/server/goal-service.mjs:176) 先把状态写成 paused/active/cleared，再调用运行时。运行时失败时接口会报错，但持久化状态已经改变；超时停止失败还可能形成未处理的 Promise rejection。

- **P1：暂停或清除 Goal 可能中断错误的任务。** [remote-room-demo.mjs](/D:/mylittlethings/codex-collab-panel-demo/windows/scripts/remote-room-demo.mjs:264) 只按 `ownerId` 调用 interrupt，没有核对该 Goal 保存的 `turnId/externalRef`；[employee-runtime-service.mjs](/D:/mylittlethings/codex-collab-panel-demo/windows/server/employee-runtime-service.mjs:458) 会中断该员工当前任意任务。

- **P1：Goal 完成状态不会自动回写。** Goal 启动只是一次 `sendMessage`，没有保存 `goalId ↔ turnId` 关系，也没有订阅员工任务完成事件。员工实际完成后，Goal、Task、Run 仍可能一直显示 active/running，最终被错误标记为超时。

- **P1：Task/Run PATCH 可以破坏关系数据。** [goal-service.mjs](/D:/mylittlethings/codex-collab-panel-demo/windows/server/goal-service.mjs:212) 允许直接修改 `parentTaskId`、`childTaskIds`、`runIds`、`taskId`，但没有验证引用是否存在，也没有同步反向关系。

- **P1：Goal 容量和幂等映射存在失效路径。** 超过 200 个 Goal 时会直接删除最早记录，包括仍在运行的 Goal；`createRequests` 又永久保留旧 ID。之后携带原 `requestId` 重试可能返回 `goal: null`，路由仍响应 201。

- **P2：前端 Goal 动作目标不明确。** [GoalProvider.tsx](/D:/mylittlethings/codex-collab-panel-demo/web-ui/src/features/goals/state/GoalProvider.tsx:116) 自动选择 active 或列表第一项；[useGoalCapability.ts](/D:/mylittlethings/codex-collab-panel-demo/web-ui/src/features/goals/hooks/useGoalCapability.ts:18) 的 `/goal pause|resume|clear` 会直接作用于该隐式目标。当前没有 Goal 选择界面，存在恢复或清除错误 Goal 的风险。

- **P2：Goal 的成功、失败和版本冲突没有可见反馈。** Provider 保存了错误信息，但没有 UI 消费；用户执行 Goal 命令后只能看到输入框被清空或文字保留。

- **P2：提交污染风险。** 28 个 `.playwright-cli/page-*.yml` 和 2 张 `output/playwright/*.png` 未被 `.gitignore` 覆盖，`git add -A` 会一并加入约 0.8 MB 测试产物。另有大量系统审计文档，适合与功能代码拆分提交。

### 已验证

- 当前 `HEAD` 与远程 `origin/codex/publish-current-panel` 完全一致：`0817877`，领先/落后均为 0。
- 该功能分支包含 `origin/main`，并额外领先 48 个提交，尚未合并回 main。
- 审查过程中新增的员工直连路由修复已经生效。
- Windows 全量测试：**150/150 通过**。
- TypeScript 类型检查通过。
- Vite 生产构建通过。
- `git diff --check` 通过；未发现高置信度密钥泄漏。
- 标准 pnpm 构建入口在本机受到 `esbuild` 构建脚本许可策略阻断，属于依赖环境/CI 配置风险。
- 多个修改文件存在 LF/CRLF 转换警告，提交前需要统一换行策略。
