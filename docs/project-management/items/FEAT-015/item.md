---
id: FEAT-015
type: feature
title: 自然语言生图与自动化工作台
category: development
priority: P2
status: in_progress
updated_at: 2026-08-04 18:39 +08:00
source: docs/feature-development/features/FEAT-015-image-generation-and-automation-workbench.md
related: [FEAT-001, FEAT-002, FEAT-003, FEAT-007, FEAT-008]
owner: product_and_runtime
product_base_commit: 267a27cd9c6c8ab141dcc1e743d38d38a9d7f611
product_commit: pending
docs_commit: pending
audited_product_commit: pending
sync_status: implementation_uncommitted
next_action: 推送当前开发分支；用户在目标电脑拉取后确认 LYNN_IMAGE_API_KEY 环境变量并验收网页版生图
last_user_visible_change: 网页单人 Codex 已可用明确自然语言触发 Negus Image，显示生成状态和图片，服务重启后会话与图片仍保留
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

开发中。原生 `negus_image` MCP、HappyEvering Provider、Skill、网页版关键词分流、异步运行状态、Media 图片展示和持久运行记录均已接入。已完成一次 16:9、2K 原生真实生图和一次 1:1、1K 网页真实生图；服务重启后生图会话和图片仍可从侧栏恢复。API Key 只保存在 Windows 用户环境变量中。Artifact、完整 `CapabilityRun`、自动化工作台和定时任务尚未实现。

## 当前证据

- `docs/feature-development/features/FEAT-015-image-generation-and-automation-workbench.md`
- `docs/research/IMAGE_GENERATION_CAPABILITY_AND_AUTOMATION_WORKBENCH_RESEARCH_2026-08-04.md`
- `.codex/config.toml`
- `windows/server/image-generation/happyevering-client.mjs`
- `windows/server/image-generation/image-output.mjs`
- `windows/server/image-generation/mcp-server.mjs`
- `windows/server/image-generation/web-image-intent.mjs`
- `windows/server/image-generation/web-image-generation-service.mjs`
- `windows/server/image-generation/image-generation-run-store.mjs`
- `windows/tests/web-image-generation.test.mjs`
- `windows/tests/image-generation-mcp.test.mjs`
- HappyEvering 官方文档：`https://api.happyevering.xyz/docs/`
- 产品基线：`267a27cd9c6c8ab141dcc1e743d38d38a9d7f611`
