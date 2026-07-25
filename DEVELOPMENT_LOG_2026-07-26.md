# 开发日志：PWA、设备身份与 AI 功能记录体系

记录时间：2026-07-26 00:22 +08:00

当前分支：`codex/publish-current-panel`

提交前基线：`5a8ad71 Improve Codex web control and mobile collaboration`

## 1. 本次发布状态

本次把两部分已经完成但尚未提交的工作整理为同一版：

1. 手机/iPad 主屏幕入口、设备身份和单人/群聊切换；
2. 面向 AI 助手的按功能开发记录体系。

功能代码和记录文档在同一次提交中发布。`FEAT-004` 已从 `implemented_uncommitted` 更新为 `implemented_pending_review`，表示代码与基础检查完成，真实手机、iPad 和视觉效果仍等待用户体验。

## 2. PWA 与设备入口

已经完成：

- PWA Manifest、Service Worker、192/512/180 图标；
- 首次 token 授权后写入 HttpOnly Cookie，支持安装后的应用从无查询参数入口启动；
- 页面显示当前电脑名称和在线/重连状态；
- `start-web-demo.ps1 -DeviceName` 可设置显示名称，默认使用 Windows 主机名；
- 单人 Codex 和项目群聊使用共享切换组件；
- iPad 宽度使用接近电脑端的布局；
- Manifest、Service Worker 和 HTML 使用重新验证缓存策略。

当前边界：

- 公网 Tunnel、域名和 HTTPS 尚未配置；
- Demo Token 不是正式账号或多用户鉴权；
- 没有多电脑发现、绑定和切换；
- 没有原生 App、系统推送或离线 Codex；
- 未在真实手机和 iPad 上完成本次版本的安装与视觉验收。

详细记录：`docs/feature-development/features/FEAT-004-pwa-device-identity.md`。

## 3. AI 功能开发记录体系

新增目录：`docs/feature-development/`。

- `FEATURE_INDEX.md`：功能编号、当前状态、版本和入口；
- `features/FEAT-*.md`：一个功能从计划、实现、问题到多个版本的连续记录；
- `PROCESS_ISSUES.md`：跨功能复用的根因、错误路径、正确路径和防再犯触发器；
- `README.md`：字段、编号、特例/普适分类和强制更新时间。

当前已登记：

- `FEAT-001`：单人 Codex Web 对话与控制；
- `FEAT-002`：项目群聊与多 Agent 讨论；
- `FEAT-003`：附件与内容渲染；
- `FEAT-004`：PWA、设备身份与移动/平板入口；
- `FEAT-005`：Desktop/Web 连续性与统一控制权；
- `PROC-001` 至 `PROC-012`：已知普适开发问题和防再犯规则。

`AI_ASSISTANT_READ_FIRST.md` 已加入强制阅读和回写顺序。旧日期日志继续保留为原始证据，不再作为 AI 首要入口。

用户在本轮决定暂不新增名为 `AI助手请看这个.md` 的中文别名文件，当前根入口仍为 `AI_ASSISTANT_READ_FIRST.md`。

## 4. 基础检查

- `pnpm build:ui`：通过，TypeScript 和 Vite 生产构建完成；
- `node --check windows/scripts/remote-room-demo.mjs`：通过；
- `node --check windows/server/request-handler.mjs`：通过；
- `node --check windows/server/static-files.mjs`：通过；
- 未执行浏览器、截图、像素或真实设备验收；
- 未启动或重启本地服务。

## 5. 仍需保持的产品边界

1. Codex Desktop 与 Web 仍是共享持久化 Thread、实时运行实例分离，已打开的 Desktop 页面不会热同步 Web 外部事件。
2. 单人 Turn 和群聊多 Agent 队列仍属于不同状态模型，不能因为共用 SSE 或展示组件就强行合并。
3. 正式公网访问前必须补充 HTTPS 和正式鉴权，不能直接把固定 Demo Token 当作产品登录系统。
4. 视觉效果、PWA 安装和 iPad 体验由用户实际验收，基础构建通过不代表体验已经确认。
5. 后续每次功能开发结束前，必须更新对应 `FEAT-*.md`；发现普适问题时同步更新 `PROCESS_ISSUES.md`。
