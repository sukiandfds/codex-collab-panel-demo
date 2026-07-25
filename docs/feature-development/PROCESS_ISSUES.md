---
document_type: reusable_process_issues
schema_version: 1
last_updated: 2026-07-25 23:58 +08:00
audience: ai_assistants_and_maintainers
---

# 普适开发问题与防再犯台账

这里只记录可以跨功能复用的问题。功能局部问题留在对应 `FEAT-*.md`。AI 开始开发前应先看 `active` 条目；遇到相同触发器时直接采用“正确路径”，不要重新试错。

## 快速索引

| 编号 | 状态 | 标签 | 问题 | 防再犯规则 | 原始证据 |
| --- | --- | --- | --- | --- | --- |
| `PROC-001` | `active` | 架构/边界 | 未先理解功能所有权就把数据、UI 和功能混改 | 修改前确认数据层、功能层、展示层及禁止改动范围 | `DEVELOPMENT_LOG_2026-07-22.md`、`AI_ASSISTANT_READ_FIRST.md` |
| `PROC-002` | `active` | Windows/环境 | 使用依赖 WMI/CIM 的端口命令，查询失败被误判为未监听 | 本机端口优先 `netstat -ano`，再用真实 HTTP 健康接口确认 | `DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#blocker-001` |
| `PROC-003` | `active` | SSE/验证 | 对长期 SSE 页面使用 `networkidle`，正常连接被当成超时 | 等待 `domcontentloaded` 和关键 DOM；SSE pending 不算失败 | `DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#blocker-002` |
| `PROC-004` | `active` | 服务/重启 | 误以为 `pnpm start:demo` 会重启健康服务，导致旧后端继续运行 | 先读启动脚本；后端改动后核对 PID、精确停止并比较新 PID | `DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#blocker-005` |
| `PROC-005` | `active` | 视觉/验证 | 自动视觉检查过度，或截图工具自身尺寸与页面视口不一致造成误判 | 第一次图像与布局推断冲突时先读取真实 DOM、视口和元素坐标 | `AI_ASSISTANT_READ_FIRST.md#1213-自动视觉检查消耗过多`、本文件 `PROC-005` 详情 |
| `PROC-006` | `active` | 工具/范围 | 递归扫描依赖目录或一次提交超大补丁，局部问题放大为整轮失败 | 文件发现优先 `rg --files`；补丁按后端、组件、配置拆分 | 本文件 `PROC-006` 详情 |
| `PROC-007` | `active` | 工具/策略 | 命令被安全策略拦截后继续尝试同类后台进程方案 | 第一次确认是策略限制后立即切换到现有脚本或当前服务 | 本文件 `PROC-007` 详情 |
| `PROC-008` | `active` | 浏览器/DOM | 根据控件名称猜 DOM 类型或 ARIA role，产生长时间等待 | 自动化前读组件和可访问性树，使用实际稳定定位器 | `DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#blocker-003`、`#blocker-004` |
| `PROC-009` | `active` | 网络/诊断 | 没有在导航前记录失败 URL，只看到笼统 404 | 导航前同时监听 console、response 和 requestfailed | `DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#blocker-006` |
| `PROC-010` | `active` | 工具链 | 没先锁定 `pnpm`、可用浏览器和 Playwright 来源 | 先读项目脚本和本机现有运行时，不自动安装依赖 | `AI_ASSISTANT_READ_FIRST.md#1212-构建工具链未先锁定`、`DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#blocker-007` |
| `PROC-011` | `active` | 架构/状态 | 把同一 Thread、同一 SSE 或相似 UI 误当成统一运行实例 | 先确认事件生产者、连接实例、状态所有权和恢复机制 | `DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#blocker-009`、`#blocker-010` |
| `PROC-012` | `active` | PowerShell/编码 | PowerShell 行为、Unicode、退出码或 GUI 进程状态判断错误 | 使用 Windows PowerShell 5 兼容语法；以产物和接口验证，不只看退出码 | `AI_ASSISTANT_READ_FIRST.md#1210-PowerShell-兼容性和编码问题` |

## 详细记录

