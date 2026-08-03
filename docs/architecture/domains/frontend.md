# 前端领域

## 目录职责

| 路径 | 主职责 |
| --- | --- |
| `web-ui/src/main.tsx` | 单人 Web 入口与应用启动 |
| `web-ui/src/group-main.tsx` | 群聊入口 |
| `web-ui/src/progress-main.tsx` | 项目进度入口（最新产品分支） |
| `web-ui/src/project-management-main.tsx` | 项目管理入口（最新产品分支） |
| `web-ui/src/App.tsx` | 单人页面组装，不承载具体业务规则 |
| `web-ui/src/components/` | 跨功能 UI 外壳和纯展示组件 |
| `web-ui/src/features/<feature>/` | 单一功能的组件、数据访问、Hook、状态和类型 |
| `web-ui/src/shared/` | 跨功能稳定 API、媒体类型、实时事件和公共模型 |
| `web-ui/src/pwa/` | Service Worker 与 PWA 注册 |
| `web-ui/src/styles/` | 全局样式与设计令牌 |

## 当前模块边界

- 对话、执行、附件、上下文、模型、设备、交付物、群聊、项目管理、项目进度和用量监控分别作为功能域。
- `components/` 不直接调用业务 API，不持有某个功能的业务状态，不反向依赖具体 feature 类型。
- `features/` 可以依赖 `shared/` 和纯 UI 组件，不应互相深度引用；需要共用的稳定能力先放 `shared/`。
- 页面入口负责组装，功能组件负责交互，数据目录负责 HTTP/事件接口，Hook 负责状态组合，model 负责类型和格式化。

## 当前整理判断

前端已经是项目中最清晰的分层区域，第一阶段不建议大规模移动。后续重点是确认 `Conversation*`、`Execution*` 和群聊实时 Hook 的边界是否稳定，以及把新产品分支新增入口纳入同一套说明。
