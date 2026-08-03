# FEAT-011 更新记录

### 2026-08-03 02:01 +08:00

- 状态：pending_review
- 本次更新：修复旧后端 404 的上线链路问题，重排标题栏核心信息，增加首次点击查询和用量专属错误提示。
- 用户影响：回复完成后自动显示真实今日金额和倍率；首次使用也可直接点击组件查询；电脑、iPad、手机均不再挤压或越界。
- 验证：真实供应商快照；定向测试 `5/5`；`pnpm build:ui`；Playwright 三尺寸首次查询与手动刷新检查。

### 2026-08-03 00:22 +08:00

- 状态：pending_review
- 本次更新：完成标题栏用量摘要、回复完成触发、固定 GPT 分组倍率、点击详情、安全后端聚合和按 Turn 多设备去重。
- 用户影响：服务重启后，用户无需离开 Codex 页面即可查看今日用量；页面打开不会产生查询。
- 证据：`docs/feature-development/features/FEAT-011-fusheng-usage-monitor.md`、`web-ui/src/features/usage-monitor/`、`windows/server/fusheng-usage-service.mjs`