### PROC-001：架构和功能所有权未先确认

- 发现时间：2026-07-22
- 分类：普适
- 状态：active
- 现象：接入真实内容时改动了原本独立维护的 UI；组件早期只按页面区域拆分，没有按功能域划分。
- 根因：没有先明确 UI、内容、数据、执行、附件和群聊各自所有权。
- 错误路径：看到页面问题后直接在页面组件里同时修数据和样式。
- 正确路径：先画出最小数据链路并确定所属功能目录；共享只发生在稳定 UI 或基础协议层。
- 防再犯触发器：一个任务同时准备修改数据解析、状态逻辑和视觉样式时，必须暂停并重新拆分范围。

### PROC-002：Windows 端口检查依赖不可用的 WMI/CIM

- 发现时间：2026-07-25
- 分类：普适
- 状态：active
- 现象：`Get-NetTCPConnection` 报“无法连接到 CIM 服务器”，检查脚本同时输出 `NOT_LISTENING`，但 `9360` 实际仍由 Node 进程监听。
- 根因：该命令依赖本机不可用的 WMI/CIM；错误处理又把“查询失败”和“没有监听”合并成同一结果。
- 错误路径：把命令查询失败直接解释为服务未启动，并准备重复启动或重启服务。
- 正确路径：先用 `netstat.exe -ano -p tcp` 定位监听 PID，再请求真实健康接口确认服务是否可用。
- 防再犯触发器：端口命令出现 CIM/WMI 错误或同时包含错误和 `NOT_LISTENING` 时，立即停止使用该结果，切换到 `netstat` 与 HTTP 双重确认。
- 证据：`DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#2-blocker-001端口检查使用了错误的-windows-指令`。

### PROC-003：SSE 页面使用错误的加载完成条件

- 发现时间：2026-07-25
- 分类：普适
- 状态：active
- 现象：自动化打开页面时等待 `networkidle`，因为 `/events` SSE 长连接始终保持，30 秒后导航超时。
- 根因：把持续连接的实时页面当成所有请求都会结束的静态页面。
- 错误路径：把正常 pending 的 SSE 当成加载失败，并围绕超时继续排查页面或网络。
- 正确路径：导航等待 `domcontentloaded`，再等待标题、输入框或会话内容等关键 DOM；单独检查 SSE 是否已连接。
- 防再犯触发器：页面包含 SSE、WebSocket、长轮询或流式响应时，禁止用 `networkidle` 作为唯一完成条件。
- 证据：`DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#3-blocker-002对-sse-页面错误使用-networkidle`。

### PROC-004：误判启动脚本具备重启语义

- 发现时间：2026-07-25
- 分类：普适
- 状态：active
- 现象：修改 `windows/server/*.mjs` 后运行 `pnpm start:demo`，脚本检测到健康服务便退出，旧 PID 继续运行，服务端新代码没有加载。
- 根因：没有先读 `start-web-demo.ps1`，把“启动并检查健康”误认为“自动重启并加载新代码”。
- 错误路径：只看到 HTTP 200 或脚本成功输出，就判断服务已运行最新代码。
- 正确路径：区分前端静态产物和启动时加载的服务端模块；服务端变更后核对 PID，只停止准确的旧 Node PID，再启动并比较新 PID、健康接口和目标行为。
- 防再犯触发器：改动 `windows/server/` 或服务入口后，若启动脚本提示 already running，必须先确认它是否真的执行了 restart。
- 证据：`DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#6-blocker-005误以为启动脚本会重启已经运行的服务`。

### PROC-005：视觉验证工具造成误判

- 发现时间：2026-07-25 23:35 +08:00
- 分类：普适
- 状态：active
- 关联功能：`FEAT-004`
- 现象：Edge 生成的截图宽度为 `390px`，但实际页面 `innerWidth` 为 `502px`；右上角控件坐标 `x=426`，截图把它裁掉，看起来像手机布局丢失。
- 根因：把截图像素尺寸直接等同于 CSS 视口尺寸，没有验证浏览器最小 headless 窗口限制。
- 错误路径：根据连续截图继续修改 flex 和定位样式。
- 正确路径：第一次视觉结果与代码推断冲突时，读取 `innerWidth`、`devicePixelRatio`、`getBoundingClientRect()` 和 computed style。
- 防再犯触发器：截图显示元素缺失，但构建产物和 DOM 均包含元素时，先验证视口与裁剪关系，不继续改 CSS。
- 证据：2026-07-25 临时 CDP 检查返回 `viewport.width=502`、切换控件 `display=flex`、`visibility=visible`；临时文件已删除。

