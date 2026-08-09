# FEAT-002 更新记录

### 2026-08-10 | 员工页成长闭环与审批重试保护

- 用户可见变化：进入独立员工项目页后，可以在同一页面看到最近成长事实、待审批建议，并直接批准或拒绝；审批中的旧轮询或 SSE 结果不会把页面状态改回去。
- 实现：`employee.html`/`employee.js` 接入 `/api/employee-growth` 读取、事件刷新和审批；成长存储在写入失败时回到可重试的 `pending` 状态，React 与独立员工页都使审批期间的旧读取失效。
- 验证：待完成 `pnpm build:ui`；未启动或重启服务，未做浏览器运行态验收。
- Git：`uncommitted`，未提交、未推送。

### 2026-08-10 | Agent 切换读取保护

- 用户可见变化：切换 Agent 后，“本次成长”只显示当前 Agent 的事实和建议，不会被上一个 Agent 的迟到轮询或 SSE 读取结果覆盖。
- 实现：`useEmployeeGrowth` 为每次读取建立请求代次，并将轮询和事件刷新绑定到当前 Agent 的 `AbortController`；旧响应只丢弃，不改变审批和后端存储。
- 验证：`pnpm build:ui`、`git diff --check` 通过；未启动或重启服务，未做浏览器运行态验收。
- Git：`uncommitted`，未提交、未推送。

### 2026-08-09 12:59 +08:00

- 技术验收：在 `http://127.0.0.1:9460/?token=agent-share-demo` 的桌面视口完成一轮“带到群聊”操作；分享按钮保持可见，目标群列表要求用户点击确认，发送后单聊显示“已发送”。
- 移动端验收：使用 `390x844` 视口重复流程；目标群选择框完整位于屏幕内，群选项可点击，发送后返回单聊并显示“已发送”，分享按钮仍可见。
- 运行态证据：群聊快照从 55 条增至 56 条，新增一条消息的 `authorId/agentId=manager`，正文与选中 Agent 回复一致；本轮没有触发其他 Agent。
- 验证：Agent 定向测试 13/13 通过，`pnpm build:ui` 通过，`git diff --check` 通过；全量 Windows Node 测试 121 项中 120 项通过，唯一失败仍是既有 `conversation-routes.test.mjs` 广播 mock 参数断言。
- 状态：`code_ready_pending_user_review`；技术验收完成，仍待产品侧按 11 项标准确认并决定是否签收。

### 2026-08-09 02:02 +08:00

- 入口兼容补齐：分享能力现在同时覆盖 `/` 和仍可用的 `/group.html`，避免从历史群聊入口进入时缺少“带到群聊”；保留单聊原有分支/发送行为，并在 `App.tsx`、`ConversationView.tsx`、`MessageActions.tsx` 和会话数据层补齐 direct Agent/share 参数。
- 验证：`pnpm build:ui` 通过；全量 Windows Node 测试 116 项中 115 项通过。唯一失败仍是既有 `windows/tests/conversation-routes.test.mjs` 广播参数断言，本轮没有修改该路由；`git diff --check` 通过。
- 运行态：9460 的目标群列表接口返回 200；重复提交既有 `requestId` 返回 `deduplicated: true` 且群消息数量不增加。为避免中断已有活动任务，本次静态入口补丁未强制重启 9460；根入口当前可用，`/group.html` 的补丁将在下一次受控重启后生效。
- 当前人工验收边界：接口、原文/身份、目标群隔离、幂等和旁路不调度已由定向测试与运行态检查覆盖；电脑和手机的最终点击体验仍由用户按 11 项标准检查。

### 2026-08-09 技术实现完成 +08:00

