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
