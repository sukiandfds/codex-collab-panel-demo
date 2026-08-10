# 开发日志：2026-07-24 真实项目群聊与多 Agent Demo

## 1. 本轮目标与结论

本轮目标从“查看静态群聊原型”调整为：在不修改现有单人 Codex 页面及其样式的前提下，快速做出一个可以真实使用的单项目群聊与多 Agent Demo。

当前结论：核心技术链路已经跑通，用户已在浏览器完成真实发送和 Agent 回复测试；但用户明确反馈“交互体验很差”。因此本版本应视为技术功能原型，不是交互验收完成版，也不应直接扩展成正式多人协作产品。

## 2. 已完成的真实功能

### 2.1 独立群聊页面

- 新增独立入口 `group.html`，不改现有单人 Codex 页面组件和样式。
- 页面按功能拆分为群头部、项目与成员栏、消息时间线、Agent 列表、输入框、成员身份弹窗和 `@` 选择菜单。
- Vite 使用多页面构建，同时生成 `index.html` 和 `group.html`。
- 群聊页面继续由现有 `9360` Node 服务提供，不增加新端口或第二套服务。

### 2.2 真实成员和群消息

- 每个浏览器保存独立成员 ID 和成员名称。
- 客户端定时上报在线状态，成员超过 60 秒未更新后不再显示在线。
- 群消息通过现有 SSE 通道实时广播到其他浏览器，不需要手动刷新。
- 消息与 Agent Thread 映射保存在 `runtime/group-room.json`。
- `runtime/` 已在 `.gitignore` 中，不向 GitHub 提交真实聊天数据。
- 消息历史最多保留 300 条，避免 Demo 文件无限增长。

### 2.3 四个真实 Codex Agent

当前提供四个职责不同的 Agent：

| Agent | 当前职责 | 默认文件权限行为 |
| --- | --- | --- |
| 项目经理 Agent | 澄清目标、拆解任务、汇总结论 | 未明确要求时不修改文件 |
| 研究 Agent | 只读调研、技术验证、方案比较 | 只读 |
| 开发 Agent | 实现明确任务、运行基础检查 | 可按明确指令修改项目 |
| 审查 Agent | 检查缺陷、风险和遗漏 | 默认只读 |

每个 Agent 在第一次收到任务时通过当前 Codex app-server 的 `thread/start` 创建独立、持久化的真实 Thread，并使用 `developerInstructions` 固定职责。后续消息通过 `thread/resume -> turn/start` 继续对应 Thread，不是前端模拟回复。

### 2.4 真实状态和回复

- app-server 的 `turn/started`、`item/started`、`item/agentMessage/delta` 和 `turn/completed` 会映射为群聊状态。
- 页面可以显示分析、命令、文件修改、工具调用、回复、等待审批、完成和失败。
- Agent 回复以流式文本进入群聊，最终回复写入群消息记录。
- 第一版同一项目同一时间只允许一个 Agent 执行，避免多个独立 Thread 并发修改同一工作区。

### 2.5 商讨模式和 `@` 提及

- 第一版最初把商讨模式设计成只供真人聊天，导致用户发送 `hi` 后没有任何 Agent 回复。
- 用户指出问题后，商讨模式调整为默认交给项目经理 Agent，项目经理参与讨论但不应在普通讨论中擅自改文件。
- 输入 `@` 会弹出当前在线成员和 Agent。
- 支持继续输入筛选、方向键切换、`Enter`/`Tab` 插入和 `Esc` 关闭。
- `@Agent` 后发送会将消息路由到对应 Agent；没有显式 `@Agent` 的商讨消息默认路由给项目经理 Agent。
- 已处理中文输入法组合输入，输入法确认文字时不会误触发菜单选择。

## 3. 技术结构

### 后端

- `windows/server/group-room-store.mjs`：群消息、成员在线状态、Agent 定义、Thread 映射和轻量持久化。
- `windows/server/multi-agent-service.mjs`：Agent Thread 创建、任务路由、串行占用、协议事件和最终回复。
- `windows/server/request-handler.mjs`：群聊快照、成员加入、在线心跳和消息发送 API。
- `windows/scripts/remote-room-demo.mjs`：组装群聊 Store 与多 Agent Service，仍保持为服务启动入口。

