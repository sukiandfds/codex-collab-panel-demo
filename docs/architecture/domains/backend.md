# 后端业务领域

## 目录职责

| 路径 | 主职责 |
| --- | --- |
| `windows/server/request-handler.mjs` | 统一请求入口、鉴权和路由分发 |
| `windows/server/routes/` | 按功能解析请求并调用服务 |
| `windows/server/http/` | HTTP 请求工具、访问控制等基础能力 |
| `windows/server/*-service.mjs` | 功能服务、业务状态和外部协议适配 |
| `windows/server/*-store.mjs` | 会话、群聊、项目管理和进度等持久化/读取 |
| `windows/server/execution/` | 执行过程中的活动记录和事件辅助逻辑 |
| `windows/server/multi-agent/` | 多 Agent 讨论提示、输出任务和协议状态 |

## 按业务归属

- 对话：`conversation-service.mjs`、`app-server-conversation-store.mjs`、`jsonl-conversation-store.mjs`、`content-blocks.mjs`。
- 执行与实时：`execution-tracker.mjs`、`execution/`、`realtime-hub.mjs`、`app-server-client.mjs`。
- 群聊与多 Agent：`group-room-store.mjs`、`multi-agent-service.mjs`、`multi-agent/`、`routes/group-routes.mjs`。
- 附件与交付物：`media-service.mjs`、`artifact-service.mjs`、`routes/artifact-routes.mjs`。
- 上下文与模型：`context-management-service.mjs`、模型相关接口和路由。
- 项目管理、项目进度、用量监控：以最新产品分支中对应的 `project-*` 和 `fusheng-usage-service.mjs` 为独立业务域。

## 依赖方向

`request-handler -> routes -> services/stores -> external adapter or filesystem`。

路由不直接操作 JSONL、Codex 进程或群聊状态；服务不依赖前端文件；公共 HTTP 工具不能反向依赖业务服务。

## 当前整理判断

后端是主要整理对象。`execution-tracker.mjs`、`app-server-client.mjs`、`app-server-conversation-store.mjs`、`multi-agent-service.mjs` 等文件同时包含协议适配、状态转换和业务编排，先列为拆分候选，不在本轮物理移动或改逻辑。