- 状态：code_ready_pending_user_review
- 本轮用户可见变化：群内 Agent 详情保留原抽屉，并提供“发消息”入口进入该 Agent 的完整单聊；已完成的 Agent 回复操作区在“从这里继续”旁新增“带到群聊”，点击后必须由用户选择目标群，发送后仍停留在原单聊并显示结果。
- 旁路实现：保留单聊原有分支/发送逻辑；在 `web-ui/src/features/conversations/**` 与 `App.tsx` 接入 direct Agent 路由和消息操作位，在独立 `web-ui/src/features/agent-sharing/` 提供分享 UI、目标群选择和反馈。
- 服务端复用：复用现有会话读取、群消息持久化、Agent 身份和 SSE 广播；新增 Agent/Runtime 会话绑定、群目录、纯发布服务和 `requestId` 幂等记录。发布服务不依赖 `multiAgent.enqueueDiscussion`，因此不会自动唤醒其他 Agent、创建任务或联动进度。
- 内容边界：服务端重新读取被选中的已完成 Agent 回复，只带文字/Markdown 原文；附件、图片、Artifact 和工具过程不复制；目标群由用户点击确认，原文不编辑、不预览、不二次总结。
- Runtime 边界：当前仅注册 Codex Adapter；绑定记录使用 `agentId + runtimeKind + runtimeSessionId`，旧 `threadId` 仅作为 Codex 兼容入口，未来可增加 OpenClaw/Hermes Adapter，不把 Agent 身份写死为 Thread 或 Project。
- 验证：`node --test windows/tests/agent-publication.test.mjs windows/tests/agent-share-routing.test.mjs windows/tests/group-room-store.test.mjs windows/tests/group-routes.test.mjs windows/tests/request-handler-routing.test.mjs` 全部通过；覆盖双群选择只写目标群、原文/身份、失败、幂等和不调度。`pnpm build:ui` 通过。全量 Windows 测试为 114 通过、1 个既有 `conversation-routes.test.mjs` 广播参数断言失败，本轮未修改单聊路由。
- 运行态：9460 演示服务已按最新代码重启，入口为 `http://127.0.0.1:9460/?token=agent-share-demo`；9360 原服务未重启。桌面和手机宽度选择面板、发送状态和旁路入口沿既有视口检查通过。
- 明确未做：未接入 OpenClaw/Hermes、未新增 Runtime 设置、未新增摘要编辑/来源链接/项目进度/总监绑定/自动协作/群聊管理；当前演示数据实际只有一个可用群，双群准确性通过隔离目录测试验证。

### 2026-08-08 22:33 +08:00

- 状态：ready_for_technical_handoff
- 本次产品决定：本轮只开发“将 Agent 单聊中的一条已完成摘要回复，原文带到用户明确选择的现有群聊”。用户从群聊 Agent 详情进入现有单聊，沿用现有上下文让 Agent 生成摘要，再从该回复已有的消息操作二级菜单选择新增的“带到群聊”。
- 用户操作规则：系统不得根据用户此前所在页面猜测目标群；Agent 按普通员工理解，用户必须从现有群聊中明确选择一个目标。摘要不编辑、不预览、不再次生成，发送后只在目标群新增一条由该 Agent 发出的消息。
- 复用范围：共用现有电脑/手机 Negus、群聊、Agent 详情、“发消息”、单人对话、上下文、助手回复操作、“开启新分支”和群消息发送反馈；“开启新分支”保留原行为。
- 新开发范围：消息菜单新增“带到群聊”、最小目标群选择、摘要文字与 Agent 身份发送到目标群、阻止该消息自动触发其他 Agent，以及电脑和手机验收。
- 明确不做：不建一人公司群聊，不绑定三位总监，不增加摘要编辑或来源链接，不自动讨论或建立任务，不联动项目进度，不新增群聊管理和权限，不接入或展示其他模型、CLI、OpenClaw、API 或运行服务。
- 长期背景：每个 Agent 未来可能使用不同模型或不同底层服务，甚至不使用 Codex；该方向已记录，但不进入本轮开发。
- 产品纠偏：记录了本轮未先核对真实页面、误称电脑限定、把已有 Agent 展示当新增、过早扩展三总监绑定、默认目标群、摘要编辑、来源跳转和运行服务展示等错误；这些错误曾迫使用户重复纠正并延迟交接，现以 `item.md` 的本轮开发交接章节为唯一范围依据。
- 文档基线：`434cb404169e018d64474ab3f76566c8ebaf5608`
- 用户可见的预计效果：用户不再手动复制摘要并粘贴到群聊；选择目标群后，摘要会以该 Agent 本人的一条消息出现在指定群中，其他群和其他 Agent 不受影响。
- 下一步：技术总监按 `item.md` 的流程、范围和 11 项验收标准完成最小开发，不继续扩展产品设计。

### 2026-08-06 23:24 +08:00

