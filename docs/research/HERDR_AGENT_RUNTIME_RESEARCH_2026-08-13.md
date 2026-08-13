---
document_type: research
status: p0_findings_complete
date: 2026-08-13
scope: Herdr as a possible multi-agent runtime layer for Negus
source: https://github.com/herdrdev/herdr
---

# Herdr Agent Runtime Research

## 结论

Herdr 值得作为 Negus 后续多 Agent 协作的 P0 架构调研对象，但不能直接替换现有群聊或立刻接入生产链路。

它提供的是终端 Agent 运行时，不是群聊、员工项目或项目管理产品。

```text
Negus：群聊、员工身份、共享上下文、用户确认、结果记录
Herdr：Codex 等终端 Agent 的运行、状态、唤醒、等待、输出读取、持久化
```

## 已核实能力

- 后台服务持久化终端和 Agent；客户端断开、网络中断或机器重启后可恢复会话。
- 识别受支持 Agent 的 `working`、`blocked`、`done`、`idle` 和 `unknown` 生命周期状态。
- Agent 可通过 Herdr CLI 或本地 Socket API 创建窗格、启动其他 Agent、发送提示、读取输出及等待状态。
- 内置 Codex 识别与 Agent 启动支持；Socket API 提供 `agent.prompt`、`agent.wait`、`agent.read`、事件订阅和会话快照。
- 开源许可证为 Apache-2.0；本轮查询时最新稳定 Release 为 `v0.8.0`，发布于 2026-08-03。

## 对 Negus 的价值

当前 Negus 已有群聊、员工身份、`@` 路由和真实 Codex Thread，但多 Agent 协作仍主要依赖应用内队列和提示词约束。

Herdr 可补充的不是另一套 UI，而是运行时事实：谁正在工作、谁被阻塞、何时可接受下一步、如何等待同事完成及如何读取其终端输出。这些事实可为后续“员工相互协作并最终收敛”的流程提供可靠基础。

## 关键边界与风险

- Herdr 运行的是 Codex CLI 终端 Agent；现有 Negus 使用 app-server Thread。两者能否保持同一员工身份、同一对话历史和同一任务事实尚未验证。
- `agent prompt --wait` 观察 Agent 生命周期，不追踪单个 Turn；当 Agent 已在工作时，当前活动结束可能满足等待条件。因此不能直接作为 Negus 的任务完成事实。
- Windows 官方仍标为 Beta：Windows 不能作为 Herdr 远程主机，直接终端 attach 也不支持。Windows 本地运行、Codex 检测和 ConPTY 支持已存在，但稳定性需实测。
- Herdr 的终端输出与 Negus 群聊消息不是同一数据模型。若接入，必须保持“群聊公开记录”与“终端运行过程”分层，不能把终端文本直接当作群聊结论。

## 建议的下一步：隔离 PoC

不改 9360、不改现有群聊、不迁移员工主对话。单独验证：

1. 在 Windows 本机安装并启动一个独立 Herdr 会话。
2. 启动两个 Codex CLI Agent，分别命名并确认生命周期状态可识别。
3. 验证 Agent A 提示 Agent B、等待 B 的 `blocked/done` 状态、读取 B 输出。
4. 验证客户端分离、重新连接和 Herdr 重启后的会话/Agent 恢复。
5. 记录 Codex CLI 会话与 Negus app-server Thread 是否能建立可靠对应关系。

只有以上 PoC 通过后，才讨论为 Negus 新增可选 Herdr 适配层；不把 Herdr 作为现有群聊的替换方案。

## 来源

- Herdr README、`agent-skill`、`agent-automation`、`socket-api`、`persistence-remote`、`windows-beta` 官方文档。
- GitHub 仓库与 Release 元数据：`herdrdev/herdr`，查询时间 2026-08-13。
