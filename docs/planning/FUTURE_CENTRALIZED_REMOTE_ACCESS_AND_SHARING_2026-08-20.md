# 后续规划：集中式公网入口与资源分享

日期：2026-08-20
状态：讨论记录，未进入开发
范围：未来商业化和小范围朋友测试的账号、固定域名、设备绑定与分享能力

## 本次确认的产品方向

- `negus.us.ci`、Cloudflare、Tunnel、域名和访问策略由 Negus 运营方集中控制；朋友不需要注册或配置 Cloudflare。
- 每位朋友在自己的电脑运行 Negus 后，可以获得一个由 Negus 分配的固定链接。
- 固定链接应代表一个可迁移的“工作区”，而不是不可变的物理设备；用户更换电脑后，后台重新绑定连接器，原链接可以保持不变。
- Google 登录或其他账号登录是未来用户身份入口；当前 `?token=demo123` 只能用于开发测试，不是正式登录方案。
- 分享能力应接近 Google Drive：主人可选择分享全部工作区、一个项目或一个会话；接收者只能访问被授权的范围。

## URL 层级建议

```text
https://alice.negus.us.ci/
https://alice.negus.us.ci/p/<project-public-id>
https://alice.negus.us.ci/p/<project-public-id>/s/<session-public-id>
https://alice.negus.us.ci/share/<opaque-share-id>
```

用户偏好的正式入口形式也已记录，待中心路由层实施后采用：

```text
https://codex.negus.us.ci/<workspace-or-device>/
https://codex.negus.us.ci/<workspace-or-device>/p/<project-public-id>
https://codex.negus.us.ci/<workspace-or-device>/p/<project-public-id>/s/<session-public-id>
```

其中首段优先使用稳定的工作区或用户名 slug，而不是操作系统即时设备名；设备改名、迁移或多设备绑定时，公开链接无需变化。

| 层级 | 含义 | 是否直接授予权限 |
| --- | --- | --- |
| 子域名 `alice.negus.us.ci` | 工作区和其当前绑定的本机连接器 | 否 |
| `/` | 登录者可访问的全部项目 | 否，按授权后的项目列表显示 |
| `/p/<project-public-id>` | 一个项目 | 否 |
| `/p/<project-public-id>/s/<session-public-id>` | 一个会话 | 否 |
| `/share/<opaque-share-id>` | 一个特定分享邀请 | 只作为服务端校验的分享凭据入口 |

资源路径负责定位“看什么”；服务端权限记录负责决定“谁能看、能做什么”。路径、项目名、会话名或猜到的 URL 本身不能成为授权条件。

## 连接与路由原则

朋友的电脑是彼此独立的 origin。Cloudflare Named Tunnel 的公网路由首先依赖主机名，因此不同工作区不能同时使用完全相同的 `codex.negus.us.ci` 并连接到不同电脑，否则请求可能被转发到错误电脑。

适合小范围测试的结构是：

```text
alice.negus.us.ci -> Alice 工作区的专属 Tunnel -> Alice 的本机 Negus
bob.negus.us.ci   -> Bob 工作区的专属 Tunnel   -> Bob 的本机 Negus
```

项目和会话使用路径区分。未来若希望所有用户共用单一主域名并用 `/<workspace-or-device>/...` 路径路由到不同电脑，则需要额外的中心代理或中继服务；这不是当前直接 Tunnel 方案自动具备的能力。该层需要维护工作区到在线连接器的映射，正确转发 HTTP、SSE、WebSocket（如后续使用）和静态资源，并处理路径前缀。

## 未来用户体验

1. 用户注册 Negus，使用 Google 或其他正式身份登录。
2. 用户安装或由助手安装本机 Negus 连接器。
3. 用户在网页或客户端输入一次性、短时有效的配对码。
4. Negus 平台创建工作区、分配固定子域名，并签发该连接器所需的受限凭据。
5. 用户访问固定 HTTPS 链接，不需要配置端口映射、Cloudflare、域名或公网 IP。
6. 工作区主人在界面中选择“分享全部 / 分享项目 / 分享会话”，指定 Google 邮箱或生成带有效期、可撤销的分享链接。

## 权限模型方向

分享记录至少应包含：目标资源类型和 ID、被授权账号或分享链接 ID、权限等级、创建人、有效期、撤销状态与审计时间。

初步权限等级可保留为后续讨论项：

- 仅查看。
- 可评论或发送普通消息。
- 可发起 Codex 任务。
- 工作区管理员。

Cloudflare Access 可负责网络边缘的登录门禁；Negus 自身仍必须做工作区、项目和会话级的授权判断，不能把动态分享关系只放在 Cloudflare 配置中。

## 凭据与安全边界

- Cloudflare API Token、Tunnel 凭据和域名管理权限只保留在 Negus 运营方控制的服务中，不写入朋友的项目目录、不发给朋友。
- 本机连接器只获得本工作区所需的最小、可撤销凭据。
- 配对码应一次性、短时有效，且不等同于长期登录凭据。
- 正式分享链接应使用不可枚举的随机 ID，并支持过期和撤销。
- 不应把长期权限放入查询参数，也不应继续把 `demo123` 作为公网多人访问机制。

## 当前范围与后续边界

本轮 macOS 公网测试只验证单台 Mac 的固定入口、Tunnel、HTTPS、外网连通性和基础恢复行为。它不实现上述账号系统、集中式 Tunnel 签发、工作区控制台、配对码或资源级分享。

后续开发前需要单独确认：

1. 工作区子域名的命名、保留和迁移规则。
2. 用户可绑定单台还是多台电脑，以及离线设备的展示和切换方式。
3. 登录提供商、账号体系和邀请流程。
4. 每种分享范围对应的具体操作权限。
5. 中心控制服务的部署位置、数据保存范围、日志审计和费用模型。
6. 小范围人工开通与后续自动签发之间的过渡方案。
