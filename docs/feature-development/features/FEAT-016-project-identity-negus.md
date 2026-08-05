---
id: FEAT-016
title: 项目统一更名为 negus
status: implemented_pending_review
version: v1.0.0
updated_at: 2026-08-05 09:28 +08:00
---

# FEAT-016：项目统一更名为 negus

## 用户原话

> 整个项目，我想改名为 negus。评估一下如何高效改动好。

> 请你完成修改。

## 目标体验

用户在电脑网页、手机网页、安装后的 PWA、项目群聊和 GitHub 中统一看到 `negus`。项目改名后，固定公网链接、已有会话、设备身份、项目缓存、Codex Thread 和图片生成能力保持不变。

## 本轮范围

- 将群聊品牌、应用图标、Web 包名和构建插件名统一为 `negus`。
- 将浏览器存储切换到 `negus` 命名空间，同时读取旧 `codex-collab` 数据，避免升级后内容或身份消失。
- 将 GitHub 仓库改名为 `sukiandfds/negus`，同步本地 `origin`。
- 将本地项目目录迁移为 `D:\codingproject\negus`，更新 Codex 项目信任路径。
- 使用原端口 `9360` 恢复服务，不修改 `https://codex.negus.us.ci/`、Named Tunnel、Token 或用户保存的链接。

## 兼容边界

- `Codex app-server`、Thread、Turn 和 MCP 是底层能力名称，不属于旧项目品牌。
- Dream Skin 是保留的兼容主题模块；其脚本、CSS 类、状态目录和历史说明不做机械改名。
- 日期化调研、历史提交基线和旧分支名称保持原始事实。
- Service Worker、LocalStorage、SessionStorage 和 IndexedDB 对旧键保留读取兼容，不删除旧数据。

## 当前状态

界面品牌、图标、Web 包名、浏览器存储兼容和项目记录已经完成；GitHub 仓库已改名为 `sukiandfds/negus`，开发分支远端 SHA 与本地一致。本地目录迁移必须等待当前由 `9360` 承载的活动 Turn 收口，已交由项目外独立 Worker 执行；Worker 会保持固定网址和 Tunnel 不变，从 `D:\codingproject\negus` 恢复同一端口并把结果写入被 Git 忽略的运行记录。

## 验证要求

- 全部 Node 测试通过。
- `pnpm build:ui` 和 `git diff --check` 通过。
- GitHub 新仓库地址、远程分支 SHA 和本地 `origin` 一致。
- 新目录下 `9360` 健康接口返回 `200 application/json`，固定公网链接保持不变。

## 本轮验证

- 全部 Node 测试 `103/103` 通过。
- `pnpm build:ui` 和 `git diff --check` 通过。
- GitHub 仓库为 `https://github.com/sukiandfds/negus`，远端 `codex/publish-current-panel` 已包含本轮产品提交。
- 本地目录与服务恢复由独立 Worker 在当前 Turn 完成后执行，运行结果保存到 `runtime/rename-migration-result.json`。
