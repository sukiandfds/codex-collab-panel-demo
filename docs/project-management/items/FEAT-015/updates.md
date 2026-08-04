# FEAT-015 更新记录

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
