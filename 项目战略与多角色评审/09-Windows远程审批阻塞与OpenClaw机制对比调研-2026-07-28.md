# Windows 远程审批阻塞与 OpenClaw 机制对比调研

调研日期：2026-07-28

项目基线：`origin/codex/publish-current-panel`，提交 `19672cd2f745cb8fee954ed1331d1dc439d5d02b`

用途：内部技术决策、外部架构评审、后续修复方案设计

状态：调研结论，不代表已经完成代码修复

## 一、执行摘要

当前问题属于严重的远程可用性与控制平面缺口。

项目已经能够识别 Codex 正在等待审批，并把页面状态显示为“需要在电脑端确认”，但没有实现审批请求的保存、远程展示、风险判断和结果回写。因此，只要 Codex app-server 发出审批或补充信息请求，远程任务就可能无限等待。

这类问题需要与真正的 Windows UAC 弹窗严格区分：

- **Codex 内部审批**：属于 app-server JSON-RPC 协议，可以通过完善客户端协议、远程审批中心和策略引擎解决。
- **Windows UAC 安全桌面**：属于操作系统提权边界，普通网页、未提权服务或常规 Agent 不应尝试远程点击。正确方式是减少触发、预先部署受控服务，或使用窄权限的提权代理。

OpenClaw 较少出现“电脑弹窗导致远程能力全部失效”，不是因为它能够绕过 Windows，而是因为它将审批设计成 Gateway 的正式业务对象，并在执行前通过权限模式、白名单、自动审查、远程审批和失败回退处理请求。

建议借鉴 OpenClaw 的控制平面设计，但不建议直接在生产环境全局启用 `approvalPolicy = never` 或 `danger-full-access`。本项目需要采用“协议补全、远程审批、策略前置、自动审查、UAC 隔离”的分层方案。

## 二、问题定义与影响

### 2.1 用户可见现象

典型过程如下：

1. 用户通过 Web 或远程设备发起任务。
2. Codex 执行到需要命令、文件、网络、MCP 或补充信息确认的步骤。
3. 电脑端出现审批提示，或者 app-server 进入等待审批状态。
4. Web 端只能显示“等待电脑端审批”，不能批准或拒绝。
5. 用户不在电脑旁时，当前任务停止；依赖同一执行环境的后续功能也可能表现为不可用。

### 2.2 业务影响

- 远程控制的核心价值被本地弹窗中断。
- 长任务、无人值守任务和多 Agent 流程无法可靠完成。
- 页面显示“正在等待”，但没有恢复路径，用户难以判断是正常等待还是系统故障。
- 如果通过全局关闭审批规避，会把可用性问题转化为安全问题。
- 在未来多人或公网使用场景中，审批责任人、权限范围和审计记录都不明确。

## 三、当前项目逻辑核查

### 3.1 app-server 客户端没有处理服务端请求

关键文件：`windows/server/app-server-client.mjs`

当前消息处理逻辑是：只要 JSON-RPC 消息带有 `method`，就调用监听器并直接进入下一条消息。该逻辑没有区分：

- 普通响应：有 `id`，没有 `method`；
- 服务端通知：有 `method`，没有 `id`；
- 服务端请求：同时有 `method` 和 `id`。

Codex 审批和补充信息请求属于第三类。客户端收到后必须使用相同 `id` 返回 `{ id, result }` 或 `{ id, error }`。当前客户端只实现了向 app-server 发起请求及接收响应，没有实现响应 app-server 主动请求的能力。

这是本问题的直接技术根因，可以概括为：**当前自定义客户端只实现了 JSON-RPC 的一半方向。**

### 3.2 执行跟踪器只更新状态

关键文件：`windows/server/execution-tracker.mjs`

当前处理方式：

- 收到 `*/requestApproval`，发布 `waitingOnApproval`，显示“需要在电脑端确认”；
- 收到 `item/tool/requestUserInput` 或 `mcpServer/elicitation/request`，发布 `waitingOnUserInput`；
- 不保存完整请求，不建立待处理审批对象，不返回处理结果。

因此页面能看到“被卡住”，但无法解决“为什么被卡住”。

### 3.3 多 Agent 服务同样只显示等待

关键文件：`windows/server/multi-agent-service.mjs`

