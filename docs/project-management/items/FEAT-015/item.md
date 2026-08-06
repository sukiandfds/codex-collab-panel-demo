---
id: FEAT-015
type: feature
title: 自然语言生图与自动化工作台
category: development
priority: P2
status: in_progress
updated_at: 2026-08-06
source: docs/feature-development/features/FEAT-015-image-generation-and-automation-workbench.md
related: [FEAT-001, FEAT-002, FEAT-003, FEAT-007, FEAT-008]
owner: product_and_runtime
product_base_commit: 267a27cd9c6c8ab141dcc1e743d38d38a9d7f611
product_commit: f1ac977e4db3b797e636219f1958d704f19a10c8
docs_commit: f1ac977e4db3b797e636219f1958d704f19a10c8
audited_product_commit: pending
sync_status: committed
next_action: 用户验收现有对话生图；之后再开发专门工作台、Artifact、批量模板、队列和定时任务
last_user_visible_change: 网页生图已进入真实 Codex Thread/Turn；2.35：1 4K、同会话自动引用上一张图编辑及普通后续对话均已真实通过
---

# 自然语言生图与自动化工作台

## 用户原话

以下内容按对话出现顺序原样保留：

> 我需要加入生图功能。但是我没想好怎么加。我有一个能正常生图的中转站和对应的api，已经实测可用。根据我们目前的架构，你觉得怎么样比较好？

> 目前整个系统接入的都是codex gpt5.6模型，以luna 5.6为主。我期待的是，我用自然语言就能触发生图。同时，以后还可能引入其他skills、harness类似机制，以及open claw等机制，以及定时任务。

> 这和codex、gpt、gemini、claude等工具的方式和逻辑是一样的吗？做个快速调研。

> 同时，之后可能会有专门生图的自动化工作台。而不只是一个简单的skills。请你知悉。给一个初步方案。列为正式需求，记录在我们的项目管理和项目进度中。就是那个能写下我原话的那个系统。调研报告也总结好。

> 目前也是用中转站在用codex，你给的这个方案能在codex中用吗？而不是我们的单人网页版codex？

> 怎么处理比较好？又高效又通用又便于维护？

> 会不会太复杂了。还能精简吗？会损失什么？难度排序呢？

> 也就是先在原生codex跑通是吗？能直接迁移到我们的网页codex吗？

> 那请你开始。可以适当参考之前的别的项目的成果。

> 我期待的是，相关功能有对应文件拆分管理，目前已有文件只负责调用，避免造成一个文件巨大不好维护。其实用关键词也可以吧？

> 能成功生成，但是一直请求，导致中转平台一直显示尚未生成

> 怎么修？反正我看结果是对的。那当然最好是等待结果。平台文档在：https://api.happyevering.xyz/docs/

> 感觉做第一个识别小数比例和全角冒号 2.35：1 就好了其他的是不是没必要？你觉得有必要吗？还有个问题。单次生成后，无法继续在该对话框中和助手对话沟通，无法发送消息，也无法根据之前的内容去修改第一张图片

> 我以为是把我们的原话发给中转站进行生成。

> 官方codex内置的image_generation 工具调用，怎么 处理这些字段请求的？我以为我们有gpt5.6起码能分析我们的prompt再填写？prompt：一张2.35：1电影画幅……4K，极度真实 model：gpt-image-2-4k size：1:1 n：1

> 请你自主高效进行修改、修复、验证。你有充足的时间，但是不能钻牛角尖。我明天早上起来进行验收。确保给我一个完美的图片生成系统。

## 助手初步理解

用户需要的不只是一次性的生图 Skill，而是一项可从自然语言对话触发、以后也能被专门工作台、定时任务和其他 Agent 运行时复用的正式系统能力。当前仍由 Codex GPT-5.6，主要是 Luna 5.6，负责理解自然语言；实际图片生成由已经验证可用的中转站 API 完成。

## 简短摘要

先建立自然语言生图能力，再在同一执行底座上扩展批量、模板化、定时和可视化管理的自动化工作台。

## 具体内容

- 对话入口：用户直接说“画一张……”“根据这张图修改……”即可触发，不要求记忆固定命令。
- 执行底座：生图是正式 Capability，不把调用逻辑写死在前端或单个 Skill 中。
- 结果管理：生成结果进入现有媒体与交付物体系，支持预览、下载、版本和后续修改。
- 自动化工作台：以后可管理提示词模板、参考图、尺寸、批量任务、队列、历史、失败重试、成本和定时规则。
- 扩展入口：Codex Skill、MCP、OpenClaw、Harness 类流程、定时任务和未来其他模型都调用同一个能力执行层。

## 预计效果

用户在普通对话中自然描述图片需求后，可以看到真实生成状态和图片结果；需要批量生产或重复流程时，可以进入专门工作台配置模板、参考素材、数量、计划和运行记录。无论从对话、工作台还是定时任务发起，生成结果和状态都在同一条可追溯链中，不会形成多套互不兼容的生图逻辑。

## 关联条目

- `FEAT-001`：单人 Codex 对话与执行事件。
- `FEAT-002`：群聊和多 Agent 入口。
- `FEAT-003`：图片与附件展示。
- `FEAT-007`：交付物、版本和审核。
- `FEAT-008`：其他生成型工作流的独立服务边界参考。

## 当前状态

对话生图核心已完成：网页版关键词旁路和假 Turn 已删除，所有新请求进入真实 Codex app-server Thread/Turn，由 GPT-5.6 读取完整原话并调用 `negus_image`。HappyEvering 默认等待最终结果；`2.35：1 + 4K` 已真实生成 `3840x1632`，同一 Thread 已完成自动引用上一张图编辑和普通后续对话。工具图片进入 Media，并在同一 Turn 内去重。API Key 从被 Git 忽略的 `runtime/secrets.env` 加载。尚未实现的是 Artifact 登记、完整通用 `CapabilityRun`、自动化工作台和定时任务。

## 当前证据

- `docs/feature-development/features/FEAT-015-image-generation-and-automation-workbench.md`
- `docs/research/IMAGE_GENERATION_CAPABILITY_AND_AUTOMATION_WORKBENCH_RESEARCH_2026-08-04.md`
- `.codex/config.toml`
- `windows/server/image-generation/happyevering-client.mjs`
- `windows/server/image-generation/image-contract.mjs`
- `windows/server/image-generation/image-output.mjs`
- `windows/server/image-generation/mcp-server.mjs`
- `windows/server/image-generation/image-generation-run-store.mjs`
- `windows/server/routes/conversation-routes.mjs`
- `windows/server/codex-thread-history.mjs`
- `windows/tests/image-contract.test.mjs`
- `windows/tests/image-generation-mcp.test.mjs`
- HappyEvering 官方文档：`https://api.happyevering.xyz/docs/`
- 产品基线：`267a27cd9c6c8ab141dcc1e743d38d38a9d7f611`