- 状态：code_ready_pending_user_review
- 本次更新：把单人对话和群聊从两个独立网页入口改为同一个 React 应用内切换。单人对话与群聊首次挂载后分别保留自己的状态；切换不再销毁原页面、重新创建整套应用或重新打开另一张 HTML 页面。
- 用户影响：点击“对话/群聊”时不再整页刷新；返回单人对话后，当前 Thread、页面状态和输入草稿不会因为切换被主动销毁。群聊使用自己的轻量本地快照并在后台预取，进入时优先显示已有内容，再后台同步最新数据。
- 布局变化：群聊接入与单人页相同的 `AppShell`、WindowBar、78px 顶部区域、侧栏宽度、内容宽度和手机 `visualViewport` 处理。群聊成员和 Agent 列表放入群聊自己的侧栏内容，不再使用独立三栏页面挤压消息区。
- 维护边界：两边共同调用公共外壳、视口处理和导航能力；单人对话继续独立维护 Thread/Turn/发送/流式状态，群聊继续独立维护 Room/Agent/消息/快照。群聊代码没有进入或改写单人对话核心状态。
- 兼容处理：历史 `/group.html` 入口继续可用，但加载后使用同一个应用；项目管理入口仍保持独立，不扩大本次范围。
- 验证：`pnpm build:ui` 通过；定向 `git diff --check` 通过；当前服务 `/` 与 `/group.html` 均返回 HTTP 200。未运行全量测试、未重启服务、未做自动化视觉测试。
- Git：产品完整提交 `21d3671f5cb4a761ef14a374e6405acb2f911bf1`，当前分支与 `origin/codex/publish-current-panel` 一致。
- 下一步：由用户直接在手机和电脑上检查首次进入群聊、往返切换、返回位置、输入草稿和键盘布局；发现具体异常后只修对应边界，再进入 M2。

### 2026-08-06 22:59 +08:00

- 状态：in_progress
- 本次更新：完成 M1 的第一组代码改动。群聊发送请求增加 `clientMessageId`；服务端对同一成员的同一客户端消息进行幂等写入并分配持久 `sequence`；前端发送后立即插入临时消息并清空输入框，SSE 或接口正式消息到达时按消息 ID/客户端 ID 原位对账；请求失败时只撤回对应临时消息。
- 用户影响：文本消息不再必须等服务器响应后才出现在群里；接口重试不会再次创建同一条正式消息或重复启动同一轮 Agent 讨论；正式消息按服务端顺序显示。附件上传仍需在消息提交前完成，不属于本次速度改动。
- 兼容处理：前端允许当前运行中的旧后台暂时不返回 `clientMessageId`，接口响应后仍会合并临时消息和正式消息，避免在受控重启前长期留下两条。
- 额外修复：群聊状态文件恢复时不再丢弃只有附件、没有文字的消息。
- 验证：`node --test windows/tests/group-room-store.test.mjs windows/tests/group-routes.test.mjs windows/tests/multi-agent-service.test.mjs windows/tests/artifact-service.test.mjs` 8/8 通过；相关 Node 语法检查通过；`pnpm build:ui` 通过；定向 `git diff --check` 通过。
- 未验证：没有启动或重启服务；服务端幂等逻辑尚未加载到当前进程；没有进行真实手机、多网页、断线重连和请求超时验收。因此 M1 仍为部分实现，不能标记完成。
- 下一步：受控重启并验收 M1；通过后进入 M2，将内存讨论队列升级为可恢复的 Task、AgentRun 和 ActivityEvent 账本。

### 2026-08-06 22:48 +08:00

- 状态：planned
- 本次更新：根据用户确认，把 FEAT-002 的目标收敛为“单机多模型、多 Agent 协作地基”。用户从一个群聊入口发送消息；项目经理默认接收并判断直接回答、创建任务或请求补充信息；用户明确 `@` 时由目标 Agent 直接响应；被安排的 Worker 完成后在群内汇报结果。多电脑协作仅保留扩展可能，Orca 暂不作为初版底座或强依赖。
- 计划评估：原计划总体方向合理，但不能直接开工。必须把消息幂等/顺序、任务账本、AgentRun、可恢复状态、上下文任务包、重复回复控制、停止/重试/审批和真实用户场景验收提前纳入。否则只能证明“模型被调用”，不能证明群聊协作可靠。
- 计划调整：M0 目标基线；M1 消息可靠性；M2 Task/AgentRun/ActivityEvent；M3 项目经理路由；M4 `@Agent`；M5 Worker 任务包与群内汇报；M6 项目经理汇总与冲突；M7 继续/停止/重试/审批；M8 Runtime/Provider 扩展；M9 真实场景验收与文档交付。
- 用户影响：初版完成后，用户不需要自己判断应该调用哪个模型；普通消息由项目经理判断，明确点名时直接找到对应 Agent；任务、进度、结果和交付物都能在原群聊中追踪，刷新或重连不应造成重复、乱序或任务消失。
- 主要风险：当前原型的执行队列仍主要在内存中，Agent 调度仍以有限轮次讨论为主，尚无正式 Task/AgentRun 账本；服务重启恢复、重复事件幂等、统一汇报和高风险审批尚未实现。当前计划已将这些列为正式阶段门。
- 证据：`windows/server/group-room-store.mjs`、`windows/server/multi-agent-service.mjs`、`docs/feature-development/features/FEAT-002-group-multi-agent.md`、`docs/feature-development/P0_INCIDENT_REVIEW_2026-07-29_ORCA_ROUTE2_SCOPE.md`。
- 基线：`product_base_commit=d5b39e8be1e6273299d3606eef3d1153ba001f3e`；本次只更新项目管理记录，尚未产生产品代码提交或审计提交。
- 下一步：等待用户确认本计划后，建立 FEAT-002 实施基线，先做 M1 消息可靠性与 M2 任务账本，不先增加 Agent 数量、不先接入 Orca 或多电脑调度。

