---
document_type: research_report
title: 自然语言生图、通用能力执行层与自动化工作台调研
status: completed
feature_id: FEAT-015
researched_at: 2026-08-04 15:18 +08:00
code_baseline: 45b445da2e9d1fe4f363577a5270a8d6e1bc355f
scope: Codex/GPT、Gemini、Claude 的 Skills 与工具调用机制，HappyEvering 图片 API 官方协议，临时 lynn-image-generate Skill，以及当前项目的生图与自动化工作台路线
---

# 自然语言生图、通用能力执行层与自动化工作台调研

## 一、研究问题

本报告回答四个问题：

1. 自然语言触发生图是否符合 Codex、GPT、Gemini、Claude 的主流机制。
2. 生图应该只是 Skill，还是应该拥有独立的执行和任务底座。
3. 当前项目怎样以最小改动接入已验证可用的中转站 API。
4. 怎样为未来生图自动化工作台、MCP、OpenClaw、Harness 类流程和定时任务保留统一扩展路径。

本报告只形成方案，没有调用中转站、修改产品代码或验证真实生图结果。

## 二、结论摘要

核心逻辑与主流 Agent 系统一致：

```text
自然语言
  -> 模型判断用户意图
  -> 选择 Skill / Tool
  -> Runtime 执行真实动作
  -> 返回结构化结果
  -> 对话、工作台或自动化流程展示结果
```

需要区分两层：

- GPT、Gemini、Claude 是模型或 API，负责理解、规划和产生工具调用。
- Codex、Gemini CLI、Claude Code、OpenClaw 等是 Agent Runtime，负责加载 Skills、暴露工具、执行动作、管理权限和保存状态。

因此，生图不能只写成一段 Skill 提示词。Skill 适合描述“何时触发、如何追问、怎样交付”；API 调用、密钥、任务状态、重试、结果保存和成本必须属于项目自己的 Capability Runtime。

## 三、官方机制快速对比

| 体系 | 工作流与自动选择 | 真实执行 | 生图特点 | 对本项目的含义 |
| --- | --- | --- | --- | --- |
| Codex / ChatGPT | Skills 使用 `SKILL.md` 描述目标和流程，可按描述隐式匹配，也可显式调用 | 内置工具、App Server 工具、MCP 或插件工具 | OpenAI 提供内置图片生成能力，也允许通过 API 或外部工具实现 | 当前可让 Luna 5.6 继续负责自然语言选择，不需要再做关键词路由 |
| GPT API | 应用把工具名称、描述和输入 Schema 提供给模型；模型返回结构化调用 | 应用执行 Function Call 后把结果返回模型 | Responses API 支持内置 `image_generation`，外部中转站也可包装为自定义工具 | GPT 模型本身不是任务队列，项目仍需保存运行和结果 |
| Gemini CLI / API | Gemini API 支持 Function Calling；Gemini CLI 支持 Agent Skills，并可从 `.gemini/skills` 和兼容目录发现 | CLI Tool Registry、自定义函数或 MCP 执行 | Gemini 有原生图片生成模型，也可以调用外部工具 | Skill 格式和工具调用思路可迁移，但权限和安装目录不同 |
| Claude Code / API | Claude API 产生 `tool_use`，应用返回 `tool_result`；Claude Code 支持 Agent Skills | 客户端工具、插件或 MCP 执行 | Claude 当前主要输出文字；照片和插画通常交给外部工具 | 使用外部生图 Capability 可以避免把系统绑定到具有原生生图能力的模型 |

### 官方资料

