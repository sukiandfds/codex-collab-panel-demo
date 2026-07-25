# 开发日志：2026-07-25 群聊主入口与真实多 Agent 讨论

## 1. 本轮产品决定

后续初步 Demo 直接在现有群聊页面开发，不把群聊体验移植到单独 Codex 页面。

统一产品模型为：

- 默认由用户与项目经理 Agent 在项目群中沟通；
- 输入 `@` 可以叫来研究、开发或审查 Agent；
- 单人沟通和多人讨论使用同一套群消息、输入框、状态和成员组件；
- 单独 Codex 页面继续保留为真实 Thread 查看和控制入口，本轮不修改其 UI；
- 群聊记录与各 Agent 的 Codex Thread 仍是不同数据层，不把整段群历史永久复制到每个 Thread。

## 2. 本轮完成内容

### 2.1 多 Agent 同时提及

- 群聊输入框不再只识别第一个 `@Agent`。
- 一条消息可以按出现顺序路由给多个 Agent。
- 没有显式提及时，讨论模式仍默认交给项目经理 Agent。
- API 保留旧 `agentId` 兼容路径，新增 `agentIds` 数组。

### 2.2 共享必要群聊上下文

- 每个 Agent 开始回复前都会收到本轮真人原始要求。
- 同时传递最近 18 条非系统群消息，上限 12000 字符。
- 单条消息最多进入上下文 2400 字符，本轮原始要求最多 4000 字符。
- 提示中明确区分讨论模式和开发模式；讨论模式禁止修改文件或执行有副作用的操作。
- Agent 的历史 Thread 保持独立和持久化，但每轮通过精简群聊记录获得当前共同上下文。

### 2.3 有限轮次真实讨论

- Agent 回复中使用另一位 Agent 的完整 `@名称` 时，系统会把后者加入同一轮讨论队列。
- 用户直接邀请专业 Agent 后，项目经理 Agent 会在专业意见之后进行一次对齐和总结。
- 同一轮最多四次 Agent 发言；普通 Agent 最多一次，项目经理最多两次。
- 所有 Agent 串行运行，避免多个 Thread 同时修改同一工作区。
- 新消息在后台排队执行，HTTP 请求快速返回；Agent 工作期间输入框可以继续编辑和发送下一条消息。

### 2.4 状态与持久化

- 目标 Agent 入队后显示“已加入讨论队列”。
- 开始处理、工具、回复、完成和失败继续使用现有 SSE 状态。
- 人类消息只保存一次，并记录本轮目标 Agent 数组。
- Agent 最终回复仍写入真实群聊记录；没有写入虚构测试消息。

## 3. 代码边界

本轮只修改群聊功能和后端多 Agent 调度：

- `web-ui/src/features/group-chat/`
- `windows/server/multi-agent-service.mjs`
- `windows/server/group-room-store.mjs`
- `windows/server/request-handler.mjs`
- `windows/tests/multi-agent-service.test.mjs`

没有修改群聊 CSS，也没有把逻辑堆入单独 Codex 页面。工作区中同时包含本日此前已经完成的单人页面轻量状态、助手消息框、附件文本清理和对应 Bug 日志，这些连续修改会随本版本一起提交。

## 4. 验证结果

- `node --check`：三个本轮后端文件通过。
- `node --test windows/tests/multi-agent-service.test.mjs`：2 条测试通过，覆盖多 `@` 顺序和上下文提示。
- `pnpm build:ui`：TypeScript 与 Vite 生产构建通过，同时生成 `index.html` 和 `group.html`。
- `git diff --check`：通过，只有现有 Windows 行尾提示。
- 服务已在 `9360` 重启，新进程 PID 为 `11236`。
- `/api/group/snapshot`：HTTP 200，返回 4 个真实 Agent 和原有群消息。
- `/group.html`：HTTP 200。
- 按项目约束没有执行视觉验收，也没有自动发送真实 Agent 测试消息污染群聊历史。

## 5. 当前仍有的边界

1. 这是有限轮次调度，不是无限自主 Agent 社会；每轮最多四次发言。
2. Agent 是否邀请另一位 Agent 取决于回复中是否使用完整 `@名称`。
3. 当前只有单个内存队列；服务重启时尚未完成的讨论不会恢复。
4. 群消息仍保存在本地 `runtime/group-room.json`，没有账户、权限和数据库。
5. 开发模式仍可能触发 Codex 审批，但网页端尚未接入审批、`turn/steer`、取消和重试。
6. 群聊完整上下文不会进入 Codex Desktop 当前打开的页面；Desktop/Web 实例分离问题仍存在。
7. 群聊回复仍按增量渲染，移动端长回复性能还需要用户实际体验后再定向优化。

## 6. 下一步建议

先由用户实际测试三条核心路径：

1. 不输入 `@`，确认项目经理正常回复；
2. `@审查 Agent` 提出一个方案审核问题，确认审查回复后项目经理继续对齐；
3. 同时 `@研究 Agent` 和 `@审查 Agent`，确认两位 Agent 按顺序给出真实意见。