多 Agent 路径收到审批请求后，仅将 Agent 状态设置为“等待电脑端审批”。这意味着单会话和多 Agent 流程存在相同缺口，后续增加 Agent 数量不会改善问题，反而可能增加并发等待和责任不清。

### 3.4 服务端和 Web 端没有审批接口

关键文件：

- `windows/server/request-handler.mjs`
- `web-ui/src`

当前没有发现以下能力：

- 查询待审批请求的 HTTP API；
- 批准、拒绝或取消请求的 API；
- 审批请求的 SSE 事件；
- Web 端审批详情与风险提示；
- 审批人、时间、决定和规则变更的审计记录。

### 3.5 线程启动没有明确审批策略

关键文件：`windows/server/app-server-conversation-store.mjs`

当前 `thread/start`、`thread/resume` 和 `turn/start` 没有显式传入 `approvalPolicy`、`sandbox` 或 `approvalsReviewer`。实际审批行为依赖当前 Codex 安装和本机配置，因此不同电脑、不同版本或不同用户配置可能产生不一致结果。

### 3.6 项目文档已经记录该限制，但优先级不匹配

`docs/feature-development/features/FEAT-001-single-codex-web.md` 中的 `FEAT-001-I11` 已记录：Web 暂时不能处理 Codex 内部审批和补充提问，并将其列为低优先级。

根据当前产品目标，该问题不应继续被视为低优先级特例。只要产品强调远程执行、长任务或多 Agent，这一能力就是基础可靠性要求，建议提升为 P0。

## 四、Codex app-server 的正式协议要求

