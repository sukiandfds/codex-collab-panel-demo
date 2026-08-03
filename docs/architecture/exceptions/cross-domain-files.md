# 跨领域与待拆分文件

本文件只登记“确实跨越多个边界、暂时不能安全移动或拆分”的文件。普通文件不在这里罗列。

## 当前候选

| 文件 | 涉及领域 | 当前混合职责 | 后续判断 |
| --- | --- | --- | --- |
| `windows/server/execution-tracker.mjs` | 执行、实时、Codex 适配 | 执行状态、事件转换、过程摘要 | 先确认事件协议，再拆成状态模型与事件适配 |
| `windows/server/app-server-client.mjs` | Codex 适配、执行、对话 | 外部客户端调用、事件接收和错误映射 | 保留为适配边界，避免业务层直接调用协议 |
| `windows/server/app-server-conversation-store.mjs` | 对话、持久化、协议 | 会话读取、事件落盘、快照补偿 | 先划分存储接口与协议转换 |
| `windows/server/multi-agent-service.mjs` | 群聊、多 Agent、执行 | Agent 编排、任务输出、状态更新 | 与 `multi-agent/` 的职责对齐后再拆 |
| `web-ui/src/features/conversations/realtime/useConversationEvents.ts` | 对话、执行、实时恢复 | SSE 事件、断档识别、快照补偿 | 先保留现状，拆分需以单人 Codex 实机验证为前提 |
| `web-ui/src/features/execution/hooks/useCodexExecution.ts` | 执行、对话状态 | 执行控制、状态组合、过程展示数据 | 区分控制 Hook 与展示 Hook |

## 暂不处理的项目

- 不因文件长度单独移动文件。
- 不在开发分支未稳定前重命名入口、路由或服务文件。
- 不把 Orca 调研、P0 复盘和外部评估资料迁入源码目录。
- 不把当前文档分支直接当成最新产品代码基线。

## 进入拆分的条件

满足以下至少一项，才进入后续物理整理：职责边界已由功能验收确认；已有调用方清单；可以保持导出和运行行为不变；有构建/回归验证路径。
