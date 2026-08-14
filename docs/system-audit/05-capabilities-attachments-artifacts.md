# 05 能力、附件与交付物

## 当前能力链路

| 能力 | 前端入口 | 后端入口 | 当前状态 |
| --- | --- | --- | --- |
| 附件草稿 | `useAttachmentDraft`、`AttachmentDraft` | `/api/uploads`、`media-service` | 单人和群聊都能上传，附件类型有共享模型 |
| 内容渲染 | 单人 `ContentRenderer` | `content-blocks`、媒体服务 | 单人支持 markdown、图片、音视频、文件和选项块 |
| 群聊内容 | `MessageTimeline` | 群消息附件和 Artifact ID | 群聊直接调用 `ReactMarkdown`，能力低于单人内容块 |
| Artifact | `ArtifactCollection`、审核控件 | `artifact-routes`、`artifact-service` | 群聊已有审核和重试入口，领域边界较清楚 |
| HTML/PDF 交付 | 单人结果和群聊 Artifact | `web-output-service`、Artifact 服务 | 交付物和媒体存储分开，方向正确 |
| 图片生成 | 单人 slash/自然语言入口、群聊能力菜单 | `image-generation`、MCP 服务 | 真实执行链存在，但群聊菜单没有直接接入完整能力解析 |
| Skill/App/MCP | 单人 slash command | 由会话运行时和外部工具处理 | 群聊目前只插入文字指令，尚未形成群聊能力协议 |

## 已确认问题

| 问题 | 证据 | 使用影响 | 级别 |
| --- | --- | --- | --- |
| 群聊能力菜单可能无法点击 | `GroupComposer.module.css` 的 `.composerArea` 使用 `pointer-events: none`，能力菜单未覆盖为 `auto` | 菜单能看到但选项可能无响应 | P1 |
| 能力菜单不是执行器 | `GroupComposer.insertCapability` 只插入 `/file`、`/image`、`/skill`、`/app` 文本；群聊路由按普通消息发送 | 用户会以为点击能力已经执行，实际可能只是发送指令文字 | P1/P2，取决于产品定义 |
| 两套 Markdown 渲染 | 单人 `ContentRenderer` 与群聊 `MessageTimeline` 各自创建 `ReactMarkdown` | 链接安全、图片、代码块、媒体和错误状态可能不同 | P1 |
| 媒体 URL 和内容块处理不完全共用 | 单人渲染器负责 `withAccessToken`、图片查看器和下载；群聊依赖 `AttachmentDisplay` | 同一个附件在两个入口可能出现不同展示或操作能力 | P2 |
| Artifact 展示嵌入群聊消息 | 群聊消息同时处理 Markdown、附件、Artifact 和审核状态 | 时间线组件承担内容渲染和业务审核，后续扩展容易变重 | P2 |

## 系统级能力接口建议

| 接口 | 作用 | 不应包含 |
| --- | --- | --- |
| `CapabilityDescriptor` | 描述命令、能力、适用上下文、输入要求、执行状态和结果类型 | 页面按钮样式和某个项目的默认 Agent |
| `AttachmentRef` | 统一附件 ID、名称、媒体类型、尺寸、读取状态、下载/预览 URL | 某个页面自己拼接 token URL |
| `ContentBlock` | 统一 markdown、image、audio、video、file、options 和 artifact 引用 | 群聊或单人特有的布局 class |
| `ArtifactRef` | 统一交付物 ID、版本、状态、审核动作和来源消息 | 只允许群聊使用的字段 |
| `CapabilityExecution` | 统一 queued/running/completed/failed/cancelled 和结果链接 | 直接把命令字符串当作执行成功 |

## 最小收敛路径

1. 保留当前单人 `ContentRenderer` 作为内容能力基线。
2. 把群聊消息转换成 `SessionMessage` 类似的 `MessageView`，再交给共享内容块渲染器。
3. 将群聊能力菜单改为选择 `CapabilityDescriptor`，由群聊路由判断是否执行、是否插入草稿或是否提示暂不可用。
4. Artifact 仍由独立服务负责，消息时间线只负责挂载和展示。
