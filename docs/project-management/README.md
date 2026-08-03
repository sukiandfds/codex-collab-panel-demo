---
document_type: project_management_readme
schema_version: 1
status: active
last_updated: 2026-08-03 11:46 +08:00
---

# 项目管理资料

这是独立于 `docs/feature-development/` 的项目管理数据源。

## AI 阅读顺序

1. 先读 [`PROJECT.md`](./PROJECT.md)，了解项目目标和资料边界。
2. 再读 [`WORKFLOW_RULES.md`](./WORKFLOW_RULES.md)，了解代码、文档、审计和合入规则。
3. 再读 [`INDEX.md`](./INDEX.md)，按条目编号定位对应文件夹。
4. 读取 `items/<条目编号>/item.md`，了解条目的当前快照。
5. 需要知道状态如何变化时，读取同一目录下的 `updates.md`。
6. 需要复盘该条目的弯路、阻塞或决策时，读取同一目录下的 `process.md`；跨功能问题再跳转到 `docs/feature-development/PROCESS_ISSUES.md` 的 `PROC-*`。

## 目录约定

```text
project-management/
├─ PROJECT.md
├─ WORKFLOW_RULES.md
├─ INDEX.md
├─ SCHEMA.md
└─ items/
   └─ <ITEM-ID>/
      ├─ item.md
      ├─ updates.md
      └─ process.md       # 有专属过程记录时创建
```

`INDEX.md` 只负责定位和排序，不复制条目的长内容。条目的当前字段由 `item.md` 管理，历史变更由 `updates.md` 追加记录。
`process.md` 只记录该条目独有的弯路、阻塞、决策和效率复盘；没有独立过程记录的条目不创建空文件。

## 数据原则

- Markdown + YAML frontmatter 是人工和 AI 的维护源。
- Web API 输出 JSON，但 JSON 不作为人工编辑文件。
- 用户原话与助手初步理解必须分开；没有原始对话时明确标记待补录，不能根据文件反推原话。
- 摘要列表只展示摘要、级别、状态和更新时间；详情和日志单独查看。
- 旧功能文档只作为证据来源，不与本目录混写。
- 条目专属记录不能代替功能文档中的问题记录；如果同一经验可以指导其他功能，完整规则应升级到 `PROCESS_ISSUES.md`，条目里只保留链接和本条目的影响。

## 运行入口

- 页面：`/progress`（兼容 `/project-management`）
- 数据接口：`GET /api/project-management`（摘要）、`GET /api/project-management/entries/<ITEM-ID>`（详情）
- 读取器：`windows/server/project-management-store.mjs`
- 前端模块：`web-ui/src/features/project-management/`

页面只在打开或点击“刷新”时读取一次，不使用后台轮询；服务端每次从本目录重新生成 JSON。