### PROC-006：扫描和补丁范围过大

- 发现时间：2026-07-25 23:10 +08:00
- 分类：普适
- 状态：active
- 关联功能：`FEAT-004`
- 现象一：递归 `Get-ChildItem` 进入 `pnpm` 可选平台链接，产生大量无关目录错误。
- 现象二：包含后端、组件和 HTML 的大补丁因 `group.html` 少一行预期上下文而整体拒绝。
- 根因：工具调用范围超过当前判断所需，补丁原子过大。
- 正确路径：文件发现使用 `rg --files` 并排除依赖和产物；补丁按功能边界拆分，先后端、再共享组件、再入口配置。
- 防再犯触发器：命令准备递归仓库根目录，或单个补丁跨越三个以上功能层时，立即缩小范围。

### PROC-007：策略限制后重复同类尝试

- 发现时间：2026-07-25 23:28 +08:00
- 分类：普适
- 状态：active
- 关联功能：`FEAT-004`
- 现象：隔离端口测试中的后台进程命令被终端策略拦截后，又尝试了一个结构相似的后台启动/终止组合，仍被拦截。
- 根因：没有在第一次错误后区分“代码问题”和“执行策略问题”。
- 正确路径：确认策略拦截后停止变化相同的命令，改用已有项目启动脚本、当前服务或纯函数检查。
- 防再犯触发器：错误信息包含 `blocked by policy` 时，不再用改写语法的方式重试同类操作。

### PROC-008：根据控件名称猜测 DOM 与可访问性角色

- 发现时间：2026-07-25
- 分类：普适
- 状态：active
- 现象：附件入口被猜成普通 button，实际选中隐藏 file input；手机顶部 `<header>` 被猜成 `banner`，两次定位都等待 30 秒后失败。
- 根因：没有先读取组件 DOM 和可访问性树，把控件名称、HTML 标签和 ARIA role 当成必然一一对应。
- 错误路径：定位失败后继续更换相似的语义选择器，直到完整超时。
- 正确路径：先读组件实现或 role snapshot；点击使用真实可交互元素，布局测量使用稳定 DOM locator，语义断言再使用已验证 role。
- 防再犯触发器：定位器第一次出现 pointer interception、hidden input 或 role not found 时，立即检查真实 DOM，不继续猜测选择器。
- 证据：`DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#4-blocker-003附件按钮定位器选中了隐藏-input`、`#5-blocker-004错误使用-banner-角色定位手机顶部栏`。

### PROC-009：浏览器诊断没有在导航前收集完整失败信息

- 发现时间：2026-07-25
- 分类：普适
- 状态：active
- 现象：浏览器只显示一条 404 控制台信息，没有失败 URL，必须重新打开页面才能确认只是 `/favicon.ico`。
- 根因：监听器只保留 console 文本，且没有在导航前注册 response 与 requestfailed 记录。
- 错误路径：根据笼统 404 猜测业务接口、媒体或页面路由，并重复复现。
- 正确路径：在 `goto` 前同时监听 console 的 location、所有 `status >= 400` 的 response URL 和 requestfailed 原因。
- 防再犯触发器：错误输出不包含请求 URL、状态和失败类型时，不开始归因，先补全可观测信息。
- 证据：`DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#7-blocker-006没有在第一次浏览器导航前记录-404-url`。

### PROC-010：未先锁定项目已有工具链

