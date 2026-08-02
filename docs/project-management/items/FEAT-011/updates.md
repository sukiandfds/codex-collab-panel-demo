# FEAT-011 更新记录

### 2026-08-03 00:22 +08:00

- 状态：pending_review
- 本次更新：完成标题栏用量摘要、回复完成触发、固定 GPT 分组倍率、点击详情、安全后端聚合和按 Turn 多设备去重。
- 用户影响：服务重启后，用户无需离开 Codex 页面即可查看今日用量；页面打开不会产生查询。
- 证据：`docs/feature-development/features/FEAT-011-fusheng-usage-monitor.md`、`web-ui/src/features/usage-monitor/`、`windows/server/fusheng-usage-service.mjs`
