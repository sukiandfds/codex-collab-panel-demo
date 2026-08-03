---
feature_id: FEAT-010
title: Orca 群聊执行运行时适配技术试验（非路线 2）
status: paused_experiment
current_version: v0.1.0
last_updated: 2026-07-29 18:53 +08:00
owners: [group_chat, runtime_adapter, orca]
key_paths:
  - windows/server/runtime-adapters
  - windows/scripts/remote-room-demo.mjs
  - windows/scripts/start-web-demo.ps1
  - windows/scripts/verify-orca-route2.ps1
  - windows/server/routes/system-routes.mjs
related_features: [FEAT-002, FEAT-005, FEAT-007, FEAT-008, FEAT-009]
---

# FEAT-010：Orca 群聊执行运行时适配技术试验（非路线 2）

> 2026-07-29 状态更正：本分支只完成了 Orca CLI 执行器适配，没有迁移 Orca 的群聊路由、共享上下文、消息存储、UI、UAC 或远程恢复能力。它不能算路线 2 成果，正式路线 2 进度仍为 `0`，当前停止继续开发和实机验收。

> 后续范围澄清：用户要求最终一次性形成能够替代旧 Demo 的完整版本，不接受把逐个模块交付当作路线 2。具体应整体 Fork Orca 后删改，还是在现有项目中一次性迁入全部必要能力，目前仍未论证和确认。

## 当前快照

- 用户没有实际使用过 Orca；路线 2 的目标是复用其稳定能力并做成自己的产品，不要求用户学习或接受 Orca 原有交互。
- 默认体验要求是“本机 Codex 能用，群聊就直接能用”，优先继承同一套本机配置和登录信息，不要求用户重复填写 Key；网页配置 Key 只能作为后续可选入口。
- 本试验自行采用了“不迁移产品层、只保留现有 UI 并切换执行器”的窄范围，该范围开发前没有获得用户明确确认。
- 新增了可切换的群聊执行器：默认仍使用现有 Codex 实现，只有显式选择 `orca` 才通过 Orca 官方 CLI 执行群聊 Agent 任务。
- 单人 Codex Web、Desktop/Web 连续性、远程入口和 UAC 处理均未切换到 Orca。
- 适配器已按 Orca `v1.4.161` 的公开 CLI 源码核对参数和 JSON 结构；当前电脑只完成离线模拟测试，没有真实启动 Orca。
- 代码模式验收已通过：9 个相关模块通过 `node --check`，13 个定向测试和 Windows 端全部 53 个 Node 测试通过，PowerShell AST 解析无错误。
- 当前电脑完整只读检查确认 `orca` CLI 不在 PATH，因此实机项为 `blocked`；本轮没有安装或启动 Orca。
- 真实 Windows + Orca + Codex TUI 链路仍需在原开发电脑验证，因此状态保持 `in_progress`。

## 目标与边界

本技术试验原定目标：

1. 不改变现有页面和 API 使用方式，只把群聊 Agent 的底层执行器做成可切换适配器。
2. Orca 模式下创建或复用每个 Agent 的 Terminal，发送现有角色提示和群聊上下文。
3. 把 Orca 的 `working / blocked / waiting / done` 映射为现有群聊状态、增量回复和最终消息。
4. Orca 不可用时明确失败，不静默切回 Codex；默认 Codex 模式保持原行为。
5. 先验证公开 CLI 边界，确认体验成立后再决定是否深入 Fork 或接入 Orca 内部协议。

本技术试验明确未做：

- 不替换现有 UI、单人对话、PWA 或公网入口；
- 不构建、打包或发布 Orca Fork；
- 不接入 Orca 官方登录、Relay、自动更新或遥测；
- 不宣称解决 UAC、服务应急恢复或 Desktop/Web 同任务检测；
- 不先实现复杂任务 DAG、并行调度或完整公司 Agent 组织模型。

## 架构与数据链路

