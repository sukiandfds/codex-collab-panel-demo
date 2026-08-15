# FEAT-018 更新记录

### 2026-08-14 17:10 +08:00

- 状态：implementation_in_progress
- 基线：`081787798e211a5b2399d61e8a305261a7594b12`，分支 `codex/publish-current-panel`。
- 范围：按平台级 Goal 设计开发，不把当前项目路径写入 Goal 核心边界。

### 2026-08-14 18:00 +08:00

- 状态：implemented_uncommitted
- 后端：完成 Goal Store、生命周期服务、运行适配器、版本化 API 和组合根接线；服务持续运行时使用服务端超时计时器，未加入周期性检查器。
- 前端：单人对话与群聊共用 Goal Provider、SSE 事件订阅和 Goal 控制条；支持启动、状态、暂停/继续、编辑、清除和详情展开。
- 验证：Goal Store、Goal Service、Goal Routes 三组测试通过；Web UI TypeScript 检查通过。
- 待验证：生产 UI 构建、完整相关 Node 测试、真实服务启动和跨入口体验；当前未提交，不触碰用户既有未提交文件。

### 2026-08-14（能力入口校正）

- 移除未经确认的 AppShell 顶部 Goal 控制条及其占位行；无活跃 Goal 时不再占用单聊或群聊的消息空间。
- Goal 改为复用既有“能力菜单”，在单聊和群聊中统一提供 `/goal`、`/goal pause`、`/goal resume`、`/goal clear` 可调用入口。
- 保留平台级 Goal Provider、持久化 API 与 SSE 状态复用；本次仅更正入口层，不将 Goal 重新绑定到项目或群聊。
- 验证：Web UI TypeScript 检查、Vite 生产构建通过。

### 2026-08-14 19:35 +08:00

- 状态：implemented_pending_review
- 审查修复：生命周期改为运行时成功后落状态；员工中断核对精确 Turn；真实 Turn 终态自动回写 Goal、Task 和 Run。
- 数据保护：Task/Run 关系字段不能通过通用 PATCH 改写；容量满时保留运行中 Goal；失效的创建幂等映射不再返回空 Goal。
- 用户体验：多个 Goal 时不再自动选择列表第一项；命令可携带 Goal ID，输入区显示成功、失败和版本冲突。
- 仓库清理：移除误提交的 Playwright YAML 和截图，并加入忽略规则。
- 产品提交：`d755cad12e79d2ee11af1b28233dec82ad316297`。
- 验证：Windows Node 测试 `157/157`、`pnpm build:ui`、相关 MJS 语法检查和 `git diff --check` 通过。
- 待验收：未重启服务；真实 Goal 长任务、跨入口操作和移动端体验仍待用户验收。

### 2026-08-14 19:44 +08:00

- 边界修复：已暂停或等待的 Goal 在清除、状态互转和超时时不再重复调用运行时停止，避免精确 Turn 校验拒绝第二次中断后 Goal 状态卡住。
- 产品提交：`964ad4e6297c369b9bf8e856c98bd5e67b13382e`。
- 验证：Goal Service 聚焦测试 `10/10`、Windows Node 测试 `160/160`、相关 MJS 语法检查和 `git diff --check` 通过；本次后端边界补丁未重复构建 UI。
- 待验收：未重启服务；真实 Goal 长任务、跨入口操作和移动端体验仍待用户验收。

### 2026-08-14 21:42 +08:00

- 版本：`v0.2.0`，状态保持 `implemented_pending_review`。
- 方向纠正：删除 Negus 自建 Goal Store、Service、Runtime Adapter、API、Provider、命令拦截和生命周期操作，不再维护第二套 Goal 状态。
- 用户入口：单聊和群聊能力菜单只保留一个“Goal 目标模式”；`/goal <目标>` 通过现有消息通道交给 Codex 原生 Goal。
- 原生证据：历史 Negus Thread 已确认调用 `create_goal`，并由 `update_goal` 正常完成。
- 验证：Windows Node 测试 `146/146`、`pnpm build:ui`、修改后 MJS 语法检查和 `git diff --check` 通过。
- 待验收：当前服务尚未安全重启；重启后需要从能力菜单发起一个真实短 Goal，确认原生过程和完成结果。
