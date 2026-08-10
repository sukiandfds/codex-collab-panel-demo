---
document_type: process_case_ledger
schema_version: 2
project_id: negus
status: active
last_updated: 2026-08-10
---

# 开发常见错误案例库

本文件记录已经发生、可以跨功能复用的问题。
它不是项目说明，也不是开发流程。每条只保留触发条件、处理动作和证据。
开始任务时只读取与当前任务相关的条目。

## PROC-001：先确认模块职责

- 触发：任务同时涉及数据、UI、功能或协议。
- 动作：先确认各层职责、调用方和禁止改动范围。
- 证据：../records/DEVELOPMENT_LOG_2026-07-22.md、docs/architecture/。

## PROC-002：端口先用本机方法确认

- 触发：需要判断 Windows 端口或进程。
- 动作：先用 netstat -ano，再用真实 HTTP 健康接口确认。
- 证据：../records/DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md。

## PROC-003：SSE 不用 networkidle 判断完成

- 触发：页面有长期 SSE 连接。
- 动作：等待 domcontentloaded 和关键 DOM；SSE pending 不算失败。
- 证据：../records/DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md。

## PROC-004：启动不等于重启

- 触发：后端代码已修改或端口已有服务。
- 动作：先读启动脚本；分别确认旧 PID、新 PID、健康接口和实际资源。
- 证据：../records/DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md。

## PROC-005：视觉结论先核对 DOM

- 触发：截图判断与页面表现冲突。
- 动作：读取真实 DOM、视口和元素坐标；不要只相信截图或工具结果。
- 证据：AI_ASSISTANT_WORK_RULES.md、../records/DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md。

## PROC-006：控制扫描和补丁范围

- 触发：需要找文件或修改多个模块。
- 动作：先用 rg --files；补丁按后端、组件、配置拆分。
- 证据：本项目历史开发记录。

## PROC-007：策略拦截后停止同类尝试

- 触发：命令被安全策略拦截。
- 动作：不要重复同类后台方案；改用现有脚本或当前服务。
- 证据：本项目历史开发记录。

## PROC-008：自动化前确认真实控件

- 触发：需要点击、输入或读取页面控件。
- 动作：先读组件和可访问性树；使用稳定定位器，不猜 role 或控件类型。
- 证据：../records/DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md。

## PROC-009：导航前记录失败信息

- 触发：需要用浏览器或 HTTP 导航诊断。
- 动作：导航前监听 console、response 和 requestfailed。
- 证据：../records/DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md。

## PROC-010：先锁定项目工具链

- 触发：需要构建、测试或浏览器检查。
- 动作：先确认 pnpm、Node、浏览器和 Playwright 来源；不自动安装依赖。
- 证据：../records/DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md。

## PROC-011：确认状态所有权

- 触发：看到相同 Thread、SSE 或相似页面。
- 动作：确认事件生产者、连接实例、状态所有权和恢复机制，不把它们当成同一运行实例。
- 证据：../records/DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md。

## PROC-012：PowerShell 和编码按实际结果判断

- 触发：使用 Windows 脚本、Unicode、退出码或 GUI 进程。
- 动作：使用兼容语法和 UTF-8；以产物、接口和进程状态验证，不只看退出码。
- 证据：AI_ASSISTANT_WORK_RULES.md。

## PROC-013：重复偏好及时入文档

- 触发：用户再次明确同一严肃偏好。
- 动作：先复盘，再写入入口或本台账；产品方向和架构方案等用户确认后再定案。
- 证据：用户 2026-07-26 反馈。

## PROC-014：版本记录按时间追加

- 触发：更新功能版本记录。
- 动作：先读最后版本和时间，只在末尾按正序追加，不改写历史。
- 证据：FEAT-007 版本记录整理。

## PROC-015：先确认 Tunnel 管理模式

- 触发：安装、修改或检查 Cloudflare Tunnel。
- 动作：先确认管理模式；使用显式配置和 credentials file；不输出 Token。
- 证据：FEAT-006-I02、FEAT-006-I03。

## PROC-016：达到停点就停止

- 触发：排查出现第二种独立根因、第二次提权或重装、第三轮验证，或用户要求停止。
- 动作：立即停止扩展操作，只报告事实、失败点和最小下一步。
- 证据：FEAT-006-I05。

## PROC-017：远程 UI 检查保持只读

- 触发：用户通过手机或公网要求检查 UI。
- 动作：优先读源码、已有截图和静态产物；无法证明无弹窗时，不运行浏览器、Node、监听或授权工具。
- 证据：FEAT-001-I14。

## PROC-018：活动任务期间不切网络

- 触发：存在活动 Turn、上传或构建。
- 动作：不切换 VPN、Tunnel 或代理；变更后检查模型、会话、执行状态和公网接口。
- 证据：FEAT-001-I12、FEAT-006-I08。

## PROC-019：真实事件优先于 tracker 时间

- 触发：页面显示运行中，但核心接口或 Turn 没有进展。
- 动作：检查最后真实事件、完成或中断事件和核心接口；不能用 tracker 更新时间冒充进度。
- 证据：FEAT-001-I12、REALTIME_PERFORMANCE_DIAGNOSTIC_2026-08-03.md。

## PROC-020：服务不能在自身 Turn 中直接重启

- 触发：Web 任务需要重启承载它的 9360 服务。
- 动作：不直接串联 Stop/Start；使用 pnpm restart:demo，让独立 Worker 等当前 Run 收口后处理。
- 证据：FEAT-001 v0.10.2、2026-07-29 公网 502 事故。

## PROC-021：复杂问题先查已有调研

- 触发：准备新增状态判断、超时、轮询、重连或重启机制。
- 动作：先查项目调研索引和已有源码；写清成熟机制、当前缺口、最小范围和用户变化后再编码。
- 证据：项目战略与多角色评审/00-调研文档索引与推荐阅读顺序.md、FEAT-001、FEAT-002、FEAT-005、FEAT-009。

## PROC-022：实时事件必须有统一顺序

- 触发：出现流式文字消失、重开仍显示处理中或新 Turn 混入旧过程。
- 动作：使用 runId、turnId、eventSeq；终态和持久化快照优先；流式内容只追加；恢复和新 Turn 清除旧缓冲。
- 证据：FEAT-001-I24、FEAT-005。

## 维护规则

- 新问题使用下一个 PROC 编号，不复用旧编号。
- 问题解决后保留记录，改为 resolved 并追加提交。
- 同一根因再次发生时，追加时间、功能和原因，不新建重复条目。
- 功能特例升级为普适问题时，保留原 FEAT 编号并建立双向链接。
- 不写没有证据的归因。
