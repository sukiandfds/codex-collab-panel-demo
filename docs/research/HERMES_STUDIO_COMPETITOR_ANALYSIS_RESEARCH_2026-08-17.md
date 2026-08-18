# Hermes Studio 竞品分析研究

- 研究编号：`RESEARCH-2026-08-17-HERMES-STUDIO-COMPETITOR`
- 日期：2026-08-17
- 范围：公开官网、公开 GitHub 仓库、许可证、最新发布版本和群聊相关源码结构
- 方法：只读浏览与源码结构核对；未克隆、运行或修改 Hermes Studio
- Negus 基线：`0d2ecb74f6f75259daa0c51837d4038c9b3903e`

## 1. 结论摘要

Hermes Studio 是 Negus 当前最值得跟踪的直接参照产品之一，但两者的产品切入点不同。

Hermes Studio 已形成较完整的本地 Agent 控制台：覆盖 Agent 对话、群聊、Profile、权限、模型、任务、看板、工作流、文件、终端、Coding Agent、MCP、桌面运行时和多平台分发。Negus 当前不适合与它进行通用功能数量竞争。

Negus 可以继续验证的窄方向是：负责人管理真实 Codex 项目和 AI 员工，查看任务状态，接手异常，并审核可追溯的交付物。这个方向目前仍是差异化假设，不是已经建立的产品壁垒。

## 2. Hermes Studio 已核对事实

### 产品与分发

- 官网定位为 Hermes Agent 的桌面应用、Local Runtime 和 Web Console。
- 宣传能力包括 Agent 流式聊天、会话管理、工具轨迹、生成文件预览、Profile/Provider/模型管理、平台渠道、Cron 任务、Kanban、可视化工作流、文件管理、Web 终端、Desktop Agent Browser、Coding Agent 和 MCP。
- 支持 Hermes、Codex、Claude Code、Pi 等 Coding Agent 路由。
- 提供 Windows、macOS、Linux 桌面版，以及 npm、Docker 和源码安装。
- GitHub 页面快照显示约 `10.3k stars`、`1.3k forks`、`1,252 commits`、`179 issues` 和 `52 pull requests`。
- `v0.6.43` 在 2026-08-16 发布；发布说明包含移动下载中心、Codex `/compact` 与 `/context`、工具搜索门控等变更。
- 官网未看到明确的价格或企业购买入口；当前主要依靠公开仓库、桌面分发和社区传播建立影响力。

### 工程结构

- 前端采用 Vue 3、TypeScript、Vite、Pinia、Vue Router、Naive UI 和 SCSS。
- 后端采用 Koa 2、Socket.IO 和 `node-pty`，通过 BFF 连接 Hermes Agent Bridge。
- 群聊前端入口 `GroupChatView.vue` 很薄，负责路由房间、Profile、连接和装配 `GroupChatPanel`。
- 群聊组件独立拆分为房间创建、消息列表、输入框、Agent 执行卡、历史面板、消息项、头像和 `@` 选项等组件。
- 群聊状态集中在 `packages/client/src/stores/hermes/group-chat.ts`，文件快照约 `2,255` 行、`2,092` 行代码。
- 群聊服务端路由 `packages/server/src/routes/hermes/group-chat.ts` 文件快照约 `1,513` 行、`1,426` 行代码，并向权限、附件、Agent Link、工作区和运行时 Controller/Service 分流。

## 3. 群聊实现中值得借鉴的行为

以下是行为和架构要求，不是可复制的源码清单：

1. **路由入口与业务面板分离**：入口只处理房间/Profile 路由和生命周期，具体交给群聊面板与状态层。
2. **服务端权威房间快照**：加入房间时同步成员、Agent、历史消息、输入状态、上下文状态、执行队列、审批和澄清状态。
3. **断线重入**：断线时清理 Socket、房间和瞬时执行状态；重连后重新加入当前房间并同步消息，使用连接代次和房间标识避免旧连接污染新房间。
4. **持久状态与瞬时状态分离**：消息、房间和 Agent 身份与流式增量、输入中、当前执行、审批和澄清分别处理。
5. **历史 Agent 身份保留**：Agent 离线或从房间移除后，历史消息仍能显示原发送者身份。
6. **权限不是前端隐藏按钮**：服务端区分可读、可管理、房间所有者、访客、邀请链接和 Agent Link 权限。
7. **长任务状态显式建模**：执行队列、审批、澄清、Agent 活动和消息流不是一个通用布尔值。
8. **流式和历史有边界**：流式增量批量刷新，历史消息分页，并对当前展示数量设置上限。

## 4. 不应照搬的部分

