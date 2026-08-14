# 系统级清扫审查

审查日期：2026-08-14  
代码基线：`codex/publish-current-panel`，提交 `0817877`  
审查范围：当前 Web 协作工作台的源码、运行时组装、员工定义、测试和架构文档。

## 审查目标

本目录不针对某个项目补丁，而是检查系统是否满足以下原则：

| 原则 | 本次检查的问题 |
| --- | --- |
| 系统级 | 逻辑是否依赖某个业务项目、某个页面或某个 Agent ID |
| 最小改动 | 是否存在为解决单一页面问题而扩大改动面的实现 |
| 最多共用 | 单人页、群聊、员工页是否共用稳定组件、数据契约和事件语义 |
| 最好兼容 | Codex app-server、JSONL、不同项目根目录和旧入口是否保持边界 |
| 最多接口 | 项目、员工、房间、会话、运行时、消息和能力是否有可替换接口 |

## 范围边界

| 范围 | 本次处理方式 |
| --- | --- |
| `web-ui/src/` | 当前 Web 前端主系统，完整盘点 |
| `windows/server/` | API、服务、存储、Codex 适配和多 Agent 主系统，完整盘点 |
| `windows/scripts/remote-room-demo.mjs` | 作为组合根和运行时边界盘点 |
| `employees/` | 作为系统内置员工定义盘点 |
| `runtime/` | 只检查数据职责、持久化方式和边界，不读取或修改用户运行数据 |
| `windows/tests/`、`.github/`、`docs/` | 检查验证门禁和文档是否反映当前代码 |
| `macos/`、Windows Dream Skin | 按项目指南视为历史产品线，只记录兼容边界，不混入 Web 业务清理 |

工作区原有未提交内容未纳入本次源码判断：`AI_ASSISTANT_WORK_RULES.md`、`.playwright-cli/`、UX 测试记录和 `output/playwright/`。

## 模块总表

| 部分 | 主要入口 | 当前判断 | 详细表格 |
| --- | --- | --- | --- |
| 全部模块清单 | `web-ui/src/features/`、`windows/server/` | 逐项确认前端功能、后端领域和历史产品边界 | [00-module-inventory.md](./00-module-inventory.md) |
| 系统边界与组合 | `windows/scripts/remote-room-demo.mjs`、`request-handler.mjs` | 组合根过重，但边界方向正确 | [01-system-boundaries-and-assembly.md](./01-system-boundaries-and-assembly.md) |
| 前端模块与共用 UI | `web-ui/src/features/`、`components/`、`shared/` | 目录分层清楚，核心 Hook 和页面组件职责过多 | [02-frontend-modules-and-shared-ui.md](./02-frontend-modules-and-shared-ui.md) |
| 会话、执行与实时 | `conversation-service`、`execution-tracker`、SSE | 单人链路成熟，群聊/员工链路仍有不同契约 | [03-conversation-execution-realtime.md](./03-conversation-execution-realtime.md) |
| 项目、员工与群聊 | `project-identity-store`、`employee-*`、`group-room-*` | 关联关系已建立，但同一概念仍有多套来源和投影 | [04-project-employee-group-domain.md](./04-project-employee-group-domain.md) |
| 能力、附件与交付物 | `attachments`、`artifacts`、`image-generation`、slash command | 基础能力可复用，群聊能力入口尚未真正接入执行链 | [05-capabilities-attachments-artifacts.md](./05-capabilities-attachments-artifacts.md) |
| 持久化、安全与运行数据 | `runtime/`、各类 store、鉴权和路径校验 | 基础保护存在，持久化策略尚未统一 | [06-persistence-security-and-operational-data.md](./06-persistence-security-and-operational-data.md) |
| 测试、构建与文档 | `windows/tests/`、`.github/workflows/`、`docs/` | 服务端回归较完整，前端构建和浏览器验收不是统一门禁 | [07-testing-build-and-documentation.md](./07-testing-build-and-documentation.md) |
| 清理顺序 | 跨模块问题汇总 | 先修契约和数据边界，再做物理拆分 | [08-cleanup-backlog.md](./08-cleanup-backlog.md) |
| 系统优化方案 | `docs/system-audit/09-optimization-proposals.md` | 以删除、公共化、效率和集中管理为主的系统级落地方案 | [09-optimization-proposals.md](./09-optimization-proposals.md) |

## 最高优先级结论

| 优先级 | 结论 | 类型 | 证据 |
| --- | --- | --- | --- |
| P0 | 项目、员工、群聊房间和会话的身份需要一个系统级规范来源，不能继续由前端映射、员工注册表、项目身份和房间快照共同猜测 | 架构冲突 | `ProjectDirectory.tsx`、`employee-project-directory.mjs`、`project-identity-store.mjs`、`group-room-store.mjs` |
| P0 | 单人会话、群聊消息和员工投影需要共享“消息/活动/历史/发送结果”的稳定视图接口，而不是强行共享当前存储实现 | 兼容方向 | `SessionMessage`、`GroupMessage`、`ExecutionStatus`、`GroupStreamingMessage` |
| P1 | 群聊队列和当前运行只在内存中，服务重启会丢失未完成讨论状态 | 已知可靠性风险 | `multi-agent-service.mjs` 的 `currentRun`、`workQueue` |
| P1 | 能力菜单、按日期历史、重复 Agent 交接和员工群聊历史存在已确认边界问题 | 已确认 bug | 见 04、05、07 |
| P1 | CI 没有把 `pnpm build:ui` 和浏览器交互作为当前统一门禁 | 验证缺口 | `.github/workflows/ci.yml` |
| P2 | `remote-room-demo.mjs`、核心服务和前端核心 Hook 仍承担过多职责 | 维护风险 | 见 01、02、03 |

## 状态定义

| 标记 | 含义 |
| --- | --- |
| 已确认 | 能从当前源码或已有测试直接证明，不代表已经修复 |
| 结构风险 | 当前可能正常，但继续扩展时容易造成冲突或重复 |
| 设计方向 | 不是立即 bug，是系统级接口应如何收敛的建议 |
| 未验证 | 需要构建、服务启动、浏览器或真实运行时证据，不能只靠静态代码判断 |

本目录是审查记录，不执行删除、移动、重命名或业务逻辑修改。后续若执行清理，应以 [08-cleanup-backlog.md](./08-cleanup-backlog.md) 的优先级和完成证据为准，并结合 [09-optimization-proposals.md](./09-optimization-proposals.md) 的公共契约和效率目标。