### 前端

- `web-ui/src/features/group-chat/data/`：群聊 HTTP 和 SSE 地址。
- `web-ui/src/features/group-chat/model/`：成员、消息、Agent 和事件类型。
- `web-ui/src/features/group-chat/hooks/`：快照、在线心跳、消息同步、流式回复和发送状态。
- `web-ui/src/features/group-chat/components/`：按交互职责拆分页面组件。
- `web-ui/src/group-main.tsx`：独立群聊入口。

现有 `web-ui/src/App.tsx`、原单人对话组件和原 UI 样式没有修改。

## 4. 开发过程中遇到的问题

### 4.1 静态原型不是真实功能

项目原有 `docs/codex-group-chat-prototype.html` 只有前端模拟交互。它可以展示方向，但没有成员同步、消息存储、真实 Codex Thread 或 Agent 状态，不能作为真实 Demo 交付。

处理方式：保留历史原型不动，新增独立 React 多页面入口，并复用现有 Node、SSE 和 app-server Connector。

### 4.2 商讨模式无人回复

首次实现沿用了“商讨模式只同步真人、开发模式才触发 Codex”的设定。用户当时只有一个成员在线，因此发送 `hi` 后页面只显示自己的消息。右侧项目经理默认高亮又容易让人误以为项目经理已经收到消息。

处理方式：商讨消息默认路由给项目经理 Agent；显式 `@Agent` 时改由被提及 Agent 处理。这个修复解决了无人回复，但也暴露了更深的交互问题：普通聊天仍然会启动一次完整 Codex Turn，反馈速度与聊天软件预期不匹配。

### 4.3 Vite 加载了过期的编译配置

第一次执行 `pnpm build:ui` 虽然成功，但产物只有 `index.html`，没有 `group.html`。原因是 `web-ui/` 中存在被 Git 忽略的旧 `vite.config.js`，Vite 自动加载了它，没有使用刚修改的 `vite.config.ts`。

处理方式：在 `web-ui/package.json` 的 `dev`、`build` 和 `preview` 命令中显式指定 `--config vite.config.ts`。重新构建后同时生成两个 HTML 入口。

### 4.4 官方在线资料获取失败

为了确认当前 Codex 的 `thread/start` 参数，曾按官方文档路径获取 Codex Manual，但 Windows Schannel TLS 握手失败。继续联网重试会浪费时间。

处理方式：直接使用本机当前 `codex-cli 0.145.0-alpha.30` 生成实验性 TypeScript 协议定义，确认 `ThreadStartParams`、`TurnStartParams`、通知类型和 `thread/name/set` 参数。生成目录位于系统临时目录，读取完成后已删除，没有进入仓库。

### 4.5 自动打开 HTTP 地址被本机策略拒绝

服务和页面已经正常返回 HTTP 200，但 PowerShell `Start-Process` 打开带 token 的 HTTP 地址被当前工具策略拦截。

处理方式：不继续尝试绕过策略，直接交付可点击链接。该问题不影响服务运行。

### 4.6 `@` 菜单与中文输入法冲突风险

如果在 `keydown` 中直接处理 Enter，中文输入法确认候选文字时可能被误判为选择菜单或发送消息。

处理方式：先检查 `nativeEvent.isComposing`，组合输入期间不处理 `@` 菜单选择和发送快捷键。

## 5. 当前已知问题与交互体验记录

用户已完成实际浏览器测试，并明确评价“还行，但是交互体验很差”。当前问题不是核心链路不工作，而是产品交互尚未达到自然群聊体验。

### P1：聊天反馈速度和心理预期不匹配

普通问候也会启动完整的 Codex Thread/Turn。用户发出消息后，在模型首个事件到达前缺少靠近消息的即时反馈，容易判断为“没人回复”。

后续方向：消息发送成功后立即在时间线内显示目标 Agent 的接收状态和回复占位，不依赖右侧状态栏；同时研究项目经理是否需要轻量对话路径，而不是所有消息都进入完整开发 Turn。

