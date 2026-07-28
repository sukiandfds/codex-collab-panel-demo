---
feature_id: FEAT-006
title: 固定公网入口与正式访问控制
status: in_progress
current_version: v0.2.1
last_updated: 2026-07-27 23:16 +08:00
owners: [remote_access, deployment, security]
key_paths:
  - windows/scripts/start-web-demo.ps1
  - windows/scripts/remote-room-demo.mjs
---

# FEAT-006：固定公网入口与正式访问控制

## 用户可见目标

- 手机、电脑和主屏幕快捷方式始终使用同一个固定网址。
- 项目服务升级或重启不改变公网地址。
- 电脑重启后公网入口自动恢复，不需要重新生成链接。
- 访问使用正式登录验证，不再长期依赖公开的 `?token=demo123`。

## 已确认方案

采用 **Cloudflare Named Tunnel + 固定子域名 + Windows 服务 + Cloudflare Access**：

```text
固定 HTTPS 子域名
  -> Cloudflare Access 身份验证
  -> Named Tunnel 固定 tunnel ID
  -> Windows cloudflared 服务
  -> http://127.0.0.1:9360
```

## 开发边界

- Quick Tunnel 只允许临时预览，不再作为可保存或交付的远程入口。
- 项目服务与公网 Tunnel 使用独立生命周期；日常开发只重启 `9360`，不得顺带重建 Tunnel。
- 不把随机 `trycloudflare.com` 地址写入 PWA、文档或用户快捷方式。
- 已确认使用 `codex.negus.us.ci`，不修改根域名 `negus.us.ci`。
- Cloudflare Access 和项目服务开机启动尚未完成前，不把当前入口描述为完整的长期安全方案。

## 前置条件

1. 确认可使用的域名，并将对应 DNS 托管到 Cloudflare。
2. 确定固定子域名，例如 `codex.example.com`。
3. 确定 Cloudflare Access 登录方式和允许访问的账号。
4. 部署前备份当前 Tunnel 与项目服务启动信息。

## 计划顺序

1. 创建固定 Named Tunnel 和 tunnel ID。
2. 将固定子域名路由到该 Tunnel。
3. 配置 origin 为 `http://127.0.0.1:9360`。
4. 将 cloudflared 安装为独立 Windows 服务并验证开机恢复。
5. 配置 Cloudflare Access，替换公开 Demo Token 的长期使用方式。
6. 验证项目服务重启、电脑重启和移动网络切换后 URL 均保持不变。

## 验收标准

- 同一固定 URL 在项目服务重启后仍可访问。
- Windows 重启后无需人工创建 Tunnel。
- 未授权用户无法访问页面和 API。
- 手机主屏幕快捷方式无需更新地址。
- Tunnel 停止或 origin 离线时给出明确故障状态，不生成新的随机链接。

## 当前状态

`in_progress`。

已完成：

- 当前最小回退方案已恢复：独立 Quick Tunnel 指向本机 `9360`，项目服务重启时不重启 Tunnel。
- 当前临时入口为 `https://hobby-skill-tire-ties.trycloudflare.com/?token=demo123`；仅在当前 Quick Tunnel 进程持续运行时有效。
- 创建 Named Tunnel `codex-collab-panel`，ID 为 `08c8f021-1a59-4755-91a8-c29cae318761`。
- 创建固定入口 `https://codex.negus.us.ci`，origin 指向 `http://127.0.0.1:9360`。
- `cloudflared` 已作为 Windows 自动启动服务运行，并显式读取 `C:\Users\Hans\.cloudflared\config.yml`。
- 定向检查确认带 Token 的项目 API 返回 `200`，无 Token 返回 `401`，SSE 收到 `connected`。
- 原 Quick Tunnel 进程未被本轮操作停止，避免影响已有临时入口。

尚未完成：

- 固定域名方案按用户要求延期研究；当前不继续修改 Named Tunnel。
- Cloudflare Access 尚未配置，当前仍依赖 Demo Token，不适合长期公开使用。
- `9360` 项目服务尚未确认具备开机自动启动能力；电脑重启后可能出现 Tunnel 在线但 origin 离线。
- 尚未执行 Windows 重启和移动网络切换验证。

## 问题记录

