---
document_type: research
status: p0_findings_complete
date: 2026-08-14
scope: DeepSeek Harness as a possible multi-agent runtime layer for Negus
source: https://github.com/deepseek-ai/deepseek-harness
---

# DeepSeek Harness Research

## 结论

DeepSeek Harness 值得作为 P0 架构候选继续做隔离验证，但不能直接接入或替换当前 `9360` 群聊主链路。

它的价值是插件化 Agent 运行时、子 Agent 生命周期和会话记录，不是项目群聊、员工身份或项目管理产品。

```text
Negus: 群聊、员工身份、@ 路由、用户确认、项目与成果记录
Harness: 可选的 Agent 运行、子 Agent 生命周期、工具与模型插件
```

## 已核实能力

- 官方定义为“everything is a plugin”的开源 Agent Harness。
- 通用子 Agent 层支持可续子 Agent、后续消息、打断、子 Agent 向父 Agent 汇报，以及基于会话日志的冷恢复。
- 通用层也明确提供会话描述符和生命周期事件，适合观察子 Agent 的启动与结束。

## 对当前 Codex 链路的关键限制

- 官方 `codex` Provider 每次任务都会启动 `codex app-server --stdio`，新建一个临时 `ephemeral` Codex Thread。
- 它只向父 Agent 返回最终文本；进度、工具调用、过程消息、文件差异、Thread ID 与 Turn ID 都不会进入父会话。
- 该 Provider 不支持续跑、恢复、进度流或持久化 Codex 子会话，也不继承父会话上下文。
- 因此它不能复用 Negus 已持久化的员工 `threadId`、SSE 执行状态、员工身份或群聊消息。

## 风险与边界

- 直接接入会形成两套 Thread、运行状态和消息记录事实源，导致员工状态、验收证据与群聊内容难以对齐。
- Harness 的可续子 Agent 仍有已知限制：跨进程不协调、没有持久 mailbox、没有 exactly-once 回执；已接收但尚未写入会话日志的消息在崩溃后不能自动重放。
- 仓库处于 developer preview，官方明确允许破坏性兼容变更；2026-08-14 查询时 GitHub Releases 为空。
- 开源许可证为 MIT。

## 建议的后续验证

仅做隔离 PoC，不安装到主项目、不修改 `9360`、不迁移现有员工主对话。PoC 先验证：临时 Codex Thread 创建、取消、失败与最终结果是否可追溯。

若未来目标是“持久员工互相沟通”，需要另行设计 RuntimeAdapter，让现有 app-server Thread 保持唯一事实源；这不是 Harness 的现成能力，也不属于最小接入。

## 来源

- https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-codex/README.md