- OpenAI：[Build skills](https://learn.chatgpt.com/docs/build-skills)
- OpenAI：[Skills & Plugins](https://learn.chatgpt.com/docs/skills-and-plugins)
- OpenAI：[Codex App Server](https://learn.chatgpt.com/docs/app-server)
- OpenAI：[Image generation](https://developers.openai.com/api/docs/guides/image-generation)
- Google：[Function calling with the Gemini API](https://ai.google.dev/gemini-api/docs/function-calling)
- Google：[Gemini CLI Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/)
- Google：[Gemini CLI Tools API](https://geminicli.com/docs/core/tools-api/)
- Google：[Gemini API image generation](https://ai.google.dev/gemini-api/docs/image-generation)
- Anthropic：[Tool use with Claude](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- Anthropic：[Claude Code Skills](https://code.claude.com/docs/en/skills)
- Anthropic：[Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- Anthropic Support：[Can Claude produce images?](https://support.claude.com/en/articles/9002504-can-claude-produce-images)

外部产品和文档会继续变化。实际开发前应重新核对接口稳定性、模型可用范围和当前协议。

## 四、当前项目已有基础

代码基线：`45b445da2e9d1fe4f363577a5270a8d6e1bc355f`。

### 已经可以复用

- `app-server-client.mjs` 已启用 App Server Experimental API。
- `execution-tracker.mjs` 已识别 `mcpToolCall`、`dynamicToolCall` 和图片生成相关完成事件。
- `content-blocks.mjs` 已能把本地图片、图片 URL、Base64 图片和 `imageGeneration` 结果转换为页面内容块。
- `media-service.mjs` 已提供受控登记、读取和下载。
- `artifact-service.mjs` 已提供版本、审核、文件关系和 SSE 事件。
- `realtime-hub.mjs` 已提供事件广播与短期重放。

### 必须先补的边界

当前 `app-server-client.mjs` 对带 ID 的服务端请求立即自动返回结果，并对命令、文件修改和权限请求采用自动接受逻辑。Dynamic Tool、结构化补充信息和正式审批需要一个按请求类型分发、可等待真实处理结果的 Server Request Dispatcher；否则工具调用会被空响应提前结束，也无法形成可靠的权限边界。

这一改动不应只为生图写特例。它应成为审批、动态工具、MCP Elicitation 和以后其他 Capability 的共同协议层。

## 五、推荐架构

### 5.1 设计原则

1. 模型负责选择能力，不负责保存密钥和执行供应商协议。
2. Skill 负责方法，Tool/Capability 负责动作。
3. Capability Runtime 不依赖 Codex；Codex 只是第一个 Trigger Adapter。
4. 生图工作台不直连供应商，而是调用同一 Capability Runtime。
5. 所有入口产生相同的 Run、Artifact、事件和审计记录。

### 5.2 分层

```text
入口层
  Codex 对话 / 群聊 / 生图工作台 / 定时任务 / OpenClaw / API

工作流层
  Skill / Prompt Template / Automation Definition / Harness-like Pipeline

能力层
  Capability Registry
  generate_image / edit_image / inspect_image / publish_asset

运行层
  CapabilityRun / Queue / Cancellation / Retry / Policy / Budget

供应商层
  Relay Provider Adapter
  以后可增加 OpenAI、Gemini 或其他供应商 Adapter

成果层
  Media / Artifact / Version / Preview / Download / SSE / Audit
```

### 5.3 为什么不直接让 Skill 脚本调用中转站

Skills 可以包含脚本，但如果脚本直接保存密钥、请求外部 API 和随意写文件，会产生这些问题：

- 对话、工作台和定时任务出现不同执行逻辑。
- 项目无法统一展示排队、进度、取消和失败。
- 服务重启后难以判断任务是否已经被供应商接受。
- 成本、并发、幂等和重试无法集中控制。
- 换到 Gemini、Claude 或 OpenClaw 时需要重新包装脚本。

允许 Skill 调用工具，但工具必须进入统一 Capability Executor。

## 六、生图自动化工作台初步方案

### 6.1 工作台定位

工作台面向重复、批量和可视化管理，不替代自然语言对话：

- 对话适合一次性创作、快速改图和讨论。
- 工作台适合模板、批量、参考素材、队列、定时和结果比较。
- 两个入口共享任务、图片、版本和成本记录。

### 6.2 最小页面结构

| 区域 | 内容 |
| --- | --- |
| 创建区 | 提示词、约束、参考图、比例、尺寸、数量和模板 |
| 任务区 | 排队、运行、等待、失败、取消、重试和耗时 |
| 结果区 | 缩略图、并排比较、选中、继续编辑、下载和发布 |
| 历史区 | 来源入口、参数摘要、供应商、模型、版本和关联 Artifact |
| 自动化区 | 模板变量、计划、触发条件、预算、失败停止和通知 |

### 6.3 数据对象

`CapabilityRun` 是单次能力调用；`AutomationRun` 是一组按模板或计划展开的能力调用。二者必须分开，避免把一张图片生成和一整批自动化任务混成同一状态。

建议最小字段：

- `runId`、`capabilityId`、`triggerType`、`threadId`、`automationId`。
- `status`、`attempt`、`createdAt`、`startedAt`、`completedAt`。
- 标准化输入、Provider、Provider Job ID 和幂等键。
- 输出 Media ID、Artifact ID、宽高、格式和版本。
- 错误分类、是否可重试、调用次数和可获得时的成本。

## 七、推荐实施顺序

### M1：只完成最小自然语言生图闭环

- 定义一个 `generate_image` Capability。
- 建立中转站 Provider Adapter。
- 建立项目级生图 Skill，使 Luna 5.6 能按自然语言选择工具。
- 生成结果进入 Media 和 Artifact。
- SSE 展示真实状态。
- 暂不建设完整工作台。

### M2：把一次调用升级为可靠 Run

- 持久化状态和 Provider Job ID。
- 增加取消、幂等、超时、有限重试、并发和配额。
- 补 Server Request Dispatcher 和策略边界。
- 增加 MCP Adapter，为外部 Runtime 做准备。

### M3：建设自动化工作台

- 模板、变量、批量任务和队列。
- 结果比较、继续编辑和版本。
- 历史、成本、失败和重试。
- 手动自动化先于定时自动化。

### M4：增加计划和外部触发

- 定时任务和事件触发。
- OpenClaw Gateway 或其他渠道。
- Harness 类阶段、验证、审批和失败策略。
- Gemini、Claude 或其他 Agent 通过 MCP/Tool Adapter 复用。

## 八、成本、维护与安全

- API Key 只在服务端或受控 Worker 中读取。
- 明确单次最大图片数、尺寸、并发和每日预算。
- 外部 URL 若有有效期，成功后立即下载到允许目录并登记 Media。
- 异步 API 必须保存 Provider Job ID，服务重启后可恢复查询。
- 已被供应商接受的任务不能无条件自动重试，避免重复扣费。
- 定时任务默认采用更窄权限和预算，不能依赖无人处理的交互审批。
- Prompt 和参考图可能包含敏感内容，需要明确保存范围、保留期和下载权限。
- 图片安全和内容政策由供应商与项目策略共同约束，不能只依赖模型提示词。

## 九、HappyEvering 平台官方协议核查

核查来源：`https://api.happyevering.xyz/docs/`，核查时间为 2026-08-04。本次只读取公开文档，没有携带 API Key，也没有调用付费生图接口。

### 9.1 已确认的接口合同

| 项目 | 官方合同 | 对本项目的决定 |
| --- | --- | --- |
| Base URL 与鉴权 | OpenAI 风格 `/v1` Base URL，`Authorization: Bearer <API_KEY>` | Key 只由服务端 Provider Adapter 读取 |
| 文生图 | `POST /v1/images/generations`，JSON 请求 | 自然语言工具最终调用专用图片接口，不通过聊天接口绕行 |
| 图片编辑 | `POST /v1/images/edits`，支持 multipart 或 JSON | 统一定义 `edit_image` 输入；本地文件使用 multipart，远程 URL 使用 JSON |
| 多参考图 | multipart 重复提交 `image` 字段；JSON 使用 `images` 数组 | Provider Adapter 负责两种输入形式的转换 |
| Mask | PNG；透明区域编辑，不透明区域保留 | Capability 输入保存明确的 Mask 语义并验证 PNG |
| 输出 | `response_format` 支持 `b64_json` 或 `url` | 默认采用 `b64_json` 或立即下载 URL，结果必须进入 Media |
| 数量 | 默认最多 4 张，系统可配置范围 1 到 20 | Capability 设项目级上限，不能只依赖脚本的 1 到 20 校验 |
| 模型档位 | `gpt-image-2`、`gpt-image-2-2k`、`gpt-image-2-4k` | 按目标分辨率显式选择模型，不让提示词承担尺寸选择 |
| 比例与尺寸 | 支持像素尺寸和比例；`3:4` 在 1K 下映射为 `1024x1365` | 内部保留用户比例，同时记录实际输出宽高 |
| 自定义尺寸 | 单边 64 到 4096，总像素不超过 `4096x4096`；模型必须支持对应档位 | 在提交前完成尺寸与模型预校验 |
| 异步任务 | `async: true` 返回 HTTP 202、`id`、`status`、`poll_url` 和 `Retry-After` | Provider Job ID、原接口、原模型和下次轮询时间必须持久化 |
| 异步轮询 | 使用原 POST 接口，传相同 `model + task_id`；`async` 与 `stream` 互斥 | 不新增 GET 轮询假设，不更换模型探测任务 |
| 任务结果 | `queued/running` 返回 202；`succeeded/failed` 返回 200；404 表示不存在、过期、越权或模型不符 | 标准化为 CapabilityRun 状态和错误分类 |
| 成功领取 | 成功结果只能领取一次，随后任务删除 | 领取和保存必须作为关键事务处理，成功后立即写入受控媒体存储 |
| SSE | 图片接口返回进度与 completed 事件；客户端逐行解析 `data:` 并忽略心跳注释 | 不在业务层写死文档未给出的具体图片事件名称 |
| 错误 | OpenAI 风格 `error`；临时错误主要为 429、502、503、504，参数错误不应原样重试 | Provider Adapter 返回稳定错误码和 `retryable` 标记 |

### 9.2 官方文档尚未给出的合同

- 没有公开图片任务取消接口，因此“取消”只能先表示停止本地等待或阻止后续处理，不能承诺上游停止生成或退费。
- 没有公开幂等键。提交请求超时且是否已被接受不明确时，必须进入 `submission_unknown`，不能自动重新生图。
- 没有给出图片接口准确的 SSE 完成事件名称和完整事件 Schema；`image_generation.completed`、`image_edit.completed` 仍属于临时实现假设。
- `quality` 只出现在 Responses API 示例中，没有作为专用图片接口字段正式说明；`output_format` 未出现在文档中。
- 没有公开具体速率限制、并发限制、价格、返回 URL 有效期和部署实例的实际图片数量上限。

### 9.3 推荐调用策略

正式运行默认使用 Provider 异步任务，项目自己的 SSE 向聊天页面和工作台推送 `CapabilityRun` 状态。这样页面断开、Codex Turn 结束或服务重启后仍可恢复任务。Provider SSE 只保留为交互实验或诊断模式，不与项目向浏览器提供的 SSE 混为一层。

## 十、临时 `lynn-image-generate` Skill 点检

点检范围：

- `C:\Users\LIUHANCONG\.codex\skills\lynn-image-generate\SKILL.md`
- `agents/openai.yaml`
- `scripts/generate-image.ps1`
- `scripts/edit-image.ps1`
- `scripts/image-api-common.ps1`
- `config.json` 只核对字段和是否存在 Key，没有读取或记录 Key 内容。

### 10.1 可以保留的验证成果

- 已正确区分 `/images/generations` 和 `/images/edits`。
- 已包含 1K、2K、4K 模型选择和比例参数。
- 编辑脚本使用重复 multipart `image` 字段，符合官方多参考图说明。
- Mask 使用 PNG，并记录透明区域编辑、不透明区域保留的正确语义。
- 已能识别 URL、data URL 和 Base64，并为多结果生成编号文件名。
- 异步轮询保持原接口和原模型，方向正确。

### 10.2 必须修正的问题

1. `generate-image.ps1` 和 `edit-image.ps1` 把 `ResponseFormat` 参数默认设为 `url`，实际会覆盖 `config.json` 中的 `b64_json`。
2. `-Async` 提交后立即阻塞轮询，不是 Skill 文档描述的“后台工作”；提交、查询和等待必须拆成不同操作。
3. 轮询没有使用响应头 `Retry-After` 或正文 `retry_after_seconds`，而是使用固定的 10/15/20/30 秒退避。
4. 单次 HTTP 请求继续使用完整 `TimeoutSec`，没有受整体轮询剩余时间约束，实际总耗时可能超过任务截止时间。
5. Skill 写死 `image_generation.completed` 和 `image_edit.completed`，官方文档没有确认这些准确事件名。
6. SSE 解析只抽取图片值，没有标准化 queued、running、completed、failed、最后结构化错误和断流状态。
7. 输出文件统一使用 `.png`，没有按响应 MIME、文件签名或实际格式决定扩展名，也没有读取和记录实际像素尺寸。
8. Key 保存在全局 Skill 的明文 `config.json` 中；正式系统必须改为服务端环境变量或密钥存储。
9. 脚本直接拥有供应商协议、轮询、下载和文件保存，不具备任务持久化、服务重启恢复、Media/Artifact 登记和成本审计。
10. 已被 Provider 接受但客户端未收到明确响应的请求没有独立状态；若直接重试，存在重复生成和重复扣费风险。

### 10.3 正式改造定位

临时 Skill 不删除，继续作为人工诊断和协议验证工具；正式产品不直接调用这些 PowerShell 脚本。Skill 最终只负责自然语言触发、关键参数补全和结果交付说明，真实调用进入 `ImageCapability -> CapabilityRun -> HappyEveringImageProvider -> Media/Artifact`。

## 十一、开发前剩余确认项

整体架构和核心 API 合同已经确认，开发前只剩以下边界：

1. 当前账号或部署实例的真实数量、并发、额度和价格限制。
2. 同步、Provider SSE、异步提交和异步成功各保留一份脱敏响应样本，尤其核对图片完成事件结构。
3. URL 结果的有效期、下载鉴权和失败后的重新领取规则。
4. M1 使用 App Server Dynamic Tool 还是 MCP 作为首个 Codex 适配器；无论选择哪种，业务层均不得依赖实验协议。
5. 在用户明确授权后执行一次最低数量、1K、单图的真实验收，验证官方文档与当前部署一致。

## 十二、最终判断

自然语言生图、专门工作台、Skills、MCP、OpenClaw、Harness 类流程和定时任务不是互斥方案。它们分别属于入口、工作流、工具协议、运行时和调度层。

HappyEvering 已具备 M1 所需的生成、编辑、多参考图、Mask、分辨率映射、异步任务和标准错误能力。当前项目应先建立一个小而完整的生图 Capability，并把 Provider 的一次性结果领取、不可盲目重试和无上游取消接口作为正式约束，再逐步增加入口。这样 M1 仍然轻量，但不会因为先做了一个临时 Skill，导致未来工作台和自动化任务重新实现供应商调用、任务状态和成果管理。
