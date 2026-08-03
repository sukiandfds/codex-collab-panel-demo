# 运行时与平台领域

## 目录职责

| 路径 | 主职责 |
| --- | --- |
| `windows/scripts/start-*.ps1` | 启动本地服务或桌面运行链路 |
| `windows/scripts/restart-*.ps1` | 重启 Web/服务进程的运维入口 |
| `windows/scripts/readiness/` | 无 UAC 的环境检查与就绪判断 |
| `windows/scripts/common-windows.ps1` | Windows 脚本公共函数和路径约定 |
| `windows/scripts/remote-room-demo.mjs` | 远程入口的配置、依赖组装和启动 |
| `windows/scripts/summary-*.mjs` | 执行摘要/状态观察辅助程序 |
| `macos/` | macOS 皮肤、菜单栏、客户端交付和平台脚本 |
| `windows/assets/`、`macos/assets/` | 平台资源，不进入业务模块 |

## 边界

- 运行时脚本负责“如何启动、检查、重启和暴露服务”，不负责对话或群聊业务。
- 平台脚本可以调用服务入口，但服务端不反向依赖某个桌面皮肤或远程入口脚本。
- UAC、端口、Tunnel、进程退出和应急恢复属于运行时风险；不要混写到单人对话或群聊功能文档中。

## 当前整理判断

运行时目录同时包含启动、皮肤、远程演示和环境检查。后续可按“本地启动 / 远程入口 / 环境就绪 / 平台交付”继续分组，但当前不移动，避免影响正在开发的启动链路。
