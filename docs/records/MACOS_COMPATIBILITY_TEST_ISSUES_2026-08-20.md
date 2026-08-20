# macOS 兼容性实践问题记录

日期：2026-08-20
基线：`codex/publish-current-panel` / `744614722af6cc4848f6bd0d39649f4b86804d94`

本文只记录 GitHub 接入、仓库拉取、macOS 适配、依赖安装、构建和本地运行测试中实际遇到的问题，不承载产品调研结论。

| 编号 | 阶段 | 问题 | 原因 | 处理结果 | 后续 |
| --- | --- | --- | --- | --- | --- |
| `MAC-I01` | GitHub | 没有 `gh` | GitHub CLI 未安装 | Homebrew 安装 `gh 2.97.0`，登录及读写成功 | 助手先检查再安装 |
| `MAC-I02` | GitHub | Homebrew 首次安装停在自动更新 | 自动更新耗时且无输出 | 关闭自动更新后重试成功 | 安装命令设置超时 |
| `MAC-I03` | 登录 | 浏览器未弹出，TTY 交互异常 | 终端兼容问题 | 改用设备码登录 | 保留设备码回退 |
| `MAC-I04` | 登录 | OAuth Token 请求超时 | 终端未继承系统代理 `127.0.0.1:7892` | 临时设置 HTTP/HTTPS 代理后成功 | 检测系统代理，不记录 Token |
| `MAC-I05` | Git | SSH 公钥认证失败 | 本机没有 GitHub SSH 密钥 | 使用 GitHub CLI 管理的 HTTPS 凭据 | 当前非阻塞 |
| `MAC-I06` | 拉取 | 浅拉取在 50 秒内 `early EOF` | 网络较慢且仓库包含媒体资源 | 改用 `--filter=blob:none` 和 sparse checkout | 完整 clone 耗时待测 |
| `MAC-I07` | 拉取 | 中止后遗留 `shallow.lock` | fetch 被限时终止 | 确认无 Git 进程后删除陈旧锁 | 删除锁前必须检查进程 |
| `MAC-I08` | 拉取 | `sparse-checkout.lock` 阻止操作 | 原 sparse fetch 仍在运行，锁有效 | 不删除锁，等待结束后通过代理重试 | 区分有效锁与陈旧锁 |
| `MAC-I09` | Codex | macOS 能运行 app-server，但项目无法自动发现 | 仅检查 Windows 路径 | 增加 PATH 回退，真实 `thread/list` 通过 | 已修复，未提交 |
| `MAC-I10` | 启动 | 构建、启动、PID 管理依赖 PowerShell | 没有跨平台入口 | 新增 Node `negus:*` 命令，Windows 原命令不变 | 已实现，未提交 |
| `MAC-I11` | 依赖 | 本机缺少 `pnpm` | 新机器无项目包管理器 | 安装仓库指定的 `pnpm 10.28.2` | 最终由助手检查安装 |
| `MAC-I12` | 依赖 | 首轮下载慢、未在 30 秒内完成 | npm registry 直连不稳定 | 限时执行，使用缓存和代理重试成功 | 安装流程支持代理 |
| `MAC-I13` | 依赖 | `sharp`、`esbuild` 安装脚本被 pnpm 忽略 | pnpm 10 构建审批机制 | 不盲目批准；真实构建和启动均成功 | 图片处理路径仍需测试 |
| `MAC-I14` | 启动 | 首次启动缺少 `employees/` | 当前调研工作区为 sparse checkout | 补全仓库已有目录后成功 | 测试环境问题，不改业务逻辑 |
| `MAC-I15` | 启动 | 后台失败只显示未就绪，看不到原因 | 初版启动器丢弃输出 | 写入运行日志，失败时显示日志尾部 | 已修复，未提交 |
| `MAC-I16` | 进程 | 停止后立即重启可能端口冲突 | 未等待进程退出 | 增加退出等待、必要时强制停止并清理状态 | 已修复，未提交 |
| `MAC-I17` | 回归 | Windows Node 测试未运行 | sparse checkout 没有 `windows/tests/` | 未扩大下载 | 提交前在完整工作区或 CI 验证 |
| `MAC-I18` | 首次运行 | `runtime/` 依赖各服务启动时零散创建，缺少统一预检 | 没有幂等初始化入口，也不会提前说明仓库目录缺失 | 新增 `negus:init`；创建必要运行目录、校验必需仓库文件，`start` 自动调用 | 已实现，未提交 |
| `MAC-I19` | 浏览器测试 | Midscene 未配置模型，不能执行其视觉自动化 | 本机没有 `MIDSCENE_*` 配置 | 改用内置浏览器控制，页面加载和控制台检查通过 | 需要无头视觉回归时再配置 |
| `MAC-I20` | Artifact 验收 | HTTP 发布没有可撤销的测试清理接口 | Artifact API 只有发布、读取和审核，没有删除 | HTTP 列表路由已验证；发布、审核、读取在临时隔离存储中通过 | 后续可增加独立 E2E fixture，不应为测试增加生产删除接口 |
| `MAC-I21` | 长任务验收 | 首次长任务请求被拒绝连接 | 前一轮收口已停止本地服务 | 使用 `negus:start` 恢复后，12 秒任务、状态和 SSE 心跳均通过 | 测试步骤应在服务停止前完成 |
| `MAC-I22` | 局域网 | 首次自检使用了错误的局域网 IP | 局域网地址不能手工假定 | 从默认路由接口 `en1` 获取当前地址 `192.168.124.88` 后，局域网地址 API 返回 200 | 后续启动指引应动态读取当前 IP |
| `MAC-I23` | 模型列表 | Android 显示旧模型列表 | macOS 发现逻辑未识别应用内置 runtime，服务回退到 PATH 的全局 `codex-cli 0.118.0` | 新增 macOS 应用 runtime 发现并按版本优先；Windows 顺序不变；重启后模型接口返回 GPT-5.6 列表 | 已验证，未提交 |
| `MAC-I24` | 固定公网入口 | 原 Windows 地址 `codex.negus.us.ci` 当前返回 502 | 原 Tunnel 或其 Windows origin 不在线；Mac 最初没有 `cloudflared` 和 Tunnel 凭据 | 已安装 `cloudflared 2026.8.2`，新增本机 Tunnel 生命周期工具；未改动原路由或 DNS | 完成账号授权后，由用户确认 Mac 专属固定子域名再绑定 |
| `MAC-I25` | 固定公网入口 | 通过 `pnpm negus:tunnel:setup -- <hostname>` 配置时，合法域名被拒绝 | pnpm 将参数分隔符 `--` 传给脚本，初版只读取第一个位置参数 | 改为忽略分隔符后读取域名；未执行任何 Tunnel 或 DNS 写入 | 已修复，待公网绑定复测 |
| `MAC-I26` | 固定公网入口 | 初次创建 Tunnel 被 Cloudflare CLI 拒绝 | `tunnel create` 的选项被放在 Tunnel 名之后，CLI 将其视为额外位置参数 | 调整为“选项在前、Tunnel 名在最后”；失败前没有创建 Tunnel 或 DNS | 已修复，待公网绑定复测 |
| `MAC-I27` | 固定公网入口 | `https://macmini.codex.negus.us.ci` 在 TLS 握手阶段被 Cloudflare 拒绝 | 当前 Zone 的 Universal SSL 仅覆盖根域名和一级子域名；该地址是二级子域名 | Tunnel、DNS、本机 origin 和连接器均已验证正常；Cloudflare Total TLS 不会为 Tunnel 主机名签发证书，需手动订购 Advanced Certificate，或改为一级子域名 | 等待域名策略决定；Tunnel 保留，不改 Windows 路由 |
| `MAC-I28` | 固定公网入口 | 用户选择的二级免费地址不具备 Universal SSL 覆盖 | Cloudflare 免费证书只覆盖一级子域名，Advanced Certificate 涉及付费 | 改用一级域名 `macmini.negus.us.ci`，新增显式 `negus:tunnel:move` 流程复用现有 Tunnel 且保留旧 DNS 记录；公网首页、项目 API、模型 API 均返回 200 | 已完成 |
| `MAC-I29` | 固定公网入口 | Mac 在新 DNS 创建后仍将 `macmini.negus.us.ci` 解析为不存在 | 系统 DNS 缓存了创建记录前的 NXDOMAIN；公共递归 DNS 已返回 Cloudflare 地址 | Tunnel 状态检查改用公共 DNS 查询后访问边缘，避免本机缓存误报公网不可用 | 已修复 |
| `MAC-I30` | 固定公网入口 | 公网状态检查在 Node 的自动地址选择模式下显示 `Invalid IP address: undefined` | 自定义 DNS 回调未处理 `options.all`，Node 期望地址对象数组 | 根据回调模式返回 `{ address, family }` 数组或单地址 | 已修复，待状态复测 |
| `MAC-I31` | 移动端分享 | Android 打开“分享当前对话”时，底部弹窗的链接区可能被视口下缘裁切 | 移动端规则仅将弹窗贴底并缩小二维码，没有为 `.dialog` 设置最大高度或纵向滚动；根页面又禁用了页面滚动 | 已增加动态视口最大高度、弹窗内部滚动和短视口二维码缩放；生产构建通过，公网已切换至新资源 | 用 Android Edge 实机复测交互 |

