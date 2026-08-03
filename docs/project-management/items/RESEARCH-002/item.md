---
id: RESEARCH-002
type: research
title: 核心运行链路、实时状态与项目数据源调研
category: research
priority: P1
status: completed
updated_at: 2026-08-03
source: docs/research/RUNTIME_CALL_GRAPH_AND_PROJECT_DATA_RESEARCH_2026-08-03.md
related: [RESEARCH-001, PM-001, FEAT-001, FEAT-005]
product_base_commit: 5f817f0143368c98619011f0b1eaf050baf0efea
product_commit: 5f817f0143368c98619011f0b1eaf050baf0efea
docs_commit: pending
audited_product_commit: pending
sync_status: docs_pending
next_action: 等待后续开发或审计引用本调研结果
last_user_visible_change: 新增一份可按编号定位的核心运行链路与项目数据源调研记录
---

# 核心运行链路、实时状态与项目数据源调研

## 用户原话

继续调研；总结好，保存好，按照之前沟通的格式。

## 助手初步理解

把本轮已完成的源码、实时事件、测试和项目管理数据源事实，按项目约定保存为新的日期研究记录，并与项目管理条目关联。

## 简短摘要

记录单人会话读取、发送、实时恢复、核心服务调用方、测试覆盖，以及项目管理页和项目进度页的数据差异。

## 具体内容

- 研究正文：docs/research/RUNTIME_CALL_GRAPH_AND_PROJECT_DATA_RESEARCH_2026-08-03.md
- 调研产品提交：5f817f0143368c98619011f0b1eaf050baf0efea
- 内容范围：服务端组装、单人会话读写、实时事件、SSE 恢复、标识字段、测试覆盖、项目数据源和页面入口。
- 本轮未修改生产代码、UI、服务启动配置或测试文件。

## 预计效果

后续开发或审计可以通过 RESEARCH-002 定位当前产品提交对应的调用关系、事件链路、测试文件和项目数据源事实，不需要重新从聊天记录中还原本轮调研内容。

## 关联条目

- RESEARCH-001
- PM-001
- FEAT-001
- FEAT-005

## 当前状态

调研结果已保存，项目管理索引已登记，等待文档提交号回写。

## 当前证据

- docs/research/RUNTIME_CALL_GRAPH_AND_PROJECT_DATA_RESEARCH_2026-08-03.md
- windows/server/app-server-conversation-store.mjs
- windows/server/execution-tracker.mjs
- windows/server/realtime-hub.mjs
- web-ui/src/features/conversations/realtime/useConversationEvents.ts
- web-ui/src/features/execution/hooks/useCodexExecution.ts
- windows/tests/execution-tracker.test.mjs
- windows/tests/realtime-hub.test.mjs

