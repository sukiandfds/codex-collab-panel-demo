---
research_id: RESEARCH-MACOS-PUBLIC-DEPLOYMENT-2026-08-20
type: research
status: completed_read_only
date: 2026-08-20
scope: macOS 本地运行与公网用户测试可行性
product_base_branch: codex/publish-current-panel
product_base_commit: 744614722af6cc4848f6bd0d39649f4b86804d94
methods: [源码阅读, 项目文档阅读, macOS 只读环境检查]
changes_to_code_or_deployment: none
---

# negus：macOS 本地运行与公网访问准备度调研

## 结论摘要

negus 的业务核心并非只能运行在 Windows：前端是 React/TypeScript/Vite，服务层是 Node.js，服务入口会监听 `0.0.0.0:9360`，并以本机 Codex app-server、项目 `runtime/` 数据和 `~/.codex/sessions` 为数据来源。因此，macOS 具备迁移和用户测试的技术基础。

但当前仓库还不是“其他用户 clone 后即可直接在 macOS 使用”的状态。直接阻塞项是：正式启动脚本、端口/进程管理和默认 Codex runtime 发现都按 Windows 编写；本机缺少 `pnpm`、PowerShell 和 `cloudflared`；公网入口仍依赖共享 Demo Token，Cloudflare Access 与开机恢复未验收。结论为：**可以规划 macOS 试运行，但不应在未经适配和真实验收前宣称可直接部署或交付给其他用户。**

本次只读调研未运行构建、未安装依赖、未启动服务、未修改代码或 Tunnel。

## 项目是什么

仓库包含两条产品线：

- **negus Web 协作工作台**：浏览并继续真实 Codex Thread，展示执行过程、会话、群聊、多 Agent、Artifact、附件、项目进度与 PWA。
- **Codex Dream Skin**：独立的 macOS/Windows Codex 桌面端外部换肤工具；它不是本次部署目标。

Web 工作台的主要链路为：

```text
浏览器 / PWA
  -> Node HTTP 服务（9360：静态文件、API、SSE）
  -> 对话/群聊/附件/Artifact/项目服务
  -> 本机 Codex app-server
  -> Codex Thread 与 ~/.codex/sessions
```

前端位于 `web-ui/`；业务服务位于 `windows/server/`；当前启动组装入口是 `windows/scripts/remote-room-demo.mjs`。

## 已实现功能与当前成熟度

| 范围 | 当前能力 | 状态判断 |
| --- | --- | --- |
| 单人会话 | 读取/继续真实 Codex Thread，发送、追加、停止、恢复、历史、执行过程、复制、归档、分叉 | 代码已实现，仍需真实跨端与长任务验收 |
| 项目群聊与多 Agent | 成员、@ 路由、员工长期会话、公共群聊记录、成果发布 | 开发中，归属和体验仍有缺口 |
| 附件与内容 | 图片、音频、视频、文件、Markdown 内容块 | Demo 级上传链路，未完成大文件与恢复验收 |
| Artifact / HTML / PDF | 生成、预览、下载、版本、审核 | 已实现，待整体真实使用验收 |
| PWA / 移动端 | Manifest、Service Worker、设备状态、iPad 布局、更新提示 | 已实现，待真机与 HTTPS 体验验收 |
| 公网入口 | 固定域名 + Named Tunnel 的方案与历史实施记录 | 仍在进行，稳定性、正式鉴权、开机恢复未完成 |

产品当前不是多租户协作平台：会话和运行时主要围绕本机 Codex 数据、单一项目运行根目录和本机持久化状态设计。

## 当前技术实现

### 前端

- React 19、TypeScript、Vite 6；前端目录为 `web-ui/`。
- `pnpm@10.28.2` 是仓库声明的包管理器；CI 使用 Node.js 22。
- 提供单人对话、群聊、项目进度和项目管理页面，并包含 PWA Manifest、Service Worker 和更新提示。
- 生产静态文件由服务端直接提供；`index.html`、`sw.js`、Manifest 采用重新验证缓存，带哈希资源可长期缓存。

### Node 服务

