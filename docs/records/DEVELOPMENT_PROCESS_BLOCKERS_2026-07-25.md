# AI 开发过程阻塞与误判记录：2026-07-25

记录日期：2026-07-25
记录范围：本轮功能点检、体验修复、服务重启和渲染验证
目的：记录开发过程中由错误指令、工具判断、自动化方式和架构理解偏差造成的时间损耗，供后续 AI 助手直接规避

## 1. 结论摘要

本轮代码修复最终完成，但开发过程出现了多次可以避免的阻塞。主要问题不是功能本身难，而是没有在第一次检查时把“Windows 环境限制、SSE 长连接、Playwright 实际来源、页面控件结构、启动脚本行为和 Desktop/Web 架构边界”一次确认清楚。

直接造成时间浪费的错误包括：

1. 使用依赖 WMI 的端口查询指令，得到带错误噪声的结果；
2. 对 SSE 页面使用 `networkidle`，必然等待超时；
3. 使用错误的附件按钮定位器，点击隐藏 input 并等待 30 秒；
4. 使用错误的 `banner` 可访问性定位器，再次等待 30 秒；
5. 没有先读启动脚本，错误地认为 `pnpm start:demo` 会重启服务；
6. 首次浏览器检查没有在导航前记录失败资源 URL，导致同一个 404 被重复排查；
7. 一开始只检查项目本地 Playwright，差点忽略 Node REPL 中已经可用的 Playwright；
8. 对 Markdown 本地图片的理解停留在前端渲染，直到截图出现破图后才确认必须经过服务端媒体登记。

## 2. BLOCKER-001：端口检查使用了错误的 Windows 指令

### 现象

第一次检查 `9360` 时使用：

```powershell
Get-NetTCPConnection -LocalPort 9360 -State Listen
```

本机 WMI/CIM 服务被禁用，命令报“无法连接到 CIM 服务器”。脚本同时输出了 `NOT_LISTENING`，容易误判服务没有启动。

### 我的错误

没有先遵循项目已有经验“端口检查优先使用 `netstat -ano`”，选择了依赖 WMI 的命令。错误处理也不够严格：查询失败和“没有监听”被混成了同一个结果。

### 实际原因

`Get-NetTCPConnection` 依赖 CIM/WMI；本机环境明确存在 WMI 不可用情况。服务实际上始终由 PID `32552` 正常监听。

### 影响

- 多了一轮无意义的服务状态复核；
- 如果没有继续用 HTTP 检查，可能错误重启或重复启动服务；
- 输出噪声增加了判断成本。

### 正确做法

```powershell
netstat.exe -ano -p tcp | Select-String ':9360\s+.*LISTENING'
```

端口结果必须再用真实健康接口确认，不能只看进程：

```text
GET http://127.0.0.1:9360/api/project?token=demo123
```

## 3. BLOCKER-002：对 SSE 页面错误使用 `networkidle`

### 现象

Playwright 打开单人页时使用：

```text
page.goto(url, { waitUntil: "networkidle" })
```

页面持续保持 `/events` SSE 连接，30 秒后导航超时。

### 我的错误

没有先根据应用架构判断页面存在长期网络连接，机械使用普通静态页面的等待条件。

### 实际原因

SSE 的正常工作方式就是保持请求长期打开。`networkidle` 不适合作为该页面“加载完成”的定义。

### 影响

- 浪费一次完整的 30 秒超时；
- 容易把正常 SSE 误认为页面卡住；
- 中断了后续截图和交互步骤。

### 正确做法

- 导航只等待 `domcontentloaded`；
- 再等待标题、输入框、会话内容或群聊头部等关键 DOM；
- `/events` 长期 pending 或页面销毁时 `ERR_ABORTED` 不应直接算业务错误。

## 4. BLOCKER-003：附件按钮定位器选中了隐藏 input

### 现象

自动化使用：

```text
getByRole("button", { name: "添加文件" })
```

Playwright 实际解析到隐藏的 `<input type="file">`。真正接收点击的是对应 `<label title="添加文件">`，label 持续拦截指针事件，点击等待 30 秒后失败。

### 我的错误

只根据可访问名称猜控件类型，没有先读取 `AttachmentButton` 的真实 DOM 结构。

### 影响

- 再次浪费 30 秒；
- 可能错误判断附件入口不可用；
- 没有一次性完成桌面和手机检查。

### 正确做法

先检查组件结构；当前实现应点击：

```text
label[title="添加文件"]
```

然后等待 `filechooser`，不选择真实文件即可验证入口，不产生运行数据。

