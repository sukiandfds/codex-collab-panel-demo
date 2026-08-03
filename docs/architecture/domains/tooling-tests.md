# 工具链与测试领域

## 目录职责

| 路径 | 主职责 |
| --- | --- |
| `windows/tests/` | 服务端单元测试、路由测试和回归测试 |
| `web-ui/package.json`、`vite.config.ts` | 前端构建和开发工具配置 |
| 根目录 `package.json`、`pnpm-lock.yaml` | 工作区脚本和依赖锁定（最新产品分支） |
| `web-ui/pnpm-lock.yaml` | 前端依赖锁定 |
| `.github/workflows/` | CI、回归检查和提交门禁 |
| `windows/scripts/check-dev-environment.ps1` | 开发环境检查 |
| `windows/scripts/readiness/` | 运行前就绪检查，不等同于业务测试 |

## 边界

- 测试验证行为，不拥有业务实现。
- 环境检查回答“能否启动/构建”，不替代真实用户验收。
- 锁文件和构建配置属于工具链，不放入前端 feature 或后端业务目录。

## 当前整理判断

测试和运行时检查目前分布在 `windows/tests/` 与 `windows/scripts/`。后续需要在文档上明确“检查、构建、回归、实机验收”四种结果，避免把通过环境检查误认为功能已验收。
