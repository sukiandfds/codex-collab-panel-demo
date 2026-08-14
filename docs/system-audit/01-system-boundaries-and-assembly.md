# 01 系统边界与组合

## 当前分层

| 层 | 当前代码 | 应承担的职责 | 审查结果 |
| --- | --- | --- | --- |
| 前端入口 | `web-ui/src/main.tsx`、`group-main.tsx`、`progress-main.tsx`、`project-management-main.tsx` | 选择页面入口和启动应用 | 入口数量是产品决策，不应为了“统一”强行合并 |
| 前端组装 | `web-ui/src/App.tsx`、`features/*App.tsx` | 组合 Hook、页面外壳和功能组件 | 基本符合边界，但 `GroupApp` 直接组装项目目录、群聊、员工资料和 Artifact |
| 前端功能 | `web-ui/src/features/<feature>/` | 功能内部 UI、数据、状态和类型 | 目录清晰，`project-directory` 已变成跨页面系统能力，当前归属需要明确 |
| 后端入口 | `windows/server/request-handler.mjs` | 鉴权、路由顺序和统一错误处理 | 路由已拆文件，方向正确 |
| 后端路由 | `windows/server/routes/` | 解析请求、调用服务、返回响应 | 主要符合约束，没有看到直接写 JSONL 的路由 |
| 后端服务/存储 | `windows/server/*-service.mjs`、`*-store.mjs` | 业务状态、持久化和协议适配 | 多个核心文件同时承担三类职责，是主要拆分候选 |
| 组合根 | `windows/scripts/remote-room-demo.mjs` | 读取配置、创建依赖、连接回调、启动服务 | 作为组合根合理，但已承载员工群聊投影和多项目房间初始化逻辑 |
| 运行数据 | `runtime/` | 本机状态、上传、历史和交付物 | 不应进入源码接口；当前通过路径参数集中在 `projectRoot/runtime` 下 |

## 组合根中的跨域逻辑

| 位置 | 当前行为 | 风险 | 系统级收敛方向 |
| --- | --- | --- | --- |
| `remote-room-demo.mjs:55-146` | 同时创建会话、执行、媒体、上下文、员工、项目身份、群聊和 Artifact 服务 | 依赖顺序和关闭顺序都集中在一个文件，新增功能容易继续堆入 | 保留组合根，但把每个领域的 `create...System()` 组装成少数稳定模块，并返回明确接口 |
| `remote-room-demo.mjs:152-180` | 在组合根中把群聊 Agent 消息投影到员工对话 | 业务映射和基础设施组装混在一起，难以独立测试 | 移到员工/群聊集成服务，组合根只注入回调 |
| `remote-room-demo.mjs:183-214` | 按项目身份创建群聊房间和对应状态文件 | 这是正确的多项目入口，但房间 ID、文件路径和身份规则分散在组合根 | 提供 `ProjectRuntimeBinding` 接口统一 `projectId/root/roomId/stateFile` |
| `request-handler.mjs:15-45` | 用条件方式注册员工、成长和项目目录路由 | 可选功能兼容性好，但请求处理器知道太多具体领域 | 保留路由注册机制，后续用路由清单或领域组装对象减少参数平铺 |

## 当前跨功能依赖

| 依赖 | 是否合理 | 评价 |
| --- | --- | --- |
| `ConversationSidebar -> project-directory` | 是 | 项目目录是单人侧栏的基础能力 |
| `GroupApp -> project-directory` | 基本合理，但属于跨 Feature 例外 | 既然两页必须共用，应把项目目录定义为系统导航能力，或在架构文档中正式登记为共享域 |
| `ConversationView -> execution、context、rendering` | 合理 | 但视图文件职责过多，状态计算应继续下沉 |
| `MessageTimeline -> attachments、artifacts` | 合理 | 群聊复用了展示能力，但内容渲染仍有独立实现，见 05 |
| 后端服务之间直接通过具体 store 方法互调 | 可运行，扩展风险高 | 需要以稳定领域接口隔离存储实现，尤其是会话、员工投影和房间历史 |

## 结论

当前目录结构不用立即移动。系统级清理的第一步不是重命名文件，而是先确定四个稳定边界：

1. `ProjectIdentity`：项目、员工项目和业务项目的唯一身份。
2. `ConversationBinding`：可读写会话、只读投影和运行时 Thread 的关系。
3. `RuntimeEvent`：单人、群聊和员工运行时都能消费的事件视图。
4. `Capability`：附件、Skill、App、图片和交付物入口的统一能力描述。

这些接口稳定后，再拆 `remote-room-demo.mjs` 和核心服务，风险最低。
