# negus 仓库入口

本仓库包含两套相互独立的产品代码：

1. **negus Web 协作工作台**：查看和继续真实 Codex 工作，支持群聊、Agent 和交付物。
2. **Codex Dream Skin 换肤工具**：通过本机 CDP 给 Codex 桌面端加载外部主题。

两套产品共用仓库，但文档、代码和运行方式分开维护。

## negus Web 协作工作台

- 项目说明、运行方式和模块代码索引：[`PROJECT.md`](./PROJECT.md)
- 助手工作规则：[`AI_ASSISTANT_WORK_RULES.md`](./AI_ASSISTANT_WORK_RULES.md)
- 功能状态：[`docs/feature-development/FEATURE_STATUS_INDEX.md`](./docs/feature-development/FEATURE_STATUS_INDEX.md)
- 功能开发说明：[`docs/feature-development/README.md`](./docs/feature-development/README.md)
- 架构说明：[`docs/architecture/README.md`](./docs/architecture/README.md)

主要代码：

| 目录 | 内容 |
| --- | --- |
| `web-ui/` | React、TypeScript、Vite 前端 |
| `windows/server/` | Web 服务、API、SSE 和业务模块 |
| `runtime/` | 会话、执行、Artifact、员工和媒体数据 |

开发命令：

```powershell
pnpm build:ui
pnpm start:demo
```

## Codex Dream Skin 换肤工具

平台说明紧挨对应代码目录：

| 平台 | 用户说明 | 助手和维护者规则 | 代码目录 |
| --- | --- | --- | --- |
| macOS | [`macos/README.md`](./macos/README.md) | [`macos/SKILL.md`](./macos/SKILL.md) | [`macos/`](./macos/) |
| Windows | [`windows/README.md`](./windows/README.md) | [`windows/SKILL.md`](./windows/SKILL.md) | [`windows/`](./windows/) |

换肤工具只通过本机回环 CDP 注入，不修改官方 `.app`、`app.asar`、WindowsApps 或代码签名。

## 其他资料

- 换肤项目记录：[`docs/CODEX_DREAM_SKIN_PROJECT_NOTES.md`](./docs/CODEX_DREAM_SKIN_PROJECT_NOTES.md)
- 架构、研究和运行记录：[`docs/`](./docs/)
- 历史开发记录：[`docs/records/`](./docs/records/)

本项目不是 OpenAI 官方产品。具体功能和安全边界以对应产品目录中的说明和当前源码为准。
