---
id: FEAT-006
type: maintenance
title: 固定公网入口与正式访问控制
category: maintenance
priority: null
status: in_progress
updated_at: 2026-08-06 23:35 +08:00
source: docs/feature-development/features/FEAT-006-stable-remote-access.md
related: [FEAT-004, FEAT-009]
---

# 固定公网入口与正式访问控制

## 用户原话

历史功能文档未保存原始用户原话，待补录；不能根据文件内容倒推原话。

## 助手初步理解

该部分原始对话上下文未被独立保存，初步理解待补录。

## 简短摘要

让用户在外出时通过稳定入口访问本机项目服务。

## 具体内容

使用场景：用户在手机或外部网络打开面板并继续操作本机项目。

当前体验：固定域名可以访问，纯文字和已有图片读取正常；但公网发送图片明显缓慢，同一张约 120 KB 图片本机上传约 0.1 秒，公网约 10-16 秒。VPN 可能改善线路，但不稳定，不能作为长期依赖。

交互变化：继续验证稳定线路、访问控制和恢复边界，不在本轮扩大基础设施改动。

## 预计效果

用户保存一个固定入口即可从外部访问，并能区分线路中断、网页服务停止和 Codex 任务状态。

## 关联条目

`FEAT-004`、`FEAT-009`

## 当前状态

进行中。

## 当前证据

- `docs/feature-development/features/FEAT-006-stable-remote-access.md`
