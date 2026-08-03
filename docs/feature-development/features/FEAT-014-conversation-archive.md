---
feature_id: FEAT-014
title: 项目对话归档与恢复
status: implemented_uncommitted
current_version: v0.1.0
last_updated: 2026-08-03 14:47 +08:00
owners: [app_server, jsonl_fallback, conversations, web_ui]
key_paths:
  - windows/server/app-server-conversation-store.mjs
  - windows/server/jsonl-conversation-store.mjs
  - windows/server/routes/conversation-routes.mjs
  - web-ui/src/features/conversations/hooks/useConversationCatalog.ts
  - web-ui/src/features/conversations/components/SessionList.tsx
---

# FEAT-014：项目对话归档与恢复

## 当前快照

- 服务端使用 `thread/archive`、`thread/unarchive`，活动和归档列表通过 `thread/list` 的 `archived` 参数分开读取。
- JSONL fallback 分开扫描 `sessions` 和同级 `archived_sessions`，归档项不会进入活动列表。
- 归档会话只读：输入、模型、上下文和分叉操作都会禁用；恢复后可继续对话。

## 目标与边界

归档是可恢复的会话整理操作，不是删除。当前只处理当前项目的会话，不做永久删除、跨项目移动、搜索和批量归档。

## 用户可见结果

侧栏可以在活动/已归档视图之间切换。归档后活动列表移除该会话；恢复操作会把会话放回活动数据源。操作失败时列表中显示真实错误，当前会话不会被伪装成已完成。

## 问题记录

| 编号 | 分类 | 状态 | 现象与处理 |
| --- | --- | --- | --- |
| `FEAT-014-I01` | 特例 | resolved | 归档视图首次打开可能复用活动会话快照；初始化阶段现在忽略活动快照。 |
| `FEAT-014-I02` | 特例 | resolved | 清空选中会话后 URL 仍可能带旧 `thread`；清空时同步删除查询参数。 |
| `FEAT-014-I03` | 特例 | resolved | 归档/恢复失败时列表有内容，原 UI 不显示错误；会话列表现在始终显示错误提示。 |
| `FEAT-014-I04` | 特例 | deferred | 旧版 app-server 对归档 RPC 和过滤参数的支持未在本机真实探测；请求失败会原样反馈，不能宣称兼容。 |
| `FEAT-014-I05` | 特例 | mitigated | JSONL fallback 新文件主要依靠目录 reconcile，完整发现最慢约 60 秒；实时 watcher 仍负责已登记文件。 |

## 版本时间线

### 2026-08-03 14:47 +08:00 | v0.1.0 | implemented_uncommitted

- 计划：按 Codex 服务端归档语义增加活动/归档列表和恢复入口。
- 实际：新增归档/恢复路由、app-server 操作、JSONL fallback 目录隔离、前端视图切换与只读状态。
- 偏差：未实现永久删除、批量操作和旧运行时能力探测。
- 问题：`FEAT-014-I01` 至 `I03` resolved；`I04` deferred；`I05` mitigated。
- 验证：定向 Node 测试 9/9；`pnpm build:ui` 通过；`git diff --check` 通过。
- 用户可见变化：可在侧栏归档/恢复项目对话，归档内容不会混入活动列表。
- Git：`uncommitted`。

## 下一步

- 在本机 Codex app-server 上验证三个归档 RPC；在真实手机浏览器确认归档视图和恢复后的继续发送体验。