体验确认后，下一轮优先处理消息下方的接收、排队和失败反馈，再考虑打断、补充指令、图片发送和持久化任务队列。不要先扩展 Agent 数量、组织层级或完整企业权限。

## 7. 晚间补充：单人页与群聊体验问题修复

### 7.1 修复目标

本轮根据桌面端和 `390 x 844` 手机尺寸的真实页面点检，集中处理已经能够在现有架构内解决的体验问题，不重做整体 UI，也不引入账号系统或新的服务端框架。

用户侧目标是：

- 手机打开单人页后直接进入真实对话，不再看到无效的桌面窗口控制栏；
- 能从单人页直接进入项目群，不需要记忆 `group.html`；
- 手机群聊能判断连接是否正常，并看到是否有 Agent 正在工作；
- 用户查看历史消息时，如果有新内容到达，可以明确返回最新位置；
- 群聊历史具备日期层级，`@` 菜单不再占满手机可视区域；
- 大文件发送时能看到上传状态；
- 对话中的本地 Markdown 图片可以通过现有安全媒体接口正常显示。

### 7.2 已完成内容

#### 单人 Codex 页面

- 在手机断点下隐藏桌面窗口栏，并同步收回原本占用的顶部网格空间。
- 桌面窗口栏中的无功能按钮改为纯视觉元素，不再向浏览器和辅助技术伪装成可执行按钮。
- 移除侧栏中已经过时的“当前页面为只读模式”说明，改为“支持发送指令和附件”。
- 将右上角无功能的会话信息按钮替换为真实项目群入口，并保留当前 URL token。
- 增加独立的 `JumpToLatest` 共享组件。用户离开底部后收到新消息、流式回复或执行状态时，页面显示“新消息”按钮。

#### 群聊页面

- 手机端保留实时连接圆点，不再完全隐藏连接状态。
- 群聊标题下方在 Agent 工作时显示 Agent 名称和当前阶段；多个 Agent 同时工作时显示数量摘要。
- 群聊也接入共享的“新消息”按钮。
- 消息跨日期时显示日期分隔线；当天显示“今天”，历史日期显示月、日和星期。
- 手机 `@` 菜单最大高度改为 `min(232px, 40dvh)`，会随软键盘压缩后的动态视口继续收缩。
- 保持原有 Agent、成员、键盘上下选择和附件功能不变。

#### 附件与内容渲染

- 单人和群聊附件发送期间显示“正在上传附件…”，同时保留失败提示和附件重试缓存。
- Markdown 中的本地图片路径由服务端登记到已有 `media-service`，转换为 `/api/media/<id>` 地址。
- Markdown 图片请求由前端统一附加访问 token，不开放任意本地文件查询接口。
- 群聊页面增加空 favicon 声明，消除浏览器自动请求 `/favicon.ico` 产生的无意义 404。

### 7.3 组件与边界

新增共享 UI 组件：

- `web-ui/src/components/JumpToLatest/JumpToLatest.tsx`
- `web-ui/src/components/JumpToLatest/JumpToLatest.module.css`

主要修改范围：

- `web-ui/src/components/AppShell/`
- `web-ui/src/components/Topbar/`
- `web-ui/src/components/WindowBar/`
- `web-ui/src/features/attachments/`
- `web-ui/src/features/conversations/components/`
- `web-ui/src/features/conversations/rendering/ContentRenderer.tsx`
- `web-ui/src/features/group-chat/`
- `windows/server/content-blocks.mjs`

没有修改：

- Codex JSONL；
- 群聊消息历史；
- Agent Thread 结构；
- 账号、权限和认证体系；
- Codex Desktop 客户端；
- 项目依赖和包管理配置。

### 7.4 验证结果

- `pnpm build:ui` 通过。
- 现有定向测试 `13/13` 通过。
- `node --check windows/server/content-blocks.mjs` 通过。
- `git diff --check` 通过，仅有既有 LF/CRLF 提示。
- 单人页和群聊页均返回 HTTP 200。
- 桌面尺寸 `1440 x 900`、手机尺寸 `390 x 844` 无横向溢出。
- 手机单人页不再显示桌面窗口栏，项目群链接指向 `/group.html?token=demo123`。
- 手机群聊能看到实时连接圆点、日期分隔和高度 222px 的 `@` 菜单。
- 两张本地 Markdown 测试截图均通过 `/api/media/...` 加载，`naturalWidth` 为 390，控制台无错误。
- 服务最终运行在 `9360`，PID 为 `32700`。

本轮没有发送真实 Codex 任务或群聊消息，没有提交或推送 Git。

### 7.5 仍未解决的架构问题

1. 手机和电脑浏览器仍使用各自的 `localStorage` 成员身份，没有账号级跨设备身份。
2. 网页调用 app-server 写入 Thread 后，Codex Desktop 当前打开的页面仍不会热刷新外部追加内容。
3. 单人页面和群聊页面仍使用不同的运行状态模型；本轮只统一了部分共享 UI，没有虚构统一的数据层。
4. “新消息”提示的真实 SSE 到达路径没有通过发送测试消息做端到端验证，本轮只完成代码、构建和渲染检查。
5. 附件真实上传过程目前只有阶段提示，没有字节级百分比。
