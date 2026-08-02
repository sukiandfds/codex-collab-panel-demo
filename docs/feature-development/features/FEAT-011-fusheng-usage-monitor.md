---
feature_id: FEAT-011
title: 浮生云算用量监控
status: implemented_uncommitted
current_version: v0.1.0
last_updated: 2026-08-03 00:22 +08:00
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
- 标题栏固定突出 `gpt 易燃易爆炸` 倍率、今日金额和最后成功更新时间；手机端只显示今日金额。
- 点击组件查看今日请求、Token、余额、历史用量和全部分组倍率，并可手动刷新。
- 访问令牌只由本机 Node 服务读取，不返回浏览器、不写入仓库。
- 代码、定向测试和 UI 构建已通过；后端服务尚未重启，真实标题栏交互和完成触发仍待用户体验。

## 目标与边界

目标：让用户在 Codex Web 对话中随时判断当日浮生云算消耗，并在需要时展开账户与倍率详情。

本轮不做：

- 页面加载自动查询或持续轮询。
- 实时逐 Token 计费动画。
- 多供应商账单系统、告警规则或历史趋势图。
- 向浏览器暴露 `credentials.json`、访问令牌或完整鉴权请求头。
- 修改基础 AppShell、输入框、会话协议或公网入口。

## 用户可见结果

桌面标题栏显示：`GPT 0.12× · 今日 $0.97 · 08-03 00:15`。

手机标题栏显示：`今日 $0.97`。点击后显示完整详情；数据未更新时显示 `--`，查询失败时保留旧数据并显示错误，不影响 Codex 对话。

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
| `FEAT-011-I03` | 普适 | mitigated | 构建通过不能证明真实标题栏布局、弹层交互和完成触发可用；本轮只标记实现完成，服务重启和用户体验后再更新状态 |

## 版本时间线

### 2026-08-03 00:22 +08:00 | v0.1.0 | implemented_uncommitted

- 计划：在标题栏增加浮生云算用量摘要，回复完成后更新，点击查看全部详情。
- 实际：新增独立前后端功能域、安全凭据读取、四接口聚合、按 Turn 去重、本地缓存、响应式标题栏组件和手动刷新。
- 偏差：未采用固定 15 秒全局缓存，改为按 `turnId` 去重，避免连续两轮短回复读取旧数据。
- 问题：`FEAT-011-I01` 至 `I03`。
- 验证：后端语法通过；定向 Node 测试 `5/5` 通过；`pnpm build:ui` 通过；`git diff --check` 通过。
- 用户可见变化：服务重启后，单人 Codex 标题栏会出现用量组件；页面打开不查询，回复完成后自动更新。
- Git：`uncommitted`。

## 下一步

- 进行一次受控服务重启，再用一轮真实 Codex 回复确认标题栏更新、固定倍率、详情展开和手机布局。
- 用户体验确认后，将状态更新为 `accepted` 或记录具体问题；不提前增加趋势图和告警。