- `remote-room-demo.mjs` 默认端口为 `9360`，观察端口为 `9350`，以 `0.0.0.0` 监听。
- 该入口组合静态文件、REST API、SSE、附件/媒体、Artifact、群聊、员工、项目状态和模型调用服务。
- 会话优先使用 Codex app-server，JSONL 会话记录是降级来源；默认 session 路径为 `~/.codex/sessions`，这一部分对 macOS 是天然兼容的。
- 持久化状态写在项目的 `runtime/` 下，例如上传文件、执行状态、群聊和项目身份数据。因此部署主机需要持久化且可备份的项目数据目录。

### 本机 Codex 依赖

服务会启动 `codex app-server` 并通过 JSON-RPC 读写 Thread。当前 `app-server-client.mjs` 的自动查找逻辑只查 Windows 路径（`LOCALAPPDATA/.../codex.exe` 与 `APPDATA/.../codex.js`）。

它已支持 `CODEX_APP_SERVER_BIN` 覆盖。因此，macOS 试运行的最低正确做法是显式提供这个可执行文件路径，并先确认其支持 `app-server` 子命令；不能依赖当前自动发现逻辑。

## Windows 依赖与 macOS 差距

| 组件 | 当前实现 | 对 macOS 的影响 |
| --- | --- | --- |
| 启动 | `start-web-demo.ps1` 调用 `node.exe`，使用 PowerShell `ProcessStartInfo` | 不能直接运行；需要等价的 macOS 启动包装方式 |
| 构建 | `build-web-ui.ps1` 驱动 pnpm | 前端构建本身可跨平台，PowerShell 包装不可直接复用 |
| 端口/进程检查 | `netstat.exe`、Windows PID 文件与 `%TEMP%` | 需要 macOS 等价的端口检查、日志和进程生命周期设计 |
| Codex runtime 查找 | Windows AppData 与 `.exe` 候选路径 | 必须设置 `CODEX_APP_SERVER_BIN`，或后续做小范围跨平台路径适配 |
| 远程 Tunnel 托管 | 文档方案是 Windows cloudflared 服务 | macOS 要采用 launchd 或前台受控进程；不要复制 Windows 服务命令 |
| 自动化验证 | CI 有 Node 跨平台语法检查，也有 Windows PowerShell 回归测试 | Node 层有基础可移植性信号；完整本地运行在 macOS 尚未被 CI 覆盖 |

## 本机 macOS 只读准备度

检查时间：2026-08-20；未安装或修改任何软件。

| 项目 | 结果 | 含义 |
| --- | --- | --- |
| 系统 | macOS 26.5.1，Apple Silicon（arm64） | 可作为 Node/前端运行主机 |
| 内存与磁盘 | 16 GB RAM，约 47 GB 可用磁盘 | 目前看足以完成依赖安装、构建和运行时数据存储 |
| Node.js | 已有 v24.14.0 | 可用于探索；CI 验证基线是 Node 22，正式试运行应优先用已验证主版本或先验证 v24 兼容性 |
| Git | 已安装 | 已验证可读写 GitHub 仓库 |
| Codex CLI | 已在 PATH | 是启动 app-server 的候选；仍需实际确认其 `app-server` 兼容性 |
| pnpm | 未安装 | 前端依赖安装与构建的直接阻塞项 |
| PowerShell / pwsh | 未发现 | Windows 启动脚本不可直接使用 |
| cloudflared | 未发现 | 无法建立/管理 Cloudflare Tunnel |

## 公网访问现状与安全边界

当前服务会保护 `/api/*` 和 `/events`，认证方式是同一个共享 Token：首次可通过 `?token=...` 进入，随后服务设置 `HttpOnly`、`SameSite=Strict` 的 Cookie；当反向代理声明 HTTPS 时，Cookie 也会带 `Secure`。

这一机制适合个人 Demo，不适合公开长期服务：

- URL 中携带的 Token 容易被浏览器历史、截图、日志、分享或 Referer 处理不当泄露。
- 没有用户身份、独立授权、撤销、审计、速率限制或租户隔离。
- 服务会执行和暴露本机 Codex 工作数据；公网暴露的风险高于普通静态网站。

文档指定的长期方向是：

```text
固定 HTTPS 子域名
  -> Cloudflare Access（身份验证）
  -> Cloudflare Named Tunnel
  -> 本机 127.0.0.1:9360
```

文档显示固定域名与 Named Tunnel 曾可用，但同时明确记录：仍依赖人工 VPN 线路以获得较好延迟，Cloudflare Access 尚未配置，项目服务和 Tunnel 的开机恢复没有完成验证。该历史状态不能视为当前 macOS 部署已经可用。

