# PM-001 更新记录

### 2026-08-02 17:12 +08:00

- 状态：implemented_uncommitted
- 本次更新：统一进度入口到 `/progress`；摘要接口只返回首屏字段，条目详情改为按需读取；加入会话级短缓存、过期请求取消和新页面 Service Worker 入口缓存。
- 用户影响：从 Codex 页面进入进度页时不再误入旧的长文本页面；首屏传输和渲染内容减少，点击条目后才读取完整日志；重复进入时可直接使用短期缓存。
- 证据：`web-ui/src/components/ViewSwitcher/ViewSwitcher.tsx`、`web-ui/src/features/project-management/data/projectManagementApi.ts`、`/api/project-management/entries/<ITEM-ID>`

### 2026-08-02 16:07 +08:00

- 状态：implemented_uncommitted
- 本次更新：按 Jira、Linear、Asana 和 OpenProject 的共同模式，新增独立项目管理数据读取器、结构化 API、摘要优先页面、分类折叠和条目详情面板；新模块只读取 `docs/project-management/`。
- 用户影响：用户进入 `/progress` 后先看到项目目标、当前计划、进行中条目和最近更新；列表不再堆叠具体内容，点击条目才查看原话、助手初步理解、具体内容、预计效果、关联条目和更新历史。
- 证据：`windows/server/project-management-store.mjs`、`web-ui/src/features/project-management/`、`/api/project-management`

### 2026-08-02 15:30 +08:00

- 状态：in_progress
- 本次更新：依据 Jira、Linear、OpenProject 的工作项与更新记录模式，建立独立项目管理目录和条目文件格式。
- 用户影响：后续项目管理页面不再依赖旧进度页的数据结构。
- 证据：`docs/project-management/INDEX.md`、`docs/project-management/SCHEMA.md`

### 2026-08-02 18:00 +08:00

- 状态：implemented_uncommitted
- 本次更新：补齐项目管理条目过程记录分层；新增 `PROCESS_TEMPLATE.md`，并为 PM-001、FEAT-001 建立条目专属 `process.md`，同时回链 `PROC-*` 通用问题。
- 用户影响：新 AI 可以先看当前摘要，再按需进入状态历史或过程复盘；同一条通用经验不再在多个功能文件中重复维护。
- 证据：`docs/project-management/PROCESS_TEMPLATE.md`、`items/PM-001/process.md`、`items/FEAT-001/process.md`、`docs/feature-development/PROCESS_ISSUES.md`
