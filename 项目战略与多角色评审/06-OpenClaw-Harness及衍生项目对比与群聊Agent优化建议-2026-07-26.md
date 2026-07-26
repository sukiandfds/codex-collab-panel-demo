# OpenClaw、Harness 及衍生项目对比与群聊 Agent 优化建议

文档日期：2026-07-26
研究对象：OpenClaw、Harness / Harness AI，以及与 OpenClaw 记忆、多 Agent 协作、运行治理有关的衍生项目
文档性质：技术与产品研究结论，不是已经确认的产品定案
适用范围：`codex-collab-panel-demo` 当前单项目群聊与多 Agent 功能

## 一、研究目的

本次调研不只比较功能数量，而是回答以下问题：

1. OpenClaw 为什么能够让助手长期存在、跨渠道工作并逐渐积累记忆？
2. Harness 如何减少开发和交付过程中的重复错误？
3. OpenClaw 的多 Agent 及其衍生项目，哪些机制适合当前项目，哪些只是表面上的多 Agent？
4. 当前群聊 Agent 为什么仍然像几段角色 Prompt，而不是能够长期学习、相互监督的 AI 员工？
5. 怎样让 Agent 不断进步，同时避免错误记忆、身份串线、无限讨论和高风险操作？

这里所说的“不会踩雷”不能理解为保证模型永不出错。现实可实现的目标是：

- 已经识别的问题不再重复发生；
- 高风险行为由系统规则阻止，而不是依赖模型临场记忆；
- 未知错误发生后能够被完整追溯、归因并转化为新的防再犯规则；
- Agent 的改进必须有证据、审查和回归验证，不能因为一次模型总结就永久改变行为。

## 二、名称与范围澄清

### 2.1 OpenClaw

本报告中的 OpenClaw 指：

- 官方仓库：<https://github.com/openclaw/openclaw>
- 官方定位：运行在用户设备上的个人 AI 助手与本地优先 Gateway
- 本次核查版本背景：GitHub 最新发布为 `v2026.7.1`，仓库仍在高频更新

OpenClaw 的核心不是一个群聊页面，而是一个持续运行的 Agent 控制平面，负责渠道、会话、工具、工作区、记忆、节点、权限和事件。

### 2.2 Harness

GitHub 上存在大量名称包含 Harness 的小型 Agent 项目。结合正式仓库、项目知名度和此前文档语境，本报告将 Harness 解释为：

- Harness Open Source：<https://github.com/harness/harness>
- Harness AI：<https://github.com/harness/harness-ai>
- Harness Skills：<https://github.com/harness/harness-skills>

Harness 不是群聊 Agent 框架。它首先是开发与交付平台，能力包括代码托管、CI/CD Pipeline、开发环境、制品、审批、策略、审计和失败恢复。Harness AI 再把这些能力封装为 Skills、MCP 工具、工作区规则和治理 Hook，提供给 Codex、Claude Code、Cursor 等编码助手。

因此，OpenClaw 与 Harness 不能按“谁的群聊更好”直接比较。两者分别代表：

- OpenClaw：助手如何长期存在、接收消息、保持身份与记忆；
- Harness：工作如何被标准化、验证、审批、诊断、回滚和审计。

## 三、OpenClaw 核心能力分析

### 3.1 长处

#### 常驻 Gateway 与多渠道入口

OpenClaw 使用本地优先 Gateway 统一管理会话、渠道、工具和事件，可以连接 WebChat、Slack、Discord、Telegram、WhatsApp、飞书等渠道。助手不是打开网页后才存在，而是可以作为常驻服务持续接收任务。

对本项目的价值：

- 手机、网页和其他消息入口不需要各自重新实现一套 Agent；
- 渠道只是入口，Agent 的身份、会话和工作区由 Gateway 维护；
- 可以把“当前电脑上的 Agent 是否在线”建模为真实节点与连接状态。

#### Agent 隔离与确定性路由

OpenClaw 的每个 Agent 可以拥有独立的：

- Workspace；
- `AGENTS.md`、`SOUL.md`、`USER.md`；
- 认证与模型配置；
- SQLite 会话存储；
- Skills 白名单；
- 沙箱和工具权限。

消息通过明确的 Binding 路由到某个 Agent，而不是让所有 Agent 同时阅读整个群聊并自由抢答。Agent 之间通信默认关闭，需要显式启用和授权。