### P1：状态信息离当前操作太远

当前 Agent 状态主要位于最右侧列表。用户注意力集中在底部输入框和中间消息流，很容易错过“正在处理任务”。

后续方向：把接收、排队、分析、执行、等待确认和失败状态放到对应消息下面，右侧列表只保留全局概览。

### P1：商讨、开发、选中 Agent 和 `@Agent` 的关系不够直观

当前同时存在模式切换、右侧 Agent 选择和 `@` 路由。它们都可能决定消息去向，用户需要理解内部规则，操作成本偏高。

后续方向：收敛为以收件人为核心的输入模型。普通消息进入项目群并由项目经理关注；`@成员` 通知成员；`@Agent` 触发对应 Agent；明确执行代码时再出现执行权限和确认状态。

### P1：当前不是真正的 Agent 间协作

四个 Agent 使用独立真实 Codex Thread，但当前由用户手动选择和路由，并且串行执行。项目经理不会自动把任务分派给研究、开发或审查 Agent，也没有审核打回和 Agent 间消息。

后续方向：在现有 Agent Thread 和状态映射之上增加 Task、AgentRun、委派、审核和回传事件。不能把当前“多个 Thread”宣传成已经完成的多 Agent 组织系统。

### P1：缺少排队、取消、重试和冲突说明

同一时间只允许一个 Agent 工作，这能保护共享工作区，但第二个任务目前缺少清晰的排队体验。`turn/interrupt`、`turn/steer` 和网页审批仍未接入。

### P1：Desktop 与 Web 仍非完整双端同步

群聊 Agent 和单人网页都通过独立 app-server 进程运行。消息会进入真实 Codex Thread，但已经打开的 Codex Desktop 页面不保证实时热刷新。该限制没有因为增加群聊而消失。

### P1：当前认证只适合本地或可信局域网

服务仍监听 `0.0.0.0`，演示 token 仍为 `demo123`。在随机 token、成员认证、权限和审批完成前，不应公开到公网。

### P2：成员与数据模型仍是 Demo 级

- 成员身份保存在浏览器 `localStorage`，没有账户、邀请、角色权限和设备撤销。
- 在线状态使用 20 秒心跳和 60 秒过期，不是完整 Presence/Lease 系统。
- 群消息保存在单个本地 JSON 文件，没有数据库、并发事务、审计和迁移机制。
- `@成员` 当前提供选择和文本提及，但没有单独的推送通知、未读状态或提醒中心。

### P2：移动端和视觉交互尚未由用户认可

本轮按用户要求只做了基础构建和接口检查，没有做截图对比或视觉验收。用户实际查看后认为交互体验较差，因此后续不得把“构建通过”当成“产品体验通过”。

## 6. 基础检查结果

- 新增和修改的 Node `.mjs` 文件通过 `node --check`。
- `git diff --check` 通过，仅有 Git 的 LF/CRLF 提示。
- `pnpm build:ui` 通过 TypeScript 和 Vite 生产构建。
- 构建产物包含 `index.html` 和 `group.html`。
- `GET /api/group/snapshot` 返回 HTTP 200，并返回 4 个 Agent。
- `GET /group.html` 返回 HTTP 200。
- 用户在浏览器真实发送消息，项目经理 Agent 已通过真实 Codex Thread 回复。
- 用户完成了本轮实际效果检查，并给出交互体验较差的结论。

## 7. 下一步建议

下一轮不要继续扩展 Agent 数量、复杂组织结构或企业权限。优先只处理一条最核心体验：

> 用户发送消息后，立即知道消息交给了谁、对方是否已接收、正在做什么、什么时候能继续输入或取消。

建议顺序：

1. 重构群聊消息下方的内联状态和回复占位。
2. 收敛商讨、开发、Agent 选择与 `@` 的路由规则。
3. 增加任务排队、取消、补充指令和失败重试。
4. 再实现项目经理对专业 Agent 的真实委派和审核闭环。
5. 完成认证、权限和 Desktop/Web 同步边界后，再做跨成员正式协作。

这些工作只应修改独立群聊功能域；现有单人 Codex UI 仍需得到用户明确授权后才能调整。