### 2026-08-06 18:00 +08:00

- 状态：direction_updated
- 本次更新：记录群聊按真人在线情况分流的初步规则。多人在线时，用户使用 `@` 调用助手；只有一个真人在线时，由整理和分派型小助手负责路由，未明确指定时默认由项目经理 Agent 回复。项目经理分发任务后，各 Agent 需要在群内提供进度，用户可以针对特定对话继续追问。
- 用户影响：用户不必在单人使用群聊时手动判断应该找哪个 Agent；多人协作时仍保留明确点名和可见的角色分工。
- 待确认：整理和分派型小助手与项目经理 Agent 的具体边界、多人在线的判定方式、Agent 进度展示形式和对话级连续追问入口。
- 用户原话：`没想好。初步想的是：1.群里有其他真人在线时，用@调用助手。2.群聊只有一个真人在线时，1.小助手负责分配给对应的人来进行回复。2.默认项目经理回复。项目经理分发任务后，各个助手要给出进度。然后可以针对特定对话继续进行对话。。先记下来，推送一下吧。之后再说`

### 2026-08-03 10:00 +08:00

- 状态：direction_updated
- 本次更新：确认“高能力项目经理 + 低成本专业 Worker + 按需审查”的分层 Agent 方向；上下文使用任务摘要和关键证据，不默认复制完整群聊。
- 用户影响：后续群聊可按任务难度调用不同 Agent，用户主要与项目经理对接，同时能够旁观、介入和中止 Worker 协作。
- 待确认：截图中的 `gpt-5.6-luna` 未在本机当前配置中找到，但不能据此判断不存在；实施前核对当前 Codex Agent schema、模型来源与真实调用。
- 证据：`docs/feature-development/features/FEAT-002-group-multi-agent.md` 的 `FEAT-002-I08` 与 v0.4.1 时间线。

### 2026-07-28 15:47 +08:00

- 状态：pending_review
- 本次更新：保留真实群聊和四个 Agent，后续先对齐单人 Codex 的可靠消息、过程、恢复和失败反馈。
- 用户影响：群聊仍处于基础体验完善阶段，多 Agent 讨论规则暂不扩展。
- 证据：`docs/feature-development/features/FEAT-002-group-multi-agent.md`

### 2026-08-09 12:21 +08:00

- 状态：`code_ready_pending_user_review`。本轮完成最小 Agent/Project/Thread/Runtime 边界：Agent 以稳定 `agentId + conversationId` 归属单聊；Project 关系只保留接口边界，未扩展完整 Task/组织模型；Runtime `threadId` 仅作可替换会话引用，群聊执行 Thread 与 Agent direct 单聊 Thread 隔离。
- 单聊隔离：Agent 详情的完整单聊使用独立 direct Runtime Thread；legacy 群聊 Thread 只保留历史引用，不迁移群上下文；本地 append-only JSONL 是单聊记录的优先来源，Runtime 不可用时仍可读取和分享已保存原文。
- 分享闭环：React 单聊回复操作区复用分支按钮位置新增“带到群聊”入口；用户必须从可发送 Negus 群聊列表明确点击一个目标，即使只有一个群也不自动猜测。发送文字/Markdown 原文，以该 Agent 身份显示；`requestId` 幂等，一次操作只产生一条消息，不自动调度其他 Agent。
- 验证：12 个 Agent 定向测试通过；`pnpm build:ui` 通过；12 个 Node 语法检查通过；全量 Windows Node 测试 117 项中 116 项通过，唯一失败为既有 `conversation-routes` 广播 mock 断言，未改该既有测试。
- 未启动服务、未提交 Git；电脑和手机的最终 11 项用户验收仍待用户执行。`product_commit` 与 `docs_commit` 保持 `pending`，不虚构提交 SHA。