对本项目的价值：

- 项目经理、开发、研究和审查 Agent 不应共用一个长期上下文；
- 私人记忆、项目记忆和团队共享记忆需要分开；
- 群内 `@Agent` 应映射为明确的任务路由，而不是只依赖模型输出中的名字。

#### 文件化长期记忆

OpenClaw 默认使用可阅读的 Markdown 记忆：

- `MEMORY.md`：长期事实、偏好、决定；
- `memory/YYYY-MM-DD.md`：每日工作记录；
- `DREAMS.md`：可选记忆整理与人工复核结果。

模型只会记住真正写入磁盘并在后续被加载或检索的内容，不假设存在隐藏长期状态。记忆检索支持关键词与向量混合搜索，也可以使用 QMD、Honcho、LanceDB 等后端。

OpenClaw 还明确区分“行动敏感记忆”：涉及审批、有效期、责任人和安全条件的内容，必须同时记录何时允许执行、何时过期以及应该避免什么。

对本项目的价值：

- 用户偏好不能只存在当前对话；
- 项目决定必须附带来源、确认人和有效状态；
- “记得某件事”与“被允许执行某件事”必须分开。

#### Skills、插件与运行时治理

OpenClaw 将能力拆成 Skills 和插件。Skills 提供可阅读的工作方法，插件提供运行时工具、Hook 和数据能力。危险工具可以通过沙箱、allow/deny、配对和审批控制。

对本项目的价值：

- 经验可以沉淀为可版本化的 Procedure 或 Skill；
- 真正的禁区需要运行时 Guard，而不是只写在 Prompt 里；
- 新能力应按功能边界增加，避免继续扩大一个多 Agent 服务文件。

#### Codex Harness 与 Supervision

OpenClaw 已提供 Codex Harness 与原生会话 Supervision，能够连接 Codex app-server、查看本地 Codex 会话、创建安全分支、读取有界历史，并区分持久化 Thread 与当前进程实际运行状态。

它没有假设多个客户端共享同一个 App Server 实例，也明确承认跨进程状态所有权不是自动统一的。这与本项目此前遇到的 Desktop/Web 状态差异属于同一问题。

### 3.2 局限与风险

#### OpenClaw 不是成熟的多人协作产品

OpenClaw 的 multi-agent 核心是“多个隔离 Agent + 渠道路由”，不是完整的项目群协作模型。它并不自动提供：

- 真人项目成员和组织关系；
- 群消息到任务、审批和交付物的完整关系；
- 多 Agent 的责任、审核和打回流程；
- 团队共同确认的项目决定；
- 可复盘的错误经验升级流程。

#### Workspace 不是安全边界

OpenClaw 文档明确说明 Workspace 只是默认工作目录。没有启用沙箱时，绝对路径仍可能访问主机其他位置。共享群聊中的 Prompt Injection 还可能借助 Agent 的工具权限读取或泄露数据。

#### 自动记忆会制造新的错误

OpenClaw 官方文档说明默认安装不会自动把所有每日记录正确整理成长期记忆；记忆压缩和 Dreaming 需要额外机制。公开 Issue 也显示：

- 旧记忆无法删除、冲突条目持续存在：<https://github.com/openclaw/openclaw/issues/95606>
- Dreaming 污染 `MEMORY.md` 和向量库：<https://github.com/openclaw/openclaw/issues/77831>
- Dreaming 在多 Agent 场景污染 Agent 身份：<https://github.com/openclaw/openclaw/issues/65374>
- Memory Search 使用过期缓存并返回错误零结果：<https://github.com/openclaw/openclaw/issues/111990>
- 群会话错误注入长期记忆：<https://github.com/openclaw/openclaw/issues/108881>

结论：记忆不能等同于事实，更不能自动等同于强制规则。

#### 多 Agent 仍存在并发与状态问题

公开 Issue 包括：

- 并发配置覆盖、Session Lock 失败、子任务脱离：<https://github.com/openclaw/openclaw/issues/43367>
- 多 Agent API 请求同时超时：<https://github.com/openclaw/openclaw/issues/43374>
- 缺少子 Agent 级联熔断：<https://github.com/openclaw/openclaw/issues/66010>
- 群事件不能自然分发给同群其他 Agent：<https://github.com/openclaw/openclaw/issues/89043>
- Control UI 缺少跨 Agent 调试视图：<https://github.com/openclaw/openclaw/issues/69364>

