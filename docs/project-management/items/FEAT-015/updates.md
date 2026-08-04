# FEAT-015 更新记录

### 2026-08-04 18:39 +08:00

- 状态：in_progress
- 本次更新：完成网页单人 Codex 最小生图闭环。明确关键词触发后，请求立即返回，后台直接复用 HappyEvering Provider，并通过现有执行状态、会话消息和 Media 显示结果。
- 文件边界：关键词识别、参数解析、网页执行服务、Provider、图片保存和运行记录分别管理；现有对话路由只负责调用和分流。
- 持久化：图片保存到项目 `runtime/generated-images/<runId>`，运行记录保存到 `runtime/image-generation-runs.json`；全新空会话只生图时，服务重启后仍出现在侧栏并可查看图片。
- 真实验收：网页版生成一张 1:1、1K 产品摄影图成功，状态显示、缩略图、大图查看和重启恢复均通过。
- 自动验证：全部 Node 测试 94 项通过，生产 UI 构建通过。
- 剩余范围：Artifact、完整通用运行底座、专门生图工作台和定时任务继续作为后续阶段。

### 2026-08-04 17:16 +08:00

- 状态：in_progress
- 本次更新：将项目级生图 MCP 从 `lynn_image` 正式命名为 `negus_image`，用户可见名称为 Negus Image。
- 兼容性：MCP 自报名称、错误前缀、Skill 引用和测试断言已同步；底层 `LYNN_IMAGE_*` 环境变量继续兼容，无需重新配置。
- 验证基线：此前已通过同一 MCP 执行一次 16:9、2K（2560×1440）真实生图；本次改名后继续运行 Mock/STDIO 测试确认功能不变。
- 用户影响：后续在 Codex 中看到和调用的 MCP 标识为 `negus_image`；网页版尚未接入。

### 2026-08-04 16:17 +08:00

- 状态：in_progress
- 本次更新：完成原生 Codex 最小生图闭环代码。项目级 `.codex/config.toml` 注册 `lynn_image` STDIO MCP，提供 `generate_image` 和 `edit_image`；Provider 负责 HappyEvering JSON/multipart 请求、异步轮询、`Retry-After`、Base64/URL 结果和本地保存。
- Skill：`C:\Users\LIUHANCONG\.codex\skills\lynn-image-generate` 已改为调用 MCP，不再以旧 PowerShell 脚本作为正常入口；`quick_validate.py` 校验通过。
- 密钥：旧 Skill 中的 API Key 已迁移到 Windows 用户环境变量，仓库与新版 Skill 配置不保存密钥明文；新开的 Codex 任务才能继承新环境变量和项目 MCP 配置。
- 验证：`node --check` 通过；`node --test windows/tests/image-generation-mcp.test.mjs` 5/5 通过，覆盖异步轮询、多参考图与 Mask、URL 下载与真实扩展名、错误脱敏、STDIO MCP 工具发现。
- 用户影响：当前项目的新 Codex 任务可以发现自然语言生图/改图工具；现有网页 Codex 与 UI 未改变。
- 未执行：没有启动或重启现有项目服务，没有运行浏览器检查，没有调用真实付费生图接口，没有提交或推送。
- 下一步：新开项目 Codex 任务确认 MCP 自动发现；用户明确授权后用 `gpt-image-2`、1K、1:1、单张图片做最低成本真实验收，再接网页 Codex 薄适配层。

### 2026-08-04 15:18 +08:00

- 状态：planned
- 本次更新：核查 HappyEvering 官方图片 API 文档，点检昨天建立的临时 `lynn-image-generate` Skill，并把平台合同、实现冲突、未确认边界和正式改造方案写入调研报告与功能方案。
- 已确认：平台支持生成、编辑、多参考图、PNG Mask、1K/2K/4K、URL/Base64、SSE 和异步任务；异步轮询必须使用原接口、原模型和 `Retry-After`，成功结果只能领取一次。
- Skill 结论：可继续作为协议验证工具，但不能作为产品运行底座；正式调用应迁入 `ImageCapability + CapabilityRun + HappyEveringImageProvider + Media/Artifact`。
- 关键约束：平台未公开取消和幂等接口，提交未知时不能盲目重试；项目 SSE 与 Provider SSE 必须分层。
- 下一步：定义 M1 Schema 和 Provider Adapter，建立不调用付费接口的 Mock 合同测试，再确定 Dynamic Tool 或 MCP 接入。
- 未执行：没有修改产品代码，没有调用生图 API，没有增加 UI，没有启动服务或测试。

### 2026-08-04 14:39 +08:00

- 状态：planned
- 本次更新：将自然语言生图和未来专门的生图自动化工作台列为正式需求；保存用户原话，完成 Codex/GPT、Gemini、Claude 的 Skills、工具调用和生图机制快速调研。
- 用户影响：当前产品行为没有变化；需求已进入项目管理和项目进度，后续开发可以沿同一编号追踪。
- 当前方案：Luna 5.6 负责自然语言理解，项目建立模型无关的 Capability 执行层；对话、工作台、定时任务和外部 Agent Runtime 复用同一个生图能力。
- 未执行：没有修改产品代码，没有调用生图 API，没有增加 UI，没有启动服务或测试。
- 证据：`docs/feature-development/features/FEAT-015-image-generation-and-automation-workbench.md`；`docs/research/IMAGE_GENERATION_CAPABILITY_AND_AUTOMATION_WORKBENCH_RESEARCH_2026-08-04.md`。