Codex app-server 官方文档列出的服务端请求包括：

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/tool/requestUserInput`
- `mcpServer/elicitation/request`
- 兼容性请求 `applyPatchApproval`
- 兼容性请求 `execCommandApproval`

这些请求带有 JSON-RPC `id`，客户端必须返回匹配的响应。命令审批支持允许一次、当前会话允许、拒绝、取消，以及在适用情况下附带执行策略修订；文件修改审批也支持会话级允许。

OpenAI 官方 Python SDK的处理方式可作为直接参考：当消息同时包含 `method` 和 `id` 时，将其识别为服务端请求，交给 `on_request` 处理器，再写回对应的 `{ id, result }`。这进一步证明当前项目缺失的不是 UI 小功能，而是协议适配能力。

## 五、OpenClaw 的处理逻辑

### 5.1 审批是 Gateway 的正式对象

OpenClaw 的 Gateway 统一管理会话、工具、节点、事件和审批。执行需要确认时，系统产生带有唯一 ID 的审批事件，而不是仅依赖某台电脑上的模态弹窗。

相关流程包括：

- Gateway 广播 `exec.approval.requested`；
- 客户端、Web 或聊天渠道接收审批；
- 授权用户调用 `exec.approval.resolve`；
- 结果回到原执行流程；
- 请求过期或无客户端处理时执行预设 fallback。

因此，审批跟随任务和 Gateway，而不是绑定某个桌面窗口。

### 5.2 策略在执行边界之前生效

OpenClaw Exec Approvals 使用两组核心策略：

- `security`：`deny | allowlist | full`
- `ask`：`off | on-miss | always`

其基本逻辑是：

- 明确禁止的操作直接拒绝；
- 已进入白名单的命令无需重复打断用户；
- 未命中规则时，根据 `ask` 决定是否生成审批；
- 无法完成远程审批时，根据 fallback 明确拒绝或按受限规则执行。

这避免了“所有命令都弹窗”和“无人处理就永久等待”两个极端。

### 5.3 Codex Harness 主动拥有审批策略

OpenClaw Codex Harness 提供权限模式，而不是完全继承桌面端的偶然配置：

- `default` / `auto`：由 Guardian 路径负责审批判断，使用受控沙箱；
- `yolo`：设置 `approvalPolicy = never`、`sandbox = danger-full-access`，仅适合用户明确认可风险的可信本地环境。

Guardian 路径的价值是让低风险审批由策略或自动审查处理，避免每个命令都变成聊天或桌面审批。高风险请求仍可以被拒绝。

### 5.4 Windows 部署减少日常 UAC

OpenClaw 在 Windows 上采用常驻 Gateway，并支持 Windows Hub 或 WSL2。依赖和后台服务在用户在场时完成一次部署，日常 Agent 命令运行在稳定的非管理员环境中。

这不会绕过真正的 Windows UAC，但能够减少反复启动需要管理员权限的原生进程，从而显著降低远程会话被 UAC 安全桌面中断的概率。

## 六、OpenClaw 较少出现该问题的真实原因

综合判断，原因不是单一功能，而是四层机制共同作用：

1. **预防**：权限模式、沙箱和白名单先消化大量低风险请求。
2. **接管**：Guardian 或自动审查拥有审批决策职责。
3. **远程处理**：剩余审批通过 Gateway 事件传递给可用客户端，而不是只显示在本机。
4. **失败收敛**：审批超时或无人处理时明确拒绝，不让执行流程无限悬挂。

换句话说，OpenClaw 不是“没有审批”，而是“审批不会只存在于无人操作的桌面弹窗里”。

## 七、建议的目标架构

### 7.1 第一层：补全 app-server 协议

这是必须首先完成的根修复。

`app-server-client.mjs` 应明确区分三类消息，并增加：

- 服务端请求分发器；
- `respondToServerRequest(id, result)`；
- `respondToServerRequestError(id, error)`；
- 请求超时、取消和幂等处理；
- app-server 退出或重连后的未决请求处理；
- 未识别请求默认安全拒绝，而不是静默忽略。

### 7.2 第二层：建立 ApprovalRequest 业务对象

建议至少包含：

- 请求 ID；
- thread、turn、item、agent 标识；
- 请求类型；
- 命令、路径或问题摘要；
- Codex 给出的理由与权限要求；
- 风险等级；
- 创建时间与过期时间；
- 当前状态；
- 决定、审批人和决定时间；
- 是否创建会话级规则；
- 原始请求的受限审计副本。

建议接口：

- `GET /api/approvals`
- `GET /api/approvals/:id`
- `POST /api/approvals/:id/resolve`
- SSE：`approval.requested`
- SSE：`approval.resolved`
- SSE：`approval.expired`

Web 端至少提供：允许一次、当前会话允许、拒绝、取消。页面必须显示实际命令、工作目录、目标路径、网络目标和风险原因，不能只显示“是否允许”。

### 7.3 第三层：建立策略引擎

建议默认规则：

| 操作类型 | 默认处理 |
| --- | --- |
| 工作区内只读查询、状态读取 | 自动允许 |
| 已验证的项目构建、测试、格式化命令 | 白名单允许 |
| 工作区内普通文件修改 | 根据当前任务授权和沙箱处理 |
| 安装依赖、访问网络、工作区外写入 | 远程审批 |
| 删除、覆盖、Git push、发布、外部消息 | 强制审批 |
| 服务、注册表、凭证、支付、账户权限 | 禁止自动批准 |
| 未识别请求 | 安全拒绝并给出原因 |

“当前会话允许”应映射到 Codex 的 `acceptForSession` 或受限的执行策略修订。规则必须绑定具体命令前缀、路径、主机或会话，不能演变为永久全局放行。

### 7.4 第四层：可选的自动审查

对于低风险和中风险请求，可以使用 Codex `approvalsReviewer = auto_review`，或实现类似 OpenClaw Guardian 的审查层。

自动审查不得批准：

- 操作系统提权；
- 读取或修改凭证；
- 注册表、系统服务和安全配置变更；
- 不受限的工作区外路径；
- 大范围删除或不可恢复覆盖；
- 付款、发布、推送和代表用户发送外部消息；
- 无法解释影响范围的命令。

### 7.5 第五层：单独隔离 Windows UAC

真正的 UAC 安全桌面不属于 Codex app-server 审批，不能通过上述 JSON-RPC 接口处理。

建议顺序：

1. 安装和初始化阶段由用户在电脑前一次性完成管理员操作。
2. 日常 Gateway 和执行 Worker 使用普通用户权限运行。
3. 优先将可重复命令放入 WSL2、容器或固定 Worker 环境。
4. 必须提权时，使用签名、白名单化、参数受限的 elevated broker 或计划任务。
5. 每次调用携带明确操作 ID、目标资源和审计记录。
6. 禁止提供通用管理员 Shell，未知提权请求仍要求本地确认。

## 八、不建议采用的方案

### 8.1 全局开启 `never` 或 `yolo`

优点是实现快、弹窗少；缺点是远程提示词注入、错误命令或越权工具可以直接影响整台电脑。该模式只能作为明确标记的个人可信环境选项，不能成为公网、多用户或默认生产配置。

### 8.2 自动点击 Windows UAC

该方案破坏操作系统安全边界，兼容性差，也容易变成通用提权通道，不应采用。

### 8.3 只增加一个“批准”按钮

如果没有协议回写、风险信息、身份验证、超时和审计，单独增加按钮无法形成可靠审批系统，并可能批准已经失效或被替换的请求。

### 8.4 继续只显示等待状态

状态展示不能代替控制能力。继续维持当前逻辑意味着远程执行仍然不完整。

## 九、实施优先级与验收标准

### P0：协议补全与基本远程审批

- 正确识别所有带 `method + id` 的服务端请求；
- 可以从 Web 端允许或拒绝命令和文件请求；
- app-server 收到匹配 `id` 的结果；
- 拒绝、取消、超时后任务能够结束或继续，不无限等待；
- 未支持请求默认拒绝并记录。

### P1：策略、会话规则和审计

- 支持 allowlist、on-miss 和会话级允许；
- 显示完整影响范围；
- 记录审批人、时间、请求内容和结果；
- 多 Agent 并发审批不会串线或重复处理；
- 手机断线重连后仍能看到未决审批。

### P2：自动审查与 UAC 隔离

- 低风险请求可自动审查；
- 高风险规则不可被自动审查绕过；
- Windows 后台运行不依赖日常管理员权限；
- 必须提权的操作通过窄权限 broker 完成；
- 真实 UAC 与 Codex 内部审批在 UI 中明确区分。

## 十、最终判断

该问题不是普通体验缺陷，而是当前远程 Agent 产品闭环缺失的一部分。项目已经具备任务发送、状态同步和多 Agent 展示，但缺少“请求授权并恢复执行”的控制链路。

最适合借鉴 OpenClaw 的不是界面，也不是无条件关闭审批，而是以下设计原则：

- Gateway 持有审批状态；
- 审批是可查询、可路由、可审计的业务对象；
- 安全策略在执行边界生效；
- 低风险操作尽量不打断用户；
- 高风险操作始终可控；
- 无人处理时明确失败，不永久卡住；
- 操作系统提权与 Agent 内部审批分层处理。

建议将 `FEAT-001-I11` 从低优先级提升为 P0，并先完成协议和数据模型设计，再进入代码实现。

## 十一、主要资料来源

### OpenAI / Codex 官方

- Codex app-server 协议：<https://developers.openai.com/codex/app-server>
- OpenAI Codex Python SDK 客户端实现：<https://github.com/openai/codex/blob/main/sdk/python/src/openai_codex/client.py>
- Codex 配置说明：<https://developers.openai.com/codex/config-reference>

### OpenClaw 官方

- Exec Approvals：<https://docs.openclaw.ai/tools/exec-approvals>
- Codex Harness：<https://docs.openclaw.ai/plugins/codex-harness>
- Gateway 架构：<https://docs.openclaw.ai/concepts/architecture>
- Windows 平台与 WSL2：<https://docs.openclaw.ai/platforms/windows>

### Microsoft 官方

- UAC 与安全桌面策略：<https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/security-policy-settings/user-account-control-allow-uiaccess-applications-to-prompt-for-elevation-without-using-the-secure-desktop>

## 十二、事实、推断与待验证项

- **已验证事实**：当前项目没有响应 app-server 服务端审批请求的代码路径，也没有 Web 审批 API。
- **已验证事实**：Codex 官方协议要求客户端响应带 `id` 的审批及用户输入请求。
- **已验证事实**：OpenClaw 将执行审批通过 Gateway 事件和策略进行处理，并提供权限模式和 fallback。
- **工程推断**：当前用户遇到的大多数“授权弹窗后远程失效”更可能首先来自 Codex 内部审批链路缺失。
- **待现场验证**：用户实际遇到的每一次弹窗是否为 Codex 审批、Windows UAC，或第三方安装程序弹窗。实施前应采集弹窗截图、app-server 原始消息类型和对应日志，以确定占比。