结论：Agent 数量增加会同时放大 Token、并发、状态、身份和记忆污染问题。

## 四、Harness 与 Harness AI 分析

### 4.1 长处

#### 将工作转成可重复的 Pipeline

Harness 的核心价值不是让 Agent 更会聊天，而是把工作拆成结构化阶段、步骤、依赖和状态。相同任务按照同一 Pipeline 执行，减少每次临场发挥。

Harness Skills 的共同控制流程包括：

1. 先确认账号、组织和项目范围；
2. 在创建依赖项之前验证所引用资源真实存在；
3. 在写入 Payload 前读取 Schema；
4. 不猜测缺失字段，不使用虚构占位值；
5. 修改性操作要求确认；
6. 使用结构化执行结果诊断失败。

这些原则直接适合本项目的 Agent 工作方式。

#### 失败策略、重试和回滚是正式结构

Harness Pipeline 将失败处理写进定义，而不是等错误发生后再问模型怎么办，例如：

- Retry；
- Abort；
- MarkAsFailure；
- StageRollback；
- PipelineRollback；
- 人工 Approval。

Agent 因此不需要在每次失败后自由猜测是否继续重试。

#### 审批、策略与审计

Harness 使用 RBAC、Approval、Policy-as-Code、审计报告、签名和供应链证据治理执行过程。Harness AI 进一步通过治理 Hook 在 Agent 创建 Pipeline 时复用模板、检查策略和阻止不合规配置。

对本项目的价值：

- 用户最新指令的权限等级需要由系统识别；
- 高风险操作需要明确 Approval 对象；
- 审查 Agent 的结论只有形成验证结果或审批记录才算完成；
- 开发 Agent 的最终输出应包含产物和验证证据，而不只是一段回复。

#### 结构化失败诊断

Harness 的 `debug-pipeline` Skill 先通过结构化诊断工具读取阶段、步骤、耗时、失败信息和日志，再输出：

- Failure Summary；
- Root Cause；
- Immediate Fix；
- Prevention。

这比让 Agent 只阅读最后一条报错消息更可靠，也适合作为本项目“经验如何形成”的标准格式。

### 4.2 局限

- Harness 不是聊天或多 Agent Runtime；
- 不负责用户偏好、Agent 人格和长期项目记忆；
- 主要围绕研发、部署和平台工程，不能直接覆盖产品、设计、营销等所有 Agent；
- 完整 Harness 平台较重，引入当前 Demo 会显著扩大部署与维护成本；
- Harness AI 的 Agent Template 等部分能力仍处于 Alpha；
- Harness 开源核心与商业平台能力边界需要逐项核对，不能把商业文档能力都当作可直接复用的开源代码。

结论：不建议把 Harness 作为群聊后端，但应借鉴其任务、审批、依赖、失败和证据模型。

## 五、相关衍生项目对比

