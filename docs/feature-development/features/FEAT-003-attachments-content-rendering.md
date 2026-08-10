---
feature_id: FEAT-003
title: 附件与对话内容渲染
status: implemented_pending_review
current_version: v0.3.0
last_updated: 2026-07-25 22:49 +08:00
owners: [attachments, content_rendering, media]
key_paths:
  - web-ui/src/features/attachments
  - web-ui/src/features/conversations/rendering
  - windows/server/content-blocks.mjs
  - windows/server/media-service.mjs
---

# FEAT-003：附件与对话内容渲染

## 当前快照

- 对话支持 Markdown、代码、表格、选项、图片、音频、视频和普通文件块。
- 单人页和群聊共用附件选择、预览、上传状态和移除能力。
- 本地结构化图片和 Markdown 本地图片会登记到受控媒体服务，再通过带权限的 `/api/media/<id>` 加载。
- 每个附件当前限制 `20 MB`，一次最多 `6` 个；尚无分片、断点续传和字节级进度。

## 用户可见结果

用户可以从输入框选择图片或文件并发送；图片直接显示，音频和视频使用浏览器控件，其他文件提供打开/下载。上传时会显示阶段提示。浏览器不能任意读取电脑路径，只能访问服务端已经登记的媒体。

## 目标与边界

目标：保证真实 Codex 对话中的主要内容类型不会被压平成错误文本，并提供最小可用的附件发送链路。

当前不解决：

- 任意 HTML 在页面内直接执行；HTML 默认作为文件打开或下载；
- 大文件分片、断点续传、病毒扫描和云对象存储；
- 允许浏览器传入任意绝对路径读取本机文件；
- 复杂办公文档在对话内完整编辑。

## 架构与数据链路

```text
Codex item / JSONL content
  -> content-blocks parser
  -> ContentBlock[]
  -> ContentRenderer

Browser selected files
  -> attachmentApi
  -> media-service registration
  -> attachment IDs
  -> Codex message / group message

Local image path in Markdown
  -> server-side recognition
  -> media-service.register
  -> /api/media/<id>
  -> withAccessToken
```

## 开发计划与关键决策

- 内容解析属于服务端/数据层，视觉展示属于 renderer，上传草稿属于 attachments 功能域。
- 媒体必须通过登记 ID 访问，不增加“客户端传绝对路径”的通用接口。
- HTML 等高风险内容不直接嵌入执行；当前优先下载或新窗口打开。
- 性能上图片懒加载，音视频使用 `preload=metadata`，避免会话加载时下载全部媒体。

## 问题记录

| 问题编号 | 分类 | 状态 | 问题 | 根因与正确路径 |
| --- | --- | --- | --- | --- |
| `FEAT-003-I01` | 特例 | resolved | 纯文本模型破坏图片、选项和文件结构 | 解析层只保留 text；改为 `ContentBlock` 判别联合类型 |
| `FEAT-003-I02` | 特例 | resolved | Markdown 中本地绝对路径图片显示破图 | 浏览器不能读取 `C:/...`；服务端识别并登记到 media-service |
| `FEAT-003-I03` | 特例 | mitigated | 上传只有阶段提示，没有百分比 | 当前请求协议没有字节进度事件；正式大文件能力需单独设计 |
| `FEAT-003-I04` | 普适 | active | 曾只从前端理解图片渲染，遗漏服务端安全边界 | 见 `PROC-001`；媒体功能必须同时核对解析、登记、鉴权和渲染 |

## 版本时间线

### 2026-07-22 | v0.1.0 | implemented

- 计划：修复真实对话内容被错误压平的问题。
- 实际：建立结构化内容块和独立 `ContentRenderer`。
- 偏差：当时只覆盖已结构化媒体，本地 Markdown 路径仍未解决。
- 问题：`FEAT-003-I01` resolved；`FEAT-003-I02` 尚未发现。
- 验证：见 `../../records/DEVELOPMENT_LOG_2026-07-22.md`。
- Git：相关变化进入 `8cf1e3e` 前后的开发线。

### 2026-07-25 00:04 +08:00 | v0.2.0 | implemented_pending_review

- 计划：让输入框可以发送图片和其他附件。
- 实际：完成选择、预览、上传、ID 解析和单人/群聊消息附件。
- 偏差：上传进度仍为阶段提示。
- 问题：`FEAT-003-I03` mitigated。
- 验证：见 `../../records/DEVELOPMENT_BUG_LOG_2026-07-25.md`。
- Git：`5a8ad71`。

### 2026-07-25 22:49 +08:00 | v0.3.0 | implemented_pending_review

- 计划：修复助手 Markdown 本地图片并统一附件反馈。
- 实际：本地 Markdown 图片接入 media-service；单人和群聊共享上传状态组件。
- 偏差：没有扩展任意本地文件读取接口，保持最小安全范围。
- 问题：`FEAT-003-I02` resolved；`FEAT-003-I04` 转为普适经验。
- 验证：两张测试图片通过 `/api/media/...` 加载，构建和定向测试通过。
- Git：`5a8ad71`。

## 下一步

- 根据真实文件大小决定是否需要字节级进度和分片上传。
- 新内容类型先扩展 `ContentBlock`，不要在页面组件中加入字符串猜测。
- HTML 预览需要独立安全沙箱设计，当前不直接执行。