```text
现有群聊 UI / API / SSE / Artifact
              |
              v
       Group Executor 契约
        /               \
 codex（默认）       orca（显式开关）
                         |
                         v
 Orca CLI --json -> Orca Runtime -> Codex TUI Terminal
                         |
                         v
 worktree ps 状态与 lastAssistantMessage
                         |
                         v
 现有群聊状态、增量回复、最终消息与 Artifact
```

当前 CLI 调用范围：

- `status`：检查 Runtime 是否 `ready`；
- `repo add`、`worktree show`：首次任务时确保项目已登记；
- `terminal list/show/create/wait/send`：重新认领、创建、等待和发送 Agent 任务；
- `worktree ps`：轮询 Agent 状态与最近回复。

Web 服务重启后，下一次任务会按固定标题重新找到仍存活的 Agent Terminal，减少重复创建；但当前不会自动恢复跟踪重启前已经在执行的任务。

## 当前实际体验与预期体验

| 场景 | 当前实现 | 原电脑验证后的预期体验 | 当前未验证边界 |
| --- | --- | --- | --- |
| 默认启动 | 使用原 Codex 群聊执行器 | 用户原有群聊不受影响 | 尚未做完整回归构建 |
| Orca 模式启动 | `-AgentRuntime orca`，项目 API 显示 `agentRuntime: orca` | 页面不换，群聊任务交给 Orca Terminal | 当前电脑没有真实启动 Orca |
| 第一次 Agent 任务 | 检查 Runtime/项目，创建对应 Terminal 并等待 TUI 空闲 | 群里显示连接、工作状态、增量和最终回复 | Codex TUI 就绪识别和真实时序 |
| 后续同 Agent 任务 | 复用内存映射；服务重启后可按标题重新认领空闲 Terminal | 不重复打开一批 Terminal，不把需求塞进忙碌 Agent | 执行中重启后的自动恢复未实现 |
| Orca 卡在交互提示 | 读取 `terminal wait` 的真实 blocked reason 并失败 | 用户看到明确原因，不出现假“正在执行” | 仍需验证各类 Codex 提示文本 |
| 多 Agent | 目标 Agent 按单队列顺序各执行一次 | 基础消息可靠后再定义协作规则 | 尚未复刻项目经理二次汇总与邀请逻辑 |
| Artifact | 继续复用现有输出 Job 和发布入口 | 开发 Agent 仍可产出原有 HTML/PDF 等成果 | 真实端到端未验证 |

## 开发计划与决策

1. 先以公开 CLI 做窄适配，不直接绑定 Orca 内部 WebSocket/RPC，降低第一阶段耦合。
2. Orca 源码独立放置，不使用 Submodule，不把其上万文件合入现有 Demo 仓库。
3. 默认 Runtime 保持 `codex`；Orca 必须显式开启，便于失败时直接回退。
4. 原开发电脑先跑只读验收，再进行一次真实单 Agent 任务；不在当前电脑安装、构建或启动 Orca。
5. 只有单 Agent、连续第二轮、失败提示、长任务和 Artifact 基本成立后，才讨论停止、追加、断线恢复和多 Agent 协作。

## 只读验收入口

当前电脑只检查代码：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows/scripts/verify-orca-route2.ps1 -SkipRuntime
```

原开发电脑完整检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows/scripts/verify-orca-route2.ps1 -OrcaCli orca
```

完整检查不会启动 Orca、安装依赖、登记项目或修改配置；未就绪项会标为 `blocked`。

## 问题记录

