# negus Repository Guide

This repository contains two independent product areas:

1. **negus Web collaboration workspace**: inspect and continue real Codex work, with group chat, agents, and artifacts.
2. **Codex Dream Skin**: apply an external theme to the Codex desktop app through local CDP.

They share one repository, but their code, documentation, and runtime instructions are separate.

## negus Web collaboration workspace

- Project facts, runtime commands, and module map: [`PROJECT.md`](./PROJECT.md)
- Assistant work rules: [`AI_ASSISTANT_WORK_RULES.md`](./AI_ASSISTANT_WORK_RULES.md)
- Feature status: [`docs/feature-development/FEATURE_STATUS_INDEX.md`](./docs/feature-development/FEATURE_STATUS_INDEX.md)
- Feature development guide: [`docs/feature-development/README.md`](./docs/feature-development/README.md)
- Architecture guide: [`docs/architecture/README.md`](./docs/architecture/README.md)

Main code:

| Directory | Contents |
| --- | --- |
| `web-ui/` | React, TypeScript, and Vite frontend |
| `windows/server/` | Web service, API, SSE, and business modules |
| `runtime/` | Conversation, execution, artifact, employee, and media data |

Development commands:

```powershell
pnpm build:ui
pnpm start:demo
```

## Codex Dream Skin

Platform guides live beside the corresponding code:

| Platform | User guide | Maintainer and assistant rules | Code |
| --- | --- | --- | --- |
| macOS | [`macos/README.md`](./macos/README.md) | [`macos/SKILL.md`](./macos/SKILL.md) | [`macos/`](./macos/) |
| Windows | [`windows/README.md`](./windows/README.md) | [`windows/SKILL.md`](./windows/SKILL.md) | [`windows/`](./windows/) |

The skin uses local loopback CDP and does not modify the official `.app`, `app.asar`, WindowsApps, or code signature.

## Other documentation

- Skin project notes: [`docs/CODEX_DREAM_SKIN_PROJECT_NOTES.md`](./docs/CODEX_DREAM_SKIN_PROJECT_NOTES.md)
- Architecture, research, and runtime records: [`docs/`](./docs/)
- Historical development records: [`docs/records/`](./docs/records/)

This is not an official OpenAI product. Follow the relevant product directory and current source for exact behavior and safety boundaries.