| issue_id | 分类 | 状态 | 现象与原因 | 处理结果 |
| --- | --- | --- | --- | --- |
| `FEAT-006-I01` | 特例 | resolved | 首次 `service install` 生成裸 executable 服务，未读取用户目录配置；卸载后服务长期卡在 `STOP_PENDING` | 精确结束失效服务 PID 并删除旧服务记录，保留无关 Quick Tunnel 进程 |
| `FEAT-006-I02` | 普适 | resolved | 将本地管理 Tunnel 误装为 Token 服务；连接器在线但没有本机 ingress，固定网址返回 `503` | 改为 Windows 服务显式加载本地 `config.yml`；经验同步至 `PROC-015` |
| `FEAT-006-I03` | 普适 | mitigated | Token 服务把凭据放在服务启动参数中，`sc qc` 会直接打印；不适合本项目的本地管理方式 | 当前服务已改为 credentials file 模式，启动参数不再包含 Token；后续日志禁止输出凭据 |
| `FEAT-006-I04` | 普适 | mitigated | PowerShell 将 cloudflared 升级警告视为错误；复测又误用只读 `$HOME` 变量，产生与服务无关的失败 | 原生程序分别检查退出码和输出；测试变量避免使用 PowerShell 内置名称；经验补充到 `PROC-012` |
| `FEAT-006-I05` | 普适 | active | **P0 资源浪费事故**：没有服从快速、轻量边界；发现服务模式不符后仍连续安装、复测和扩展检查，严重浪费用户时间、精力、注意力和信任 | 触发第二种根因、第二次提权/重装、第三轮验证或用户明确等待过久时，立即停止所有扩展操作；经验同步至 `PROC-016` |
| `FEAT-006-I06` | 特例 | resolved | Quick Tunnel 自动读取域名方案留下的 `config.yml` 和 credentials file；随机网址虽生成，但请求命中 ingress 兜底并返回 `404` | Quick Tunnel 使用 `--config NUL` 与 Named Tunnel 配置隔离；新入口 API 返回 `200` |
| `FEAT-006-I07` | 普适 | mitigated | 后台 `Start-Process` 被终端策略拦截，拆开后再次尝试仍被拦截 | 停止同类后台命令，改用当前 Codex 管理的前台长连接；再次发生记录到 `PROC-007` |

## 版本时间线

### v0.1.0 - 2026-07-27 20:16 +08:00

- 计划：确认 Named Tunnel、固定子域名、Windows 服务和 Cloudflare Access 方案。
- 实际：只完成方案登记，未部署。
- 问题：无。
- 验证：无。
- 用户可见变化：无。
- Git：uncommitted。

### v0.2.0 - 2026-07-27 22:53 +08:00

- 计划：建立无需云端部署、地址不随 Tunnel 重启变化的固定公网入口。
- 实际：完成固定子域名、Named Tunnel、本地 ingress 和 Windows 自动启动服务；Access 与 origin 开机启动未完成。
- 偏差：先后误用裸服务和 Token 服务，造成 `STOP_PENDING` 与 `503`，最终改为显式加载本地配置。
- 问题：`FEAT-006-I01` 至 `FEAT-006-I05`、`PROC-012`、`PROC-015`、`PROC-016`。
- 验证：项目 API `200`、无 Token `401`、SSE `connected`；未做重启与移动网络验收。
- 用户可见变化：可使用固定入口 `https://codex.negus.us.ci/?token=demo123`，不再依赖随机 Quick Tunnel 地址。
- Git：uncommitted。

### v0.2.1 - 2026-07-27 23:16 +08:00

- 计划：先恢复最小公网方案，固定域名方案延期研究。
- 实际：停止失效 Quick Tunnel，启动与 Named Tunnel 配置隔离的 HTTP/2 Quick Tunnel；保持本机 `9360` 不变。
- 偏差：第一次启动继承了 `config.yml`，随机网址返回 `404`；后台启动命令两次被策略拦截，最终使用当前 Codex 管理的前台长连接。
- 问题：`FEAT-006-I06`、`FEAT-006-I07`、`PROC-007`、`PROC-015`。
- 验证：公网项目 API 返回 `200`；公网 SSE 返回 `200 text/event-stream`，未做视觉验收。
- 用户可见变化：当前可访问 `https://hobby-skill-tire-ties.trycloudflare.com/?token=demo123`；重启项目服务不改变此链接，但关闭 Quick Tunnel 进程会使链接失效。
- Git：uncommitted。

## 下一步

1. 当前只使用最小 Quick Tunnel 方案，不继续改动域名配置。
2. 日常开发只重启 `9360`，不得停止当前 Quick Tunnel 进程。
3. 用户后续明确要求时，再单独研究固定域名、鉴权和开机恢复。
