# FEAT-014 更新记录

### 2026-08-03 14:47 +08:00

- 状态：implemented_uncommitted
- 本次更新：增加 app-server 归档/恢复路由、活动/归档列表切换、JSONL fallback 目录隔离和归档只读状态。
- 用户影响：可以整理项目会话，归档不删除内容；失败时列表会显示错误，不再无反馈。
- 验证：定向 Node 测试 9/9；`pnpm build:ui`；`git diff --check`。
- 证据：`docs/feature-development/features/FEAT-014-conversation-archive.md`；Git：`uncommitted`。
