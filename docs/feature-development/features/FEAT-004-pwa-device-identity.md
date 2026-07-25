---
feature_id: FEAT-004
title: PWA、设备身份与移动/平板入口
status: implemented_pending_review
current_version: v0.1.0
last_updated: 2026-07-26 00:22 +08:00
owners: [pwa, device_identity, responsive_entry]
key_paths:
  - web-ui/public/manifest.webmanifest
  - web-ui/public/sw.js
  - web-ui/public/icons
  - web-ui/src/pwa
  - web-ui/src/features/device
  - web-ui/src/components/ViewSwitcher
  - windows/server/request-handler.mjs
  - windows/scripts/start-web-demo.ps1
---

# FEAT-004：PWA、设备身份与移动/平板入口

## 当前快照

- Web Demo 已包含 PWA Manifest、Service Worker、`192x192`、`512x512` 和 Apple Touch 图标。
- 用户通过一次带 `?token=` 的入口完成授权后，服务端会写入 HttpOnly Cookie；安装后的主屏幕应用不必依赖启动 URL 保留查询参数。
- 页面显示当前连接电脑的设备名和在线状态。设备名默认使用 Windows 主机名，可通过 `start-web-demo.ps1 -DeviceName` 修改。
- 单人 Codex 与项目群聊之间有共享切换入口；iPad 宽度使用接近电脑端的双栏布局。
- 当前代码已经完成基本构建和 Node 语法检查，等待用户在真实手机与 iPad 上体验。

## 用户可见结果

用户可以把页面添加到手机或 iPad 主屏幕，以更接近独立应用的方式打开；页面会告诉用户当前连接的是哪台电脑，并能直接切换单人对话和项目群聊。首次仍需使用带访问令牌的地址，后续同一浏览器或已安装应用可以通过受保护 Cookie 继续访问。

## 目标与边界

目标：在不重做现有单人页和群聊页的前提下，提供手机主屏幕入口、设备识别、基础在线提示和视图切换，让移动端使用不再依赖记忆当前页面与电脑身份。

当前不解决：

- 公网 Tunnel 的部署、域名和 HTTPS 证书；
- 多用户账号、正式登录、设备绑定和权限撤销；
- 多台电脑的自动发现与切换；
- 原生 iOS/Android 安装包和系统级推送通知；
- 离线执行 Codex 或离线缓存真实对话。

## 架构与数据链路

```text
start-web-demo.ps1 -DeviceName
  -> remote-room-demo.mjs
  -> request-handler /api/device
  -> deviceApi + useDeviceInfo
  -> DeviceStatus

?token=demo123
  -> server validates token
  -> HttpOnly SameSite cookie
  -> installed PWA starts without query token

index.html / group.html
  -> manifest + service-worker registration
  -> shared ViewSwitcher
  -> single Codex or group chat
```

## 开发计划与关键决策

- 复用现有单人页和群聊页，不新建第三套应用壳。
- 设备身份由服务端给出，避免浏览器自行猜测电脑名称。
- 令牌放入 HttpOnly Cookie，解决 PWA `start_url` 不能安全固定真实令牌、安装后又可能丢失查询参数的问题。
- Service Worker 只提供应用入口和静态资源基础能力，不伪装成离线可用的 Codex。
- Manifest、Service Worker 和 HTML 使用重新验证缓存策略，带内容哈希的构建资源继续长期缓存。
- iPad 使用响应式布局适配现有结构，不复制电脑端页面组件。

## 问题记录

| 问题编号 | 分类 | 状态 | 问题 | 根因与正确路径 |
| --- | --- | --- | --- | --- |
| `FEAT-004-I01` | 特例 | resolved | 安装后的 PWA 从 `start_url` 启动时可能没有 `?token=`，受保护接口返回 401 | 查询参数不是稳定应用身份；首次验证后写入 HttpOnly Cookie，后续 API 同时接受 Cookie |
| `FEAT-004-I02` | 特例 | deferred | 局域网 IP 或公网入口不一定满足完整 PWA 安装和 Service Worker 条件 | 除 localhost 外，完整 PWA 能力通常需要 HTTPS；正式公网阶段再配置 Tunnel、域名和 HTTPS |
| `FEAT-004-I03` | 普适 | active | 截图尺寸和真实 CSS 视口不一致，曾误判 iPad/手机布局 | 关联 `PROC-005`；图像与代码推断冲突时先核对 DOM、视口和元素坐标 |
| `FEAT-004-I04` | 普适 | active | 大范围扫描和补丁导致局部失败被放大 | 关联 `PROC-006`；文件发现用 `rg --files`，补丁按功能边界拆分 |
| `FEAT-004-I05` | 普适 | active | 后台进程命令被策略拦截后重复尝试同类方法 | 关联 `PROC-007`；确认策略限制后改用现有脚本或当前服务 |

## 版本时间线

### 2026-07-25 23:58 +08:00 | v0.1.0 | implemented_uncommitted

- 计划：让现有 Web Demo 可添加到手机主屏幕，显示所连接电脑，并适配 iPad 与单人/群聊切换。
- 实际：加入 Manifest、Service Worker、应用图标、设备信息接口与组件、共享视图切换、授权 Cookie 和平板布局。
- 偏差：没有在本轮配置公网 HTTPS、正式身份系统或多设备管理；这些不属于当前轻量 Demo 范围。
- 问题：`FEAT-004-I01` resolved；`FEAT-004-I02` deferred；关联 `PROC-005`、`PROC-006`、`PROC-007`。
- 验证：已完成前序基本构建与接口检查；具体设备安装和视觉体验由用户后续验收。
- 用户可见变化：主屏幕入口更接近独立应用，可看到电脑名称和在线状态，并能切换单人对话与群聊。
- Git：`uncommitted`。

### 2026-07-26 00:22 +08:00 | v0.1.0 | implemented_pending_review

- 计划：整理本功能的实际代码、边界和开发记录，完成基础检查后与 AI 功能日志体系一并发布。
- 实际：核对 PWA、设备接口、授权 Cookie、视图切换和 iPad 布局文件；完成 UI 生产构建及相关 Node 文件语法检查。
- 偏差：没有进行手机安装、视觉和公网 HTTPS 验收，继续交由用户实际体验。
- 问题：未新增功能问题；保留 `FEAT-004-I02` deferred 及 `PROC-005`、`PROC-006`、`PROC-007` 的防再犯约束。
- 验证：`pnpm build:ui` 通过；`remote-room-demo.mjs`、`request-handler.mjs`、`static-files.mjs` 通过 `node --check`。
- 用户可见变化：相较上一条记录无新增行为，本条仅确认当前实现已具备提交条件并进入待体验状态。
- Git：实现与本记录在同一次提交中发布。

## 下一步

- 用户先在真实手机和 iPad 上确认安装入口、布局和切换体验。
- 需要公网访问时，单独选择 HTTPS Tunnel 与正式鉴权方案，不把 Demo Token 当成账号系统。
- 需要多台电脑时，再设计稳定设备 ID、显示名、最后在线时间和设备选择，不仅依赖主机名。