## 已通过验证

- PATH 自动发现 `codex-cli 0.118.0`，真实 `thread/list` 成功。
- frozen lockfile 依赖安装成功。
- TypeScript 与 Vite 生产构建成功。
- 本地服务启动、重复启动、状态、重启、停止成功。
- `/api/project`、`/api/device`、`/api/sessions` 返回真实数据。
- 先前生命周期测试结束后端口 `9360` 已关闭，PID 状态已清理；本轮功能验收结束后也已再次停止服务。
- `pnpm negus:diagnose` 在服务停止时仅报告 Node 服务不可达；服务启动后前端产物、Node 服务、Codex app-server、运行目录均通过。
- 浏览器实际加载首页、会话目录和输入区；初始化完成后没有控制台错误。
- 新建临时 Thread、SSE `connected`/`user_message_submitted`、真实 Codex 回复均通过；测试 Thread 已归档。
- 12 秒无写入长任务的运行状态、SSE 心跳和完成回复通过；测试 Thread 已归档。
- PNG 上传、原图读取和 `sharp` WebP 预览通过；测试媒体与预览已清理。
- Artifact HTTP 列表路由，以及隔离环境中的发布、审核、读取通过。

## 尚未验证

- 完整 Windows/Node 回归测试。
- 超过 12 秒的长任务与其断线恢复。
- 公网 Tunnel、外部链接、移动网络和断线恢复。
- 真实群聊身份下的 Artifact HTTP 发布、PWA 安装和移动端视觉验收。
