# FEAT-012 更新记录

### 2026-08-03 14:47 +08:00

- 状态：implemented_uncommitted
- 本次更新：新增独立消息操作栏，接入 Clipboard API 和浏览器回退复制。
- 用户影响：消息下方可一键复制原始内容，不刷新会话、不产生服务端操作。
- 验证：定向 Node 测试 9/9；`pnpm build:ui`；`git diff --check`。
- 证据：`docs/feature-development/features/FEAT-012-conversation-copy.md`；Git：`uncommitted`。
