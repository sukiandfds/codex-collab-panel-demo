---
id: RESEARCH-001
type: research
title: 项目文件功能与模块交叉关系调研结果
category: research
priority: P1
status: completed
updated_at: 2026-08-03
source: docs/research/PROJECT_FILE_ARCHITECTURE_RESEARCH_2026-08-03.md
related: [PM-001]
---

# 项目文件功能与模块交叉关系调研结果

## 用户原话

先保存一份调研结果。名称备注好日期以及调研结果。今天目标是把整个开发、调研流程都规范下来。

## 助手初步理解

保存当前开发分支的项目文件功能、模块边界、调用关系、事件链路和测试对应关系，并把结果关联到项目管理条目。

## 简短摘要

记录当前项目的文件功能分组和模块交叉关系。

## 具体内容

调研基线为 `codex/publish-current-panel` 的 `bb56a3700d03036bdeccefa9e87b77defb70ed1f`。

调研结果正文保存在：

`docs/research/PROJECT_FILE_ARCHITECTURE_RESEARCH_2026-08-03.md`

正文包含目录分组、后端文件关系、前端文件关系、HTTP 路径、实时事件链路、群聊链路和测试文件对应关系。

## 预计效果

项目管理页面可以通过 `RESEARCH-001` 定位本次调研结果，并读取该记录对应的产品提交 SHA。

## 关联条目

`PM-001`

## 当前状态

已保存调研结果，等待后续流程记录继续追加。

## 当前证据

- `docs/research/PROJECT_FILE_ARCHITECTURE_RESEARCH_2026-08-03.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `ad79225 refactor: separate UI and feature module boundaries`
