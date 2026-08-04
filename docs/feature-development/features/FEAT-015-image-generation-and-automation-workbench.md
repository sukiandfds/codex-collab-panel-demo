---
feature_id: FEAT-015
title: 自然语言生图与自动化工作台
status: in_progress
current_version: v0.4.0
last_updated: 2026-08-04 18:39 +08:00
owners: [capability_runtime, app_server, image_generation, artifacts, web_ui]
key_paths:
  - .codex/config.toml
  - windows/server/image-generation/happyevering-client.mjs
  - windows/server/image-generation/image-output.mjs
  - windows/server/image-generation/mcp-server.mjs
  - windows/server/image-generation/web-image-intent.mjs
  - windows/server/image-generation/web-image-generation-service.mjs
  - windows/server/image-generation/image-generation-run-store.mjs
  - windows/tests/image-generation-mcp.test.mjs
  - windows/server/app-server-client.mjs
  - windows/server/execution-tracker.mjs
  - windows/server/content-blocks.mjs
  - windows/server/media-service.mjs
  - windows/server/artifact-service.mjs
  - docs/research/IMAGE_GENERATION_CAPABILITY_AND_AUTOMATION_WORKBENCH_RESEARCH_2026-08-04.md
---

# FEAT-015：自然语言生图与自动化工作台

## 当前快照

- 用户已明确：自然语言生图只是第一入口，后续还可能建设专门的生图自动化工作台。
- 当前主运行时是 Codex app-server，主要使用 GPT-5.6 Luna；已有一个经过用户实测、可以正常生图的中转站 API。
- 已核查 HappyEvering 官方文档：平台支持专用生成与编辑接口、多参考图、PNG Mask、1K/2K/4K、SSE 和异步任务。
- 已完成原生 Codex 最小闭环代码：`lynn-image-generate` Skill 通过项目级 STDIO MCP 调用 `generate_image` / `edit_image`，Provider 负责 HappyEvering 请求、异步轮询和本地保存。
- 密钥已从临时 Skill 明文配置迁移到 Windows 用户环境变量；仓库和新版 Skill 均不保存密钥。
- 已完成原生 Negus Image MCP 真实 2K 生图，以及网页版 1K 真实自然语言生图验收。
- 网页版已复用现有对话、SSE、执行状态和 Media 展示；生成结果与运行记录持久化，服务重启后仍能从侧栏打开并查看大图。
- 首版采用明确生图关键词和防误触规则；关键词识别、参数解析、执行服务、Provider 和运行记录分别管理，现有对话路由只负责分流调用。
- 全部 Node 测试和生产构建通过；Artifact、完整 `CapabilityRun`、自动化工作台和定时任务仍属后续阶段。
- 用户原话保存在 `docs/project-management/items/FEAT-015/item.md`，本文件只记录正式功能范围和阶段方案。

## 目标与边界

### 目标

建立一项不绑定单一聊天入口、模型或供应商的图片生成能力：

1. 用户可以在普通 Codex 对话中用自然语言触发生图或改图。
2. 生成过程有真实状态、失败原因、取消意图和结果记录；实际停止上游任务的能力以 Provider 合同为准。
3. 图片进入现有 Media 与 Artifact 体系，可预览、下载、复用和形成版本。
4. 后续生图工作台、定时任务、OpenClaw、Harness 类流程和其他模型可以复用同一执行层。

### 本阶段不做

- 不立即建设完整设计软件、节点编辑器或 Photoshop 替代品。
- 不让前端直接保存 API Key 或直接调用中转站。
- 首版不额外调用模型做意图分类；使用明确生图关键词，并排除“讨论生图功能、架构、工作台”等非执行语义。
- 不为 Codex、Gemini、Claude、OpenClaw 和定时任务分别实现一套生图逻辑。
- v0.3.0 不启动现有项目服务、不调用付费外部 API、不修改现有页面。

## 初步用户体验

### 对话入口

用户发送：