此外，部分 Artifact URL 组装逻辑当前使用 `http://127.0.0.1:<port>` 作为 origin；在公网 macOS 试运行中必须实际验证预览/下载链接是否会错误指回用户自己的 localhost。

## 面向“clone 后可直接使用”的差距

当前仓库尚缺少以下可复现交付物：

1. macOS 启动脚本与明确的前置检查，不依赖 Windows `.ps1`。
2. 统一、跨平台的 Codex app-server 发现或明确的环境变量配置流程。
3. 固定的 Node/pnpm 版本与一键依赖安装说明。
4. `runtime/`、上传文件、会话数据和外部业务项目路径的首次初始化与备份策略。
5. 反向代理/Tunnel 的 macOS 生命周期管理、故障可观测性和恢复方式。
6. Cloudflare Access 或等价的正式身份验证；不能把共享 Demo Token 当作多人入口。
7. macOS CI/验收矩阵：构建、启动、Codex app-server 连接、SSE、PWA、上传、Artifact、公网移动网络访问。
8. 对外用户边界：谁能访问哪台 Mac 上的哪个 Codex 账号、项目目录和本机文件，尚未产品化。

## 今日目标的可行性判断

| 目标 | 现在能否宣称完成 | 原因 |
| --- | --- | --- |
| 在这台 Mac 阅读/开发项目 | 可以 | GitHub 访问已验证，核心源码已拉取 |
| 在这台 Mac 构建前端 | 尚未验证 | 缺少 pnpm，且未执行安装/构建 |
| 在这台 Mac 启动 Web 服务 | 尚未验证 | Windows 启动脚本和 Codex runtime 自动发现不兼容 |
| 在公网访问这台 Mac 的服务 | 尚未验证且不应直接开放 | 缺少 Tunnel 工具与正式访问控制；现有方案稳定性未验收 |
| 让其他用户 clone 后直接使用 | 当前不具备 | 缺少跨平台运行手册、自动化、隔离与安全交付链路 |

## 建议的后续验证顺序（本次未执行）

1. **本地最小启动预检**：确认 Node 版本、安装 pnpm、安装前端依赖、确认 `codex app-server` 可用，并在不公网暴露的前提下构建/启动。
2. **macOS 兼容性收口**：以最小改动替代 PowerShell 启动包装，明确 `CODEX_APP_SERVER_BIN`、项目根目录、runtime 目录和日志位置。
3. **本机用户验收**：验证真实 Thread、SSE、上传、Artifact、PWA 更新和服务重启后的数据保留。
4. **安全公网验收**：配置固定 HTTPS 域名、Named Tunnel 与 Cloudflare Access；只允许明确账号访问；确认 API/SSE/下载均无绕过。
5. **外网真实体验**：在手机蜂窝网络和第二台设备上测试登录、PWA、长任务、断线恢复、上传和 Artifact 链接。
6. **可交付化**：完成 macOS 安装/启动/停止/诊断文档和自动化检查后，才评估“其他用户拉取即用”。

## 未验证项

- 当前 Codex CLI 是否与仓库所需 app-server 协议版本完全兼容。
- Apple Silicon 上 `sharp` 等依赖的实际安装和构建结果。
- macOS 运行时数据路径、权限和多项目根目录是否与现有 Windows 假设一致。
- 公网反向代理下 SSE、Cookie、PWA、上传、Artifact 预览与链接的真实行为。
- Tunnel 在 macOS 上的稳定性、开机恢复、VPN/网络切换影响和安全配置。

## 证据来源

- `README.md`、`PROJECT.md`、`PRODUCT_DEFINITION.md`
- `web-ui/package.json`、`web-ui/vite.config.ts`
- `windows/scripts/remote-room-demo.mjs`、`start-web-demo.ps1`、`build-web-ui.ps1`
- `windows/server/app-server-client.mjs`、`http/access-control.mjs`、`request-handler.mjs`
- `docs/feature-development/features/FEAT-004-pwa-device-identity.md`
- `docs/feature-development/features/FEAT-006-stable-remote-access.md`
- `docs/feature-development/features/FEAT-009-remote-development-host.md`
- `.github/workflows/ci.yml`
