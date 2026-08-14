# 04 项目、员工与群聊领域

## 领域对象关系

| 对象 | 当前唯一标识 | 当前来源 | 当前关系 |
| --- | --- | --- | --- |
| 项目 | `projectId`、`kind`、`key`、`root` | `project-identity-store`、业务项目配置 | personal/business/employee 三种项目身份 |
| 员工 | `employee.id` | `employees/*/employee.json`、`employee-project-registry` | 系统内置长期角色，有项目根和上下文根 |
| 员工项目 | `employee.projectKey` 或 `projectId` | 员工注册表和项目身份同步 | 展示员工主对话、成长和群聊参与记录 |
| 群聊房间 | `roomId`、`projectId` | `group-room-directory`、`group-room-store` | 非 employee 项目可拥有一个房间 |
| 员工 Agent | `agent.id`、`threadId` | 房间快照、员工定义、multi-agent service | 一个员工可参与多个房间，每个房间有自己的 Agent Thread |
| 会话绑定 | `conversationId + runtimeSessionId` | `agent-conversation-store`、项目身份 | 连接普通 Thread、员工主 Thread 和群聊只读投影 |

## 当前实现的优点

| 设计 | 现状 | 评价 |
| --- | --- | --- |
| 内置员工随系统提交 | 员工定义在 `employees/`，上下文和运行数据放 `runtime/` | 源码和用户对话已分离，符合系统内置员工方向 |
| 员工拥有独立项目身份 | `employee-project-registry` 为每个员工生成 project/context root | 不需要把员工复制到业务项目，方向正确 |
| 普通项目过滤员工 Thread | `employee-project-directory` 过滤员工主 Thread 和房间 Agent Thread | 已解决大部分员工对话混入普通项目的问题 |
| 多业务项目房间 | `remote-room-demo.mjs` 按 `ProjectIdentity` 创建房间状态文件 | 具备向多项目扩展的基础 |
| 员工主 Thread cwd | 员工运行时使用员工自己的 projectRoot，定义中不依赖当前项目 | 符合“员工只获得目标路径，不把默认 cwd 当员工身份”的原则 |

## 当前冲突和重复来源

| 问题 | 当前来源 | 影响 | 级别 |
| --- | --- | --- | --- |
| 员工名称有两套来源 | 服务端 `employee.json` 的 `name`；前端 `employeeDisplayNames` 映射 | 改一边不一定同步，可能再次出现“带 Agent/不带 Agent”或中英文不一致 | P1 |
| Agent 显示名有房间快照来源 | 房间保存的 `agents` 里保留 name，定义文件也有 name | 定义改名后旧房间可能继续显示旧名字 | P1 |
| 默认角色 ID 分散 | 前端和后端多处写死 `manager`、`developer` | 角色重命名、禁用或增加默认路由时需要改多个层 | P1 |
| 默认房间 ID 分散 | 前端和后端多处使用 `current-project` | 新项目或多房间入口容易错误回退到当前项目 | P2 |
| 群聊 Agent 对话是投影 | 员工项目中的 group conversation 是只读、只含 Agent 消息 | 用户以为进入了完整员工对话，实际缺少用户消息和完整上下文 | P1 |
| 员工群聊历史受快照限制 | `snapshot().messages.slice(-300)` | 超过 300 条后主群聊和员工项目历史不一致 | P1 |
| 员工项目目录包含两类对话 | 主对话和参与过的群聊对话混在一个员工项目下 | 业务上合理，但需要明确“主对话/项目参与记录”的视图分组 | P2 |

## 系统级目标模型

| 规则 | 目标 |
| --- | --- |
| 定义唯一来源 | `employee.json` 只定义身份、别名、职责、策略和能力；前端不再硬编码名称 |
| 项目身份唯一 | 所有项目入口先解析 `ProjectIdentity`，不直接用 cwd、文件夹名或页面默认值猜项目 |
| 员工与项目多对多 | 员工不复制到业务项目，只通过 `memberEmployeeIds/agentIds` 参与房间 |
| Thread 只是运行时引用 | `threadId` 不作为员工或项目身份，所有绑定由 `ConversationBinding` 管理 |
| 投影有明确类型 | 主对话、群聊只读投影、普通业务会话分别声明 `conversationKind` 和读写能力 |
| 默认角色可配置 | 默认接待、代码交付、审查等角色由系统策略解析，不散落 `manager/developer` 字符串 |

## 目前不建议的动作

| 动作 | 原因 |
| --- | --- |
| 直接删除所有员工群聊子会话 | 它们代表真实的群聊参与记录，问题在于投影契约不清晰，不是记录本身无用 |
| 把员工 cwd 改回主项目 cwd | 会破坏员工独立项目和权限边界，且违背系统内置员工模型 |
| 为每个业务项目复制员工目录 | 会造成身份、版本、上下文和提交记录分裂 |
| 只在前端修名称 | 根因是身份来源重复，应先收敛服务端定义和项目目录响应 |