> 给这个项目画一张深色科技感的横版封面，保留标题区域。

Luna 5.6 识别为图片生成任务，调用正式生图能力。页面显示“排队中、正在生成、正在保存、已完成”中的真实状态，完成后直接显示图片和交付物入口。用户可以继续说“保持构图，把背景改成暖色”并引用上一版本。

### 自动化工作台

工作台不是另一套生图后端，而是同一个 Capability Runtime 的可视化入口。初步包含：

- 提示词与负面约束。
- 参考图、遮罩和历史版本。
- 尺寸、比例、清晰度、数量和供应商能力参数。
- 模板与变量，例如按产品清单批量生成封面。
- 任务队列、并发、暂停、取消、重试和失败原因。
- 多结果对比、选中、继续修改和发布为 Artifact。
- 定时或事件触发规则。
- 调用次数、耗时、供应商、模型和可获得时的成本记录。

## 目标架构

```text
聊天自然语言 / 生图工作台 / 定时任务 / OpenClaw 或其他入口
                         ↓
                 Trigger Adapter
                         ↓
        Skill / Workflow（何时用、怎样完成）
                         ↓
              Capability Registry
                         ↓
     CapabilityRun + Policy + Queue + Executor
                         ↓
          Image Provider Adapter（中转站）
                         ↓
       Media + Artifact + SSE + 运行历史
```

### 核心对象

| 对象 | 最小职责 |
| --- | --- |
| `CapabilityDefinition` | 能力名称、描述、输入/输出 Schema、权限、超时和限制 |
| `CapabilityRun` | 一次真实执行的 ID、来源、状态、参数、错误、时间和结果 |
| `ImageProviderAdapter` | 把统一输入转换为中转站请求，并标准化 URL、Base64 或异步任务结果 |
| `ImageAsset` / `Artifact` | 图片文件、尺寸、版本、来源任务、提示词摘要和下载入口 |
| `AutomationDefinition` | 模板、变量、触发条件、计划、预算和停止条件 |
| `AutomationRun` | 一次自动化运行及其子任务、结果、失败和重试记录 |

### Codex 接入

- Skill 负责告诉 Luna 5.6 何时调用生图、缺少哪些关键输入时才追问、输出应怎样交付。
- 正式工具负责执行，不把 API 调用、密钥、重试和文件保存写进提示词。
- 首个适配器已经确定为项目级 STDIO MCP：先在原生 Codex 跑通，再由网页 Codex 复用同一个 Provider/执行模块。
- App Server Dynamic Tool 不作为唯一入口；后续若网页端需要动态状态和 Artifact 登记，只增加网页适配层，不重写 HappyEvering Provider。

### HappyEvering Provider 合同决定

- 正式调用使用 `/v1/images/generations` 和 `/v1/images/edits`，不通过 Chat Completions 绕行。
- 文生图、图片编辑、多参考图和 Mask 使用统一的 Capability 输入，由 Provider Adapter 转换为 JSON 或 multipart。
- 默认采用 Provider 异步任务，项目自己的 SSE 向浏览器展示状态；Provider SSE 只作为实验或诊断模式。
- 轮询必须保存并使用原接口、原模型、Provider Job ID 和 `Retry-After`。
- Provider 成功结果只能领取一次，领取后必须立即写入 Media，再创建或更新 Artifact。
- Provider 没有公开取消接口；M1 的取消只停止本地等待和后续处理，不承诺上游停止或退费。
- Provider 没有公开幂等键；提交结果不明确时进入 `submission_unknown`，不得自动重复提交。
- `response_format` 只使用官方确认的 `b64_json` 或 `url`；暂不依赖未正式说明的 `output_format`、图片接口 `quality` 和具体 SSE 完成事件名。

## 阶段路线

### 当前实施切片：原生 Codex 与网页 Codex 最小闭环