## 5. BLOCKER-004：错误使用 `banner` 角色定位手机顶部栏

### 现象

修复后验证手机顶部位置时使用：

```text
getByRole("banner").last().boundingBox()
```

页面中的 `<header>` 位于嵌套应用结构内，没有被 Playwright 识别为独立 banner landmark，等待 30 秒后超时。

### 我的错误

把 HTML 标签名和 ARIA landmark 角色当成必然等价，没有先查看可访问性树或直接使用稳定 DOM。

### 正确做法

本次只需要位置和可见性，应使用：

```text
locator("header").first()
```

需要语义断言时，再先检查页面实际的 role snapshot。

## 6. BLOCKER-005：误以为启动脚本会重启已经运行的服务

### 现象

修改 `windows/server/content-blocks.mjs` 后执行：

```powershell
pnpm start:demo
```

脚本输出“Web demo is already running”并退出，旧 PID `32552` 继续运行，服务端新代码并未加载。

### 我的错误

没有在执行前读取 `windows/scripts/start-web-demo.ps1`。脚本只有启动和健康检查，没有 `Restart` 参数；服务健康时会直接退出。

### 架构事实

- `web-ui/dist` 由当前服务直接读取，因此纯前端重新构建后通常不需要重启；
- `windows/server/*.mjs` 在 Node 进程启动时加载，因此服务端模块修改后必须重启；
- 不能把“HTTP 200”当成“已加载最新服务端代码”。

### 正确做法

1. 读取临时 PID 文件；
2. 用 `netstat` 确认 PID 与 `9360` 监听进程一致；
3. 用 `Get-Process` 确认为 Node；
4. 只停止这个精确 PID；
5. 再运行 `pnpm start:demo`；
6. 核对新 PID、健康接口和目标行为。

本轮最终从 PID `32552` 切换到 PID `32700`。

## 7. BLOCKER-006：没有在第一次浏览器导航前记录 404 URL

### 现象

群聊首次加载出现：

```text
Failed to load resource: the server responded with a status of 404
```

第一次只记录了控制台文字，没有记录 `consoleMessage.location()` 和失败 response URL，因此无法确定是业务接口、媒体文件还是 favicon。

### 我的错误

浏览器监听器准备不完整，导致必须创建新页面重复复现。

### 实际原因

404 来自浏览器自动请求：

```text
http://127.0.0.1:9360/favicon.ico
```

不是群聊接口错误。

### 正确做法

在 `goto` 之前同时监听：

- `console`，保存 level、text、location；
- `response`，保存所有 `status >= 400` 的 URL；
- `requestfailed`，保存真正的网络失败原因。

## 8. BLOCKER-007：Playwright 可用性判断不完整

### 现象

项目没有 `node_modules/.bin/playwright.cmd`，`package.json` 也没有 Playwright 依赖。仅按项目依赖判断会得出“Playwright 不可用”。

### 我的错误

没有一开始同时检查 Codex Node REPL 运行时。该运行时实际可以：

```javascript
await import("playwright")
```

并能调用系统已有 Edge，不需要下载安装浏览器或污染项目依赖。

### 影响

- 多了一轮工具能力探测；
- 差点退回到更重的临时脚本或安装方案；
- 与用户“不在电脑里乱装东西”的约束冲突风险增加。

### 正确做法

本项目浏览器检查顺序应为：

1. Browser 插件是否存在；
2. Node REPL 是否能导入 Playwright；
3. 系统 Edge 路径是否存在；
4. 都不可用时才讨论其他方案，不自动安装依赖。

## 9. BLOCKER-008：对 Markdown 本地图片的架构理解不完整

### 现象

附件和结构化图片已经可以通过 `media-service` 显示，但助手回复中的：

```markdown
![截图](C:/Users/Hans/AppData/Local/Temp/example.png)
```

仍然显示破图。

### 我的错误

此前把“图片渲染支持”理解得过于宽泛，没有区分两条数据路径：

1. Codex 结构化 `localImage` / 上传附件；
2. Markdown 文本中的本地绝对路径。

前者会经过 `registerMedia`，后者原本由 ReactMarkdown 直接生成 `<img src="C:/...">`。浏览器不能直接读取电脑本地路径，也不会自动附加 token。

### 正确架构

- 服务端解析 Markdown 时识别本地图片路径；
- 复用现有 `media-service.register`，只登记真实存在的文件；
- 把 Markdown 图片地址改为 `/api/media/<id>`；
- 前端通过 `withAccessToken` 添加当前访问 token；
- 不新增允许浏览器传入任意绝对路径的接口。

### 验证结果