| issue_id | 分类 | 状态 | 现象与根因 | 正确方向 |
| --- | --- | --- | --- | --- |
| `FEAT-010-I01` | 特例 | active | 当前 `agentRuntime` 只控制群聊执行器，名称容易被理解为整个产品 Runtime | API 和文档明确范围；真实体验稳定后再决定是否重命名 |
| `FEAT-010-I02` | 特例 | active | Web 服务可启动不代表 Orca Runtime 已就绪；真实检查发生在首个群聊任务 | 使用只读验收脚本提前检查 CLI、Runtime 和项目登记 |
| `FEAT-010-I03` | 特例 | active | `worktree ps` 是轮询快照，`lastAssistantMessage` 也是最长 8 KB 的最近回复，不是持久事件流 | 先验证实际稳定性；不把当前实现描述为完整断线重放 |
| `FEAT-010-I04` | 特例 | mitigated | 仅用内存保存 Agent Terminal 会在 Web 服务重启后重复创建 | 已增加按固定标题重新认领存活 Terminal；执行中任务恢复仍未实现 |
| `FEAT-010-I05` | 特例 | mitigated | `terminal wait` 在未满足时会非零退出但仍返回有效 JSON，旧处理会误报为 CLI 进程失败 | 已保留结构化结果并向上报告真实 blocked reason，定向测试通过 |
| `FEAT-010-I06` | 特例 | active | 当前多 Agent 只顺序执行一次，未复刻原 Codex 实现的提及邀请和项目经理二次汇总 | 先在真实 Orca 中验证单 Agent，再按用户确认的协作规则补齐 |
| `FEAT-010-I07` | 特例 | mitigated | 任务送达后一次 `worktree ps` 瞬断会让网页误报失败，但 Agent 仍在 Terminal 继续 | 已增加有限重试；连续失败才标记“失去跟踪，任务可能仍在运行”，不再写成确定执行失败 |
| `FEAT-010-I08` | 特例 | mitigated | Web 服务关闭时，已收到的半截流式内容曾可能被保存为正式 Agent 回复 | 关闭时只停止网页跟踪，不保存半截回复，也不强制关闭 Orca Terminal |
| `FEAT-010-I09` | 特例 | active | Orca `lastAssistantMessage` 最长只有 8,000 字符，不能作为任意长度的完整回复来源 | 达到上限时明确标为“不完整预览”并提示去 Terminal 核对；完整回复提取仍待真实链路设计 |

## 版本时间线

### 2026-07-29 17:15 +08:00 | v0.1.0 | in_progress

- 计划：建立路线 2 的最小可回退边界，不迁移现有 UI。
- 实际：新增 Group Executor 契约和 Orca CLI 适配器；启动脚本支持 Runtime 选择；项目 API 返回当前选择；新增只读验收脚本和定向测试。
- 偏差：原计划中的真实 Orca 验证留到原开发电脑；当前只按 `v1.4.161` 源码校对并完成模拟测试。
- 问题：记录 `FEAT-010-I01` 至 `FEAT-010-I09`；其中 Terminal 重新认领、非零等待结果、查询瞬断和关闭半截消息已代码缓解。
- 验证：9 个相关模块通过 `node --check`；13/13 定向 Node 测试与 Windows 端 53/53 Node 测试通过；`start-web-demo.ps1` 与验收脚本 PowerShell AST 解析无错误；完整只读检查确认当前电脑缺少 Orca CLI；未构建、未安装、未启动服务或 Orca。
- 用户可见变化：默认无变化；显式 Orca 模式下，现有群聊可把 Agent 任务交给 Orca Terminal，并继续使用现有状态、消息和 Artifact 入口。
- Git：与本次实现同一提交。

## 下一步

1. 在原开发电脑运行完整只读验收，记录实际 Orca 版本、CLI 路径、Runtime 和项目登记状态。
2. 用 Orca 模式完成一轮真实群聊任务，再连续执行第二轮，确认不重复上一轮最终消息。
3. 验证 Orca 不运行、CLI 不存在、TUI 被提示阻塞时的群聊失败信息。
4. 验证一次真实 Artifact 请求和一次 5 分钟以上任务。
5. 根据真实结果再决定是否实现停止、追加、执行中服务重启恢复和多 Agent 协作逻辑。