- 项目级 `.codex/config.toml` 注册 `negus_image`（Negus Image）STDIO MCP。
- `generate_image` 支持自然语言文生图；`edit_image` 支持多参考图和 PNG Mask。
- Provider 固定使用 `b64_json` 发起异步任务，遵循 `Retry-After`，不在提交结果未知时自动重提。
- 返回 Base64 或 URL 时均保存本地文件，按真实 MIME/图片内容决定扩展名并报告实际像素尺寸。
- Skill 只负责自然语言意图、参数映射和结果展示；密钥、HTTP、轮询和文件保存由 MCP 执行层负责。
- 已完成 Mock、STDIO 协议和一次 16:9、2K 真实生图验证；新任务中的 MCP 自动发现仍待验证。
- 网页对话支持 `生成图片`、`生图`、`画一张`、`改图`、`/image` 和 `Negus Image` 等明确表达，直接复用 Provider，不启动 MCP 子进程。
- 网页请求立即返回 `202`，后台生成并通过现有执行状态与会话刷新展示结果；图片保存到 `runtime/generated-images/<runId>`。
- 运行记录保存到 `runtime/image-generation-runs.json`；全新空会话只执行生图时，也能在服务重启后恢复到侧栏和聊天记录。

### M1：对话自然语言生图

- 一个 `generate_image` 能力和一个中转站 Provider Adapter。
- 同时定义 `edit_image` 的统一输入；首期实现至少完成文本生图，编辑能力不再存在协议不确定性。
- Provider 默认异步执行；真实 `CapabilityRun` 状态通过项目 SSE 展示。
- 输出登记到 Media 和 Artifact。
- 服务端保存密钥并限制数量、尺寸、并发和超时。
- 完成 HappyEvering Provider 的 Mock 合同测试后，再进行一次用户授权的最低成本真实验收。

### M2：通用能力运行底座

- 持久化 `CapabilityRun`。
- 支持排队、取消意图、提交未知、超时、有限重试和恢复；没有 Provider 幂等键时不得假装具备幂等提交。
- 建立能力权限、配额、成本和审计字段。
- 增加 MCP 暴露层或稳定工具适配器。

### M3：生图自动化工作台

- 创建、复制和版本化生图模板。
- 使用参考素材、变量和批量数据发起任务。
- 查看队列、历史、结果对比、失败和成本。
- 从工作台继续编辑或回到对话讨论某个结果。

### M4：自动化和外部运行时

- 定时、事件和人工触发共用 `AutomationDefinition`。
- OpenClaw Gateway、Harness 类 Pipeline、Gemini、Claude 或其他 Agent 通过适配器提交同一种运行对象。
- 高风险外部发布、批量高成本任务和永久计划必须进入策略或审批。

## 完成判定

### M1 完成判定

- 不输入固定命令，至少三种自然语言表达都能稳定选择生图能力。
- 模型未要求生图时不会因为普通“图片”讨论误调用。
- 浏览器不接触中转站密钥。
- 成功结果在聊天中可见，并能下载或作为 Artifact 继续使用。
- 超时、配额、供应商错误和无效响应有明确状态，不伪装成成功。
- 同一任务重试不会无意生成无法追踪的重复订单。

### 工作台完成判定

- 对话和工作台生成的任务出现在同一运行历史中。
- 模板、批量任务和定时任务不会绕过统一权限、预算和结果登记。
- 用户可以找到每张图的来源任务、参数、版本和失败记录。
- 关闭页面或服务恢复后，仍能判断任务最终状态。

## 风险与待确认

- 已确认中转站为 OpenAI 风格接口，并支持 URL、Base64、异步 Job、参考图、多图输入和 Mask。
- 尚未确认可复现种子、单次价格、速率限制、并发限制和当前账号的实际图片数量上限。
- 尚未确认 URL 有效期；系统按必须立即下载到本地受控目录设计。
- 官方没有公开任务取消和幂等接口；取消与重试必须采用保守语义。
- 官方没有给出图片 SSE 的准确完成事件名称，不能写死临时 Skill 中的事件名。
- 自动化任务无人值守时的预算、失败停止和审批策略。
- 原生 Codex MCP 与网页 Codex 最小适配已完成；Artifact 登记、完整通用运行底座和自动化工作台尚未实现。