两张本地测试截图最终都通过 `/api/media/...` 返回，图片加载完成，`naturalWidth` 为 390。

## 10. BLOCKER-009：Desktop/Web 会话边界容易被误解

### 容易出现的错误理解

“网页能读取同一个 Codex Thread，也能通过 app-server 向 Thread 发送消息，因此 Codex Desktop 当前打开的对话界面应该实时出现网页消息。”

### 实际架构

- Thread 的持久化记录与客户端当前 UI 状态不是同一层；
- Web Demo 使用独立 app-server 连接和自己的实时事件；
- Codex Desktop 当前窗口不会自动订阅另一个 app-server 实例追加的 UI 事件；
- 最终记录可能进入同一个 Thread，但 Desktop 页面不保证热刷新或完整承接 Web 侧运行过程。

### 影响

如果把它误判为普通前端刷新 Bug，就会在 React、SSE 或轮询层反复修补，仍然无法得到真正的双端同屏体验。

### 正确处理方向

该问题需要统一 Connector、明确单一任务控制权、事件序列和客户端恢复机制。它不能与本轮小型 UI 修复混在一起，也不能通过修改 Codex JSONL 强行解决。

## 11. BLOCKER-010：单人页和群聊不是同一个运行状态模型

### 容易出现的错误理解

两个页面都显示 Agent 状态并使用 SSE，因此可以直接共用全部状态逻辑。

### 实际架构

- 单人页以 `threadId / turnId` 和 `execution-tracker` 为核心；
- 群聊以房间、成员、Agent 列表、讨论队列和 `group-room-store` 为核心；
- 两边已经共用附件 UI 和“新消息”UI，但状态数据仍属于不同功能域。

### 风险

过早强行统一会把单人 Turn、群讨论轮次和 Agent 队列混成一个复杂对象，增加并发、恢复和维护风险。

### 当前边界

本轮只做共享展示组件和一致的用户反馈，不伪装成已经完成统一 `AgentRun` 数据层。

## 12. 临时测试数据问题

点检群聊加入流程时使用过“功能点检”和“手机点检”两个临时成员名。成员只保存在服务内存中，不写入群聊历史，并在 60 秒无 Presence 后自动从在线列表消失。虽然没有持久污染，但用户如果恰好同时打开页面，会短暂看到测试成员。

后续检查应优先：

- 使用已有成员 ID 和名称；
- 或对 snapshot 做浏览器端 mock；
- 不发送测试群消息；
- 检查结束后确认 `/api/group/snapshot` 中没有残留测试成员。

## 13. 后续开发约束

1. 开始前一次性确认：入口 URL、服务 PID、健康接口、构建工具、SSE 长连接和用户验收边界。
2. Windows 端口检查优先 `netstat -ano`，不使用依赖 WMI 的命令。
3. SSE 页面禁止使用 `networkidle` 作为完成条件。
4. 浏览器自动化必须先读真实 DOM；文件 input、label 和可访问角色不能靠猜。
5. 浏览器监听器必须在导航前同时记录 console、response 和 requestfailed。
6. 修改服务端模块前先确认启动脚本是否支持重启；重启后必须比较新旧 PID。
7. 纯前端构建和服务端模块加载分开判断，不重复重启。
8. 图片、音频、视频和文件必须区分“结构化附件”和“Markdown 文本路径”两条链路。
9. 不把同一 Thread 误当成同一个客户端 UI 实例。
10. 不把单人 Turn 状态和群聊 Agent 队列强行合并。
11. 不安装新的浏览器或 npm 依赖，除非现有 Node REPL 和系统 Edge 都不可用且用户明确授权。
12. 用户要求基本检查时，准备一个完整的定向脚本一次跑完，不通过连续试错扩大验收工作。

## 14. 当前未解决但不应钻牛角尖的问题

1. 网页消息如何让 Codex Desktop 当前页面实时承接；
2. 手机和电脑之间如何共享真实登录身份；
3. 单人和群聊何时统一为正式 `Task / AgentRun / ActivityEvent` 模型；
4. 多 Agent 队列如何跨服务重启恢复；
5. 附件是否需要字节级进度、断点续传和自动过期；
6. Browser 插件缺失时是否值得额外安装。

这些问题需要单独的架构决定或用户优先级，不应该混入小型体验修复。

## 15. 本轮最终状态

- UI 构建通过；
- 定向测试 `13/13` 通过；
- 单人页和群聊页 HTTP 200；
- 服务 PID：`32700`；
- 没有安装依赖；
- 没有修改 Codex JSONL；
- 没有发送测试任务或群聊消息；
- 没有提交或推送 Git。
