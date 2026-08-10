# negus 精简诊断报告（2026-08-10）

> 本报告只做诊断，不做修改。每一项请在勾选后逐条批准执行。
> 数据来源：2026-08-10 21:05 实际扫描。

## 0. 总览

| 项目 | 数值 |
|---|---|
| 磁盘总占用（不含 .git） | ~487 MB |
| .git 仓库 | 33 MB / 585 个跟踪文件 |
| 代码量 | web-ui/src 173 文件 0.5MB；windows/server 60 文件 |

**核心结论：git 仓库本身干净，臃肿是本地运行残留，不是代码问题。**

---

## A. 纯磁盘残留（安全清理，预计回收 ~590 MB）

> 以下文件均已加入 `.gitignore` 或属于可再生产物，删除不影响 git 历史、代码和功能。

| # | 路径 | 大小 | 说明 | 风险 | 我的建议 |
|---|---|---|---|---|---|
| A1 | `web-ui/node_modules/` | ~370 MB | 前端依赖，可随时 `pnpm --dir web-ui install` 重建 | 删后下次构建前需重装依赖 | ✅ 删 |
| A2 | `isolated-profile/` | ~215 MB | 早期隔离 Codex 浏览器 profile，当前 Web demo 已不使用 | 需确认无进程占用 | ✅ 删 |
| A3 | 根目录 `isolated-*.png` × 7 | ~22 MB | 早期验证截图，已 ignore | 无 | ✅ 删 |
| A4 | `isolated-codex.stdout.log` / `.stderr.log` | ~3.3 MB | 早期日志，已 ignore | 无 | ✅ 删 |
| A5 | `cf.err.log` / `cf.out.log` | ~0.1 MB | cloudflared 日志，已 ignore | 无 | ✅ 删 |
| A6 | `node_modules/`（根） | ~32 MB | 根依赖（MCP server/sharp/zod），`pnpm install` 可重建 | 低 | ✅ 删 |
| A7 | `.playwright-mcp/` + `.pnpm-store/` | ~0.1 MB | 工具残留 | 无 | ✅ 删 |

**执行前需先停止**：9360 服务、cloudflared、Codex 相关进程，避免文件被占用。

---

## B. 结构/仓库项（需你决策，默认不动）

| # | 路径 | 大小 | 现状 | 选项 |
|---|---|---|---|---|
| B1 | `macos/` | 3.4 MB（已跟踪） | 上游遗留，README 仍引用 | **你已决定：保留** |
| B2 | `output/imagegen/` | 3.3 MB（已跟踪） | 图片生成产物 | 保留；可选：加入 `.gitignore` + `git rm --cached` 减小仓库（本次不做） |
| B3 | `docs/images/` | 16 MB（已跟踪） | 皮肤/预设截图，README 展示内容 | 保留 |
| B4 | 4 个应用入口（main/group/progress/project-management） | — | 全部在 vite 构建 input 中，是正式交付 | 保留（收敛是产品决策，不在本次范围） |
| B5 | 根目录 10 个 `DEVELOPMENT_*.md` | ~120 KB | AI_ASSISTANT_READ_FIRST 引用其中 6 个作为证据；4 个未引用（07-29、07-24 DESKTOP_WEB_SYNC、07-25 BUG、07-25 PROCESS_BLOCKERS） | 选项：①全部保留；②未引用的 4 个移到 `docs/archive/` |
| B6 | 包管理统一 | — | `web-ui/` 有 `pnpm-lock.yaml` + 已 ignore 的 `package-lock.json` + `pnpm-workspace.yaml`；根目录另有 `pnpm-lock.yaml` | 可选：删除已 ignore 的 `web-ui/package-lock.json` |
| B7 | `output/` 未进 `.gitignore` | — | 生成产物可能误入 git | 可选：`.gitignore` 加 `output/` |

---

## C. 活跃数据（千万别动）

| # | 路径 | 说明 |
|---|---|---|
| C1 | `runtime/`（42 MB） | **活跃运行数据**。`runtime/uploads/` 今天（08-10 14:09）仍在写入。仅当你确认要清空历史上传时才可清理其中 `uploads/`、`generated-images/` |
| C2 | `.git/` | 正常，不做历史改写（filter-repo/gc 风险高，收益小） |
| C3 | `docs/`、`资料库/`、`项目战略与多角色评审/` | 文档资料，保留 |

---

## D. 建议执行顺序

1. **Phase 1**：A1-A7 全删 → 磁盘从 ~487 MB 降到 ~130 MB（净回收约 357 MB 源码体积 + 依赖）。
2. **Phase 2**（可选）：B5/B6/B7 中你勾选的小项。

预计总收益：磁盘占用削减约 75%，git 仓库不变（0 风险）。