| 项目 | 主要能力 | 长处 | 局限与风险 | 对当前项目的建议 |
| --- | --- | --- | --- | --- |
| [OpenClaw Mission Control](https://github.com/abhi1693/openclaw-mission-control) | Organization、Board、Task、Agent、Gateway、Approval、Activity | 最接近团队 Agent 运维控制台；UI 与 API 使用同一业务对象；审批与活动记录是正式能力 | 仍在快速开发；偏控制台与任务管理，不解决 Agent 如何形成可靠经验 | 重点借鉴 `Task / Agent / Gateway / Approval / Activity` 数据模型，不直接替换现有页面 |
| [Clawe](https://github.com/getclawe/clawe) | 多 Agent、Kanban、子任务、交付物、通知、Heartbeat | 每个 Agent 有独立工作区；共享 `WORKING.md` 与 `WORKFLOW.md`；任务和交付物比自由聊天清晰 | 依赖 Convex 和定时心跳；Agent 注册较静态；AGPL-3.0，直接复用代码需要考虑开源义务 | 借鉴工作区文件分层和任务状态，不直接复制代码 |
| [GBrain](https://github.com/garrytan/gbrain) | 混合检索、知识图谱、来源引用、冲突和缺口检测、程序记忆、持久任务队列 | 记忆不是简单向量搜索；强调来源、矛盾、过期和知识缺口；支持公司级权限切片 | 系统较重；部分性能和效果数据来自项目方自述；接入成本高 | 借鉴有来源的 Claim、冲突检测、程序记忆和经验评测，不在当前阶段整体引入 |
| [OpenClaw Supermemory](https://github.com/supermemoryai/openclaw-supermemory) | 自动捕获、自动召回、用户画像 | 接入简单，能在每轮自动提供相关历史 | 默认云端并要求付费计划；自动捕获存在隐私和错误记忆风险；需要允许对话访问和 Prompt 注入 Hook | 不作为默认项目记忆；可参考用户画像和命名空间设计 |
| [OpenClaw Auto-Dream](https://github.com/LeoYeAI/openclaw-auto-dream) | 分层记忆、重要性评分、衰减、归档、知识图谱、定时整理 | 明确区分长期、情节和程序记忆；具有人工可查看的 Dream Log | 自动整理结果仍由模型生成；可能放大错误归因；部分功能与新版 OpenClaw 内置 Dreaming 重叠 | 只借鉴记忆生命周期和候选晋升机制，不允许自动生成的经验直接成为规则 |
| [ClawKeeper](https://github.com/SafeAI-Lab-X/ClawKeeper) | Skill、Plugin、独立 Watcher 三层安全；命令、路径、预算、权限门禁 | 区分提示词约束与运行时强制；独立监督者可以阻止高风险行为；支持 Fail-Closed | 项目仍较早；规则会有误报和漏报；不能替代 OS 隔离和真实审批 | 借鉴独立监督 Agent、运行时 Guard、权限存储和审计，不依赖单一审查 Prompt |
| [openclaw-agents](https://github.com/shenhao-stu/openclaw-agents) | 多角色模板、每角色模型、群绑定、Taste Gate | 快速创建角色团队；允许按角色选择不同模型 | 角色主要由 Prompt 和模板定义；缺少持久任务、正式审批和完整证据链 | 可参考角色清单与模型分配，不把“角色更多”误认为“协作更成熟” |

## 六、当前群聊 Agent 的真实差距

当前实现主要位于：

- `windows/server/multi-agent-service.mjs`
- `windows/server/group-room-store.mjs`
- `web-ui/src/features/group-chat/`

### 6.1 当前已经具备

- 四个真实 Codex Agent；
- 项目经理、研究、开发和审查角色；
- `@Agent` 调度；
- 最近群聊上下文；
- 最多四轮的有限讨论；
- Codex app-server 实时状态和增量回复；
- 群消息、成员、附件和基础持久化。

### 6.2 当前关键问题

#### Agent 仍然主要是角色 Prompt

`group-room-store.mjs` 中的 Agent 区别主要来自静态 `instructions`。它们没有独立的能力清单、任务交付标准、经验记录、评测结果和版本。

#### 上下文只来自最近群消息

`multi-agent-service.mjs` 只抽取最近 18 条、最多 12000 字符的群消息。它没有根据当前任务检索：

- 用户长期偏好；
- 项目正式决定；
- 历史失败和防再犯规则；
- 相关文件与提交；
- 某个 Agent 的既往经验；
- 已经失效或互相冲突的结论。

#### Thread 与任务没有分离

每个 Agent 长期复用一个 `threadId`。随着任务增加，Thread 可能积累无关上下文。当前没有 `(ProjectRoom, AgentIdentity, Task) -> Codex Thread` 的正式映射，也没有任务结束后的归档和恢复边界。

#### 队列和运行状态不持久

当前只有内存中的 `workQueue` 和一个 `currentRun`。服务重启会丢失未完成任务；Agent 无法真正并行；失败后没有可靠的 Resume、Retry 或 Compensation。

#### Agent 邀请依赖自由文本

系统通过 Agent 回复中的 `@完整名称` 决定是否邀请下一位 Agent。这适合 Demo，但不是正式控制协议。模型输出、引用文本或 Prompt Injection 都可能触发意外调度，虽然当前四轮上限限制了损失。

#### 没有正式学习闭环

失败只产生一条系统消息，没有结构化保存：

- 发生了什么；
- 证据是什么；
- 根因属于特例还是普适问题；
- 当时采用了什么错误路径；
- 下次如何检测；
- 是否需要转成 Guard、Procedure 或回归测试；
- 谁确认这条经验有效。

#### 审查 Agent 没有真正的门禁权

审查 Agent 的回复与普通聊天消息相同。它不能阻止任务完成、要求补充证据、打回开发 Agent，或者产生正式的 Approval / Rejection。

## 七、推荐的能力模型

### 7.1 不采用“所有消息自动进入长期记忆”

群聊消息应分成不同类型：

- 普通聊天：不进入长期记忆；
- 候选事实：等待来源核实；
- 用户偏好：明确表达后立即记录，但允许用户查看和修改；
- 项目决定：需要确认人、来源和版本；
- 执行任务：形成独立 Task；
- 失败经验：先成为 Lesson Candidate；
- 禁止行为：形成代码执行的 GuardRule。

### 7.2 五类持久对象

#### Preference

记录用户明确的长期偏好。

建议字段：

- `id`
- `scope`：用户、项目、功能或会话
- `statement`
- `sourceMessageId`
- `confirmedBy`
- `createdAt`
- `updatedAt`
- `status`

#### Decision

记录正式项目决定，而不是聊天摘要。

建议字段：

- `decision`
- `sourceMessageIds`
- `owner`
- `effectiveFrom`
- `supersedes`
- `status`：candidate、confirmed、superseded、revoked

#### AgentRun

记录一次 Agent 任务的真实生命周期。

建议状态：

```text
queued
  -> scoping
  -> running
  -> reviewing
  -> waiting_approval
  -> completed
  -> failed / interrupted / rejected
```

建议字段：

- Task 与 Agent；
- 使用的 Thread；
- 输入上下文快照；
- 工具和权限；
- 状态事件；
- 产物；
- 验证证据；
- 错误分类；
- 重试与恢复信息。

#### Lesson

记录已经确认的失败经验或成功方法。

建议字段：

- 触发条件；
- 现象；
- 根因；
- 错误路径；
- 正确路径；
- 证据；
- 适用范围；
- 是否需要人工确认；
- 对应回归测试；
- 状态和版本。

#### GuardRule

记录必须由系统强制执行的禁区，例如：

- 未经许可不修改 UI；
- 禁止修改 Codex 原始 JSONL；
- 删除、发布、付费和对外发送需要审批；
- 单次讨论轮数和 Token 预算；
- 工具、路径和命令白名单；
- 一个运行实例的控制权和并发限制。

GuardRule 不能只注入 Prompt，必须在调度器或工具调用层检查。

### 7.3 三层记忆

```text
个人记忆
  用户偏好、私密信息、个人工作方式

Agent 专业记忆
  角色技能、已验证方法、该 Agent 的历史经验

项目共享记忆
  正式决定、共同规则、任务结果、已确认经验
```

默认不跨层读取。只有项目经理或明确授权的检索过程，才能把必要信息整理成当前任务上下文。

### 7.4 三层防错

```text
第一层：Prompt / Skill
  告诉 Agent 应该怎样做

第二层：Runtime Guard
  阻止 Agent 做不允许的事情

第三层：Independent Review
  独立检查结果、证据、风险和是否满足交付标准
```

只增加审查 Agent 不足以防错，因为审查 Agent 也可能受到相同上下文和模型偏差影响。真正高风险的限制必须由运行时规则执行。

## 八、推荐的学习闭环

```text
任务执行或讨论
  -> 产生结果、证据和错误
  -> 结构化归因
  -> 生成 Lesson Candidate
  -> 独立审查 Agent 检查证据与适用范围
  -> 用户或项目经理确认
  -> 升级为 Lesson / Procedure / GuardRule / Regression Test
  -> 后续任务按相关性检索并执行
  -> 统计是否再次发生
```

不同结果采用不同升级路径：

| 发现 | 应升级为 |
| --- | --- |
| 用户明确偏好 | Preference / 操作手册 |
| 项目正式选择 | Decision |
| 一次偶发错误 | Lesson Candidate |
| 可重复的正确流程 | Procedure / Skill |
| 高风险禁止行为 | GuardRule |
| 可以自动验证的问题 | Regression Test |
| 过时或错误记忆 | Superseded / Revoked，不直接删除证据 |

## 九、对当前项目的推荐路线

### 第一阶段：建立可追溯的 AgentRun

先不增加 Agent 数量，也不修改群聊视觉。

用户可见结果：

- 每次群聊任务都有独立编号和真实状态；
- 可以看到谁接收、谁执行、谁审核；
- 服务重启后任务状态不消失；
- 失败能够显示发生在哪个阶段，并支持明确重试或终止。

### 第二阶段：建立 Preference、Decision 与 Lesson

用户可见结果：

- 用户明确偏好不需要反复说明；
- 项目决定不会被普通聊天覆盖；
- Agent 在开始任务前会自动读取相关历史错误；
- 用户能看到本次任务实际引用了哪些规则和经验。

### 第三阶段：加入审查与运行时门禁

用户可见结果：

- 开发 Agent 完成后不会立刻宣布成功；
- 审查 Agent 根据交付标准和证据决定通过或打回；
- 高风险操作进入等待确认；
- 明确禁区即使模型忘记，也会被系统阻止。

### 第四阶段：Agent 能力版本化与评测

用户可见结果：

- 每个 Agent 有明确能力、工具、权限和交付标准；
- Skill 更新前后可以用历史案例比较；
- 只有表现确实改善的修改才进入正式版本；
- 可以选择适合角色的不同模型，但不能仅凭性格印象分配工作。

## 十、明确不建议的做法

1. 不把全部群聊记录注入每个 Agent。
2. 不让 Agent 自动把自己的总结直接升级为长期规则。
3. 不用增加更多角色掩盖任务和状态模型缺失。
4. 不让审查 Agent 与开发 Agent 共用完全相同的上下文和权限。
5. 不用自由文本 `@Agent` 作为正式任务协议。
6. 不在当前阶段整体迁移到 OpenClaw 或 Harness。
7. 不直接复制 Clawe 的 AGPL 代码进入当前项目，除非先确认许可证策略。
8. 不把“模型更聪明”当作防错机制；模型、记忆、流程、权限和验证必须分别设计。

## 十一、最终判断

OpenClaw 最值得借鉴的是：

- Agent 作为长期身份存在；
- 独立工作区、会话和记忆；
- 多渠道 Gateway；
- Skills 与插件边界；
- Codex Harness 与会话监督；
- 沙箱、权限和安全审计。

Harness 最值得借鉴的是：

- 任务结构化；
- 依赖和 Schema 先验证；
- 失败策略和回滚；
- 审批、策略和审计；
- 结构化根因与 Prevention；
- 产物和验证证据。

衍生项目最值得借鉴的是：

- Mission Control 的任务、审批与活动模型；
- Clawe 的 Agent 工作区和共享工作状态；
- GBrain 的来源、冲突、缺口和程序记忆；
- ClawKeeper 的独立 Watcher 与运行时 Guard。

当前项目不应成为 OpenClaw 的换皮，也不应接入完整 Harness。更合适的方向是：

> 在现有单项目群聊和 Codex Connector 基础上，建立持久化的 Task、AgentRun、Preference、Decision、Lesson、Approval 和 ActivityEvent；通过检索、审查、运行时门禁和回归验证，让 Agent 的经验真正积累，让已知错误越来越难再次发生。

## 十二、主要资料来源

### OpenClaw 官方

- 官方仓库：<https://github.com/openclaw/openclaw>
- Memory：<https://docs.openclaw.ai/concepts/memory>
- Multi-agent routing：<https://docs.openclaw.ai/concepts/multi-agent>
- Session：<https://docs.openclaw.ai/concepts/session>
- Security：<https://docs.openclaw.ai/gateway/security>
- Codex Harness：<https://docs.openclaw.ai/plugins/codex-harness>
- Codex Supervision：<https://docs.openclaw.ai/plugins/codex-supervision>

### Harness 官方

- Harness Open Source：<https://github.com/harness/harness>
- Harness AI：<https://github.com/harness/harness-ai>
- Harness Skills：<https://github.com/harness/harness-skills>
- Harness MCP Server：<https://github.com/harness/mcp-server>

### OpenClaw 衍生项目

- Mission Control：<https://github.com/abhi1693/openclaw-mission-control>
- Clawe：<https://github.com/getclawe/clawe>
- GBrain：<https://github.com/garrytan/gbrain>
- Supermemory Plugin：<https://github.com/supermemoryai/openclaw-supermemory>
- Auto-Dream：<https://github.com/LeoYeAI/openclaw-auto-dream>
- ClawKeeper：<https://github.com/SafeAI-Lab-X/ClawKeeper>
- openclaw-agents：<https://github.com/shenhao-stu/openclaw-agents>