## 关联调研

- `docs/research/IMAGE_GENERATION_CAPABILITY_AND_AUTOMATION_WORKBENCH_RESEARCH_2026-08-04.md`
- `项目战略与多角色评审/06-OpenClaw-Harness及衍生项目对比与群聊Agent优化建议-2026-07-26.md`
- `项目战略与多角色评审/09-Windows远程审批阻塞与OpenClaw机制对比调研-2026-07-28.md`

## 版本时间线

### 2026-08-04 14:39 +08:00 | v0.1.0 | planned

- 将自然语言生图和未来专门的生图自动化工作台合并为一个正式功能域。
- 明确 Skill 不是唯一实现；Skill 负责工作方法，Capability Runtime 负责真实执行。
- 明确对话、工作台、定时任务和外部 Agent Runtime 必须复用同一能力执行层。
- 完成跨 Codex/GPT、Gemini、Claude 的快速机制调研。
- 本轮只建立需求、项目记录和调研报告，没有开发代码。

### 2026-08-04 15:18 +08:00 | v0.2.0 | planned

- 完成 HappyEvering 官方图片 API 合同核查，确认生成、编辑、多参考图、Mask、尺寸模型、异步轮询和错误边界。
- 完成临时 `lynn-image-generate` Skill 点检，记录默认参数覆盖、伪后台异步、轮询、SSE、密钥和结果保存问题。
- 决定正式运行默认采用 Provider 异步任务、项目 SSE 展示，并把一次性结果领取和不可盲目重试列为系统约束。
- 本轮只更新需求和调研文档，没有修改产品代码或调用付费接口。

### 2026-08-04 16:17 +08:00 | v0.3.0 | in_progress

- 新增项目级 `lynn_image` STDIO MCP，暴露 `generate_image` 和 `edit_image` 两个工具。
- 新增 HappyEvering Provider 与图片保存模块，支持 JSON 生成、multipart 编辑、异步轮询、`Retry-After`、Base64/URL 和真实格式识别。
- 将 `lynn-image-generate` Skill 改为 MCP 工作流，并把 API Key 从 Skill 明文配置迁移到 Windows 用户环境变量。
- 5 项 Mock/STDIO 测试通过；未启动现有服务、未修改 UI、未调用真实付费生图接口。

### 2026-08-04 17:16 +08:00 | v0.3.1 | in_progress

- 将项目级生图 MCP 从 `lynn_image` 正式命名为 `negus_image`（Negus Image），同步更新 MCP 自报名称、Skill 引用和测试断言。
- 保留现有 `LYNN_IMAGE_*` 环境变量作为底层兼容接口，不要求重新配置密钥或 Provider 参数。
- 已通过 Negus Image MCP 完成一次 16:9、2K（2560×1440）真实生图验证；现有网页 UI 未改变。

### 2026-08-04 18:39 +08:00 | v0.4.0 | in_progress

- 网页单人 Codex 已接入明确自然语言生图分流，复用 HappyEvering Provider、现有 SSE、执行状态、Media 和图片大图查看。
- 关键词识别、参数合同、网页执行服务、Provider、图片保存与运行记录已拆分管理；现有会话路由仅调用和分流。
- 完成一次 1:1、1K 真实网页生图；验证请求接受、生成状态、结果显示、大图查看、服务重启后侧栏恢复与图片持久化。
- 全部 Node 测试 94 项通过，生产 UI 构建通过；自动化工作台、Artifact 和定时任务继续按后续阶段开发。

## 下一步

推送当前开发分支并由用户在另一台电脑拉取后验收网页版生图。拉取代码不会同步 API Key；目标电脑需要已有 `LYNN_IMAGE_API_KEY` 用户环境变量，再启动项目服务。
