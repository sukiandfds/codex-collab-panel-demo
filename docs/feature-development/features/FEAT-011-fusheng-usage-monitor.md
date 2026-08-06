---
feature_id: FEAT-011
title: 浮生云算用量监控
status: implemented_pending_review
current_version: v0.1.1
last_updated: 2026-08-03 02:01 +08:00
owners: [usage_monitor, web_ui, windows_server]
key_paths:
  - web-ui/src/features/usage-monitor
  - web-ui/src/features/conversations/components/ConversationHeader.tsx
  - windows/server/fusheng-usage-service.mjs
  - windows/server/routes/usage-routes.mjs
  - windows/tests/fusheng-usage-service.test.mjs
---

# FEAT-011：浮生云算用量监控

## 当前快照

- 已在单人 Codex 标题栏的分享按钮左侧接入独立用量组件。
- 页面打开不请求浮生云算 API，只读取浏览器上次成功缓存；跨日缓存不显示为今日用量。
- 本页面观察到同一真实 Turn 从运行变为 `completed` 后，延迟 2 秒查询一次。
- 标题栏固定突出今日金额和 `gpt 易燃易爆炸` 倍率；更新时间放入详情，避免标题栏信息拥挤。
- 第一次没有缓存时，点击用量组件会直接查询，不必再寻找刷新按钮；页面打开本身仍不查询。
- 点击组件查看今日请求、Token、余额、历史用量和全部分组倍率，并可手动刷新。
- 访问令牌只由本机 Node 服务读取，不返回浏览器、不写入仓库。
- 代码、定向测试和 UI 构建已通过；真实供应商查询与桌面、iPad、iPhone 渲染交互已验证。

## 目标与边界

目标：让用户在 Codex Web 对话中随时判断当日浮生云算消耗，并在需要时展开账户与倍率详情。

本轮不做：

- 页面加载自动查询或持续轮询。
- 实时逐 Token 计费动画。
- 多供应商账单系统、告警规则或历史趋势图。
- 向浏览器暴露 `credentials.json`、访问令牌或完整鉴权请求头。
- 修改基础 AppShell、输入框、会话协议或公网入口。

## 用户可见结果

桌面标题栏显示：`今日 $0.97 | gpt 易燃易爆炸 0.12×`。

手机标题栏用仪表图标配合 `$0.97 | 0.12×` 紧凑显示两个核心数值。点击后显示完整详情；数据未更新时显示 `--`，查询失败时保留旧数据并显示错误，不影响 Codex 对话。

## 架构与数据链路

```text
Codex execution_status completed
  -> useUsageMonitor（按 turnId 去重，延迟 2 秒）
  -> GET /api/usage/fusheng?turnId=<turnId>
  -> fusheng-usage-service
  -> credentials.json（仅服务端读取）
  -> /api/user/self + /api/data/self + /api/status + /api/pricing
  -> 汇总后的安全 JSON
  -> 标题栏摘要 + 点击详情 + localStorage 最近成功快照
```

后端使用同一 `turnId` 作为短期缓存键：手机和电脑同时观察到同一轮完成时只产生一轮外部查询；不同 Turn 不复用旧结果。网络连接失败只重试一次，`401` 不重试。

## 问题记录

| 编号 | 分类 | 状态 | 现象与处理 |
| --- | --- | --- | --- |
| `FEAT-011-I01` | 特例 | mitigated | 页面打开时没有新请求，因此第一次使用或跨日后标题栏显示 `--`；保留此行为，等待下一轮真实回复完成或用户手动刷新 |
| `FEAT-011-I02` | 特例 | resolved | 固定时间缓存可能让短时间内不同 Turn 复用旧用量；改为按 `turnId` 去重，同一 Turn 多设备共享、不同 Turn 必查 |
| `FEAT-011-I03` | 普适 | resolved | 构建通过不能证明真实标题栏布局和弹层交互可用；已使用真实供应商快照分别验证 1440×900、820×1180、390×844，详情无越界、页面无横向溢出、控制台无错误 |
| `FEAT-011-I04` | 普适 | resolved | 新前端已经构建，但 9360 仍运行旧 Node 后端，导致用量接口固定返回 404；后端变更后必须受控重启项目服务，不能把构建成功当成接口已经上线 |

## 版本时间线

### 2026-08-03 02:01 +08:00 | v0.1.1 | implemented_uncommitted

- 现象：标题栏无法显示真实金额和倍率，手动刷新无结果；组件与标题、分享、页面切换的视觉层级不清晰。
- 根因：9360 仍是旧后端，`/api/usage/fusheng` 返回 404；原摘要把金额、倍率、更新时间塞在同一行，手机端又只保留金额。
- 修复：标题栏只保留今日金额和固定分组倍率；首次点击无缓存时立即查询；用量接口提供独立错误信息；手机保留两个数值和用量图标。
- 验证：真实供应商查询成功；定向 Node 测试 `5/5`；`pnpm build:ui` 通过；Playwright 在桌面、iPad、iPhone 验证首次点击、手动刷新、弹层边界、横向溢出和控制台错误，全部通过。
- 运行：正式 9360 的安全重启已排队，本次 Web Turn 完成后加载新后端；Cloudflare Tunnel 与固定链接不变。

### 2026-08-03 00:22 +08:00 | v0.1.0 | implemented_uncommitted

- 计划：在标题栏增加浮生云算用量摘要，回复完成后更新，点击查看全部详情。
- 实际：新增独立前后端功能域、安全凭据读取、四接口聚合、按 Turn 去重、本地缓存、响应式标题栏组件和手动刷新。
- 偏差：未采用固定 15 秒全局缓存，改为按 `turnId` 去重，避免连续两轮短回复读取旧数据。
- 问题：`FEAT-011-I01` 至 `I03`。
- 验证：后端语法通过；定向 Node 测试 `5/5` 通过；`pnpm build:ui` 通过；`git diff --check` 通过。
- 用户可见变化：服务重启后，单人 Codex 标题栏会出现用量组件；页面打开不查询，回复完成后自动更新。
- Git：`uncommitted`。

## 下一步

- 用户体验确认后，将状态更新为 `accepted` 或记录具体问题；不提前增加趋势图和告警。