- 不复制、改写或移植 Hermes Studio 的 BSL 源码、测试、数据模型、接口结构或命名体系。
- 不把 Hermes 的 Profile、Provider、平台渠道和远程 Agent 模型直接套进 Negus 的项目、员工和 Codex Thread 模型。
- 不照搬其约 `2,255` 行的单体群聊 Store 或约 `1,513` 行的单体群聊路由。Negus 应保留更小的职责边界和现有共用模块。
- 不因为 Hermes 有完整的通用控制面，就把 Negus 扩展成同样的功能集合。

## 5. Negus 对比判断

### Hermes Studio 当前明显领先的方面

- 功能广度：Agent、模型、渠道、任务、工作流、文件、终端和桌面运行时形成完整控制面。
- 工程成熟度：持续发布、跨平台安装、权限和远程能力更完整。
- 群聊工程：房间快照、权限、邀请、执行队列、审批、重连和历史身份建模更系统。
- 市场信号：公开仓库、星标、Fork、发布和社区传播远强于当前 Negus。

### Negus 当前可继续验证的方向

- 真实 Codex 项目、Thread、员工身份和交付物审核可以组成一条更窄的负责人工作流。
- Negus 的价值假设是“负责人少追问、少丢任务、少返工，并能接手和验收”，不是“拥有更多 Agent 功能”。
- 这仍属于产品方向，不能在对外材料中写成已建立的竞争壁垒。

### Negus 当前状态边界

以下状态来自本轮项目讨论，状态必须分开记录：

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 员工/群聊 Thread 混入 Negus | 已修复、定向测试通过、待页面验收 | 不应继续描述为现存 Bug |
| 非首项目新建后显示到首项目 | 未修复 | 前端项目目录回退和刷新边界仍需处理 |
| 重启后活动群聊任务恢复 | 当前不支持持久化 | 是能力边界，不是项目串线 Bug |
| `@` 路由与去重 | 已实现、定向测试通过、待断线/重连验收 | 属于验收缺口，不是已确认故障 |

## 6. 许可证与商业边界

Hermes Studio 当前使用 Business Source License 1.1：

- Additional Use Grant 允许非商业使用，包括个人、教育和研究。
- 商业使用包括销售、授权、SaaS 托管或嵌入商业产品，需要许可方 EKKOLearnAI 的单独商业授权。
- Change Date 为 `2029-05-10`，届时自动转换为 Apache License 2.0。

因此，准备商业化的 Negus 可以阅读公开资料、观察产品行为、总结独立需求和架构原则，但在取得单独授权前，应将 Hermes 源码视为不可进入 Negus 的代码来源。实现应基于 Negus 自己的需求、现有代码和独立设计完成。

## 7. 对 Negus 的行动含义

1. 暂不追 Hermes 的通用功能表。
2. 先验证一条主链：`选对项目 -> 创建/接续正确 Codex Thread -> 查看状态 -> 接手异常 -> 审核一个交付物`。
3. 群聊只吸收房间权威状态、断线重入、状态分层、权限校验和历史身份保留等行为要求。
4. 对外定位应明确为 Beta/设计伙伴验证，不宣称成熟 SaaS、完整企业权限或重启后续跑。
5. 研究下一阶段应采用清洁实现方式：把公开行为写成需求矩阵，再映射到 Negus 现有模块，不复制 Hermes 的代码和结构。

## 8. 来源

- 官网：https://hermes-studio.ai/#/
- GitHub 仓库：https://github.com/EKKOLearnAI/hermes-studio
- README：https://github.com/EKKOLearnAI/hermes-studio/blob/main/README.md
- 最新发布：https://github.com/EKKOLearnAI/hermes-studio/releases/tag/v0.6.43
- 许可证：https://github.com/EKKOLearnAI/hermes-studio/blob/main/LICENSE
- 群聊入口：https://github.com/EKKOLearnAI/hermes-studio/blob/main/packages/client/src/views/hermes/GroupChatView.vue
- 群聊组件目录：https://github.com/EKKOLearnAI/hermes-studio/tree/main/packages/client/src/components/hermes/group-chat
- 群聊状态层：https://github.com/EKKOLearnAI/hermes-studio/blob/main/packages/client/src/stores/hermes/group-chat.ts
- 群聊服务端路由：https://github.com/EKKOLearnAI/hermes-studio/blob/main/packages/server/src/routes/hermes/group-chat.ts

## 9. 研究限制

- 本记录来自公开页面和公开源码结构核对，未运行 Hermes Studio，未做双方同场景实机对照。
- GitHub 数量、版本发布时间和功能页面会变化，以上数值以 2026-08-17 快照为准。
- Negus 的“待页面验收”和“未修复”状态不等价；正式关闭仍需代码、定向测试和真实用户流程三项证据。