- 发现时间：2026-07-25
- 分类：普适
- 状态：active
- 现象：项目本地没有 Playwright 可执行文件时差点判断工具不可用；pnpm store 与现有 `node_modules` 来源不一致时又可能触发无关依赖重建。
- 根因：只检查一种工具来源，没有先读项目脚本、现有运行时和 `.modules.yaml`。
- 错误路径：在已有运行时可用时准备安装依赖，或直接运行会重建环境的通用命令。
- 正确路径：先读 `package.json` 和项目脚本；确认 Node、pnpm、store 与现有模块来源；浏览器检查依次核对现有插件、Codex Node REPL 和系统 Edge，均不可用后才讨论安装。
- 防再犯触发器：命令准备安装、重建或更换 store，或本地 `.bin` 缺失时，先检查项目已有封装与宿主运行时，不自动增加依赖。
- 证据：`DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#8-blocker-007playwright-可用性判断不完整`、`AI_ASSISTANT_READ_FIRST.md#1212-构建工具链未先锁定`。

### PROC-011：把共享 Thread 或相似页面误当成共享运行状态

- 发现时间：2026-07-25
- 分类：普适
- 状态：active
- 现象：Web 能写入同一 Thread 后，容易预期 Desktop 当前页会实时出现消息；单人页和群聊都使用 SSE 后，也容易预期它们可以直接共用全部执行状态。
- 根因：没有区分持久化 Thread、app-server 实例、事件订阅、客户端 UI、单人 Turn 和群聊 Agent 队列的所有权。
- 错误路径：把跨端连续性当成 React 刷新问题，或把两个不同领域的状态强行合并为一个对象。
- 正确路径：先标明事件生产者、连接实例、状态所有者、持久化边界和恢复机制；只共享稳定协议与展示组件，统一运行模型需要单独设计 Connector、控制权和事件序号。
- 防再犯触发器：方案因为“同一个 Thread”“都用 SSE”或“页面看起来一样”就准备共用状态时，必须先画出两条真实数据链路。
- 证据：`DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#10-blocker-009desktopweb-会话边界容易被误解`、`#11-blocker-010单人页和群聊不是同一个运行状态模型`，并关联 `FEAT-005`。

### PROC-012：PowerShell 版本、编码和进程结果判断不一致

- 发现时间：2026-07-21 至 2026-07-25
- 分类：普适
- 状态：active
- 现象：Windows PowerShell 5 不支持部分新语法；无 BOM UTF-8 中文默认读取为乱码；内联中文断言或参数转义被破坏；后台进程成功但辅助命令退出码使整条操作看起来失败。
- 根因：没有按本机 PowerShell 版本和文本编码显式处理，并把命令退出码、进程状态、服务 readiness 混为一个判断。
- 错误路径：根据乱码继续改文档、根据最后一条命令退出码判定服务失败，或重复修改启动参数碰运气。
- 正确路径：使用 Windows PowerShell 5 兼容语法；中文文件显式 `-Encoding UTF8`；复杂参数使用数组和 `-LiteralPath`；启动结果、PID、日志和 HTTP readiness 分别验证。
- 防再犯触发器：出现中文乱码、Unexpected token、参数被截断或“服务可访问但命令失败”时，先检查 shell 版本、编码和分层退出状态。
- 再次发生：2026-07-25，使用 `rg ... docs/feature-development/features/*.md` 时 PowerShell 没有展开通配符，`rg` 把它当成非法路径。Windows 下应传目录并使用 `-g '*.md'` 过滤。
- 证据：`AI_ASSISTANT_READ_FIRST.md#1210-powershell-兼容性和编码问题`、`DEVELOPMENT_PROCESS_BLOCKERS_2026-07-25.md#2-blocker-001端口检查使用了错误的-windows-指令`。

## 维护规则

- 新普适问题使用下一个 `PROC-xxx` 编号，不能复用旧编号。
- 问题解决不删除记录；将状态改为 `resolved`，并追加解决时间和对应提交。
- 同一根因再次发生时，不新建重复条目；在原条目追加“再次发生时间、功能和原因”。
- 功能特例升级为跨功能问题时，保留原 `FEAT-xxx-Ixx`，同时新增 `PROC-xxx` 并建立双向链接。
- 这里只记录可执行的防再犯规则，不记录情绪化评价或没有证据的归因。
