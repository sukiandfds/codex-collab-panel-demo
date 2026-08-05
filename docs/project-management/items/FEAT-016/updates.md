# FEAT-016 更新记录

### 2026-08-05 09:20 +08:00

- 状态：implementation_in_progress
- 用户影响：开始统一群聊品牌、应用图标、包名、仓库和本地目录；旧会话快照、设备身份与缓存使用兼容迁移，不直接清空。
- 运行边界：固定公网链接、Named Tunnel、端口和 Token 不改变；服务只在本地目录迁移的最后阶段短暂重启。

### 2026-08-05 09:28 +08:00

- 状态：implemented_pending_review
- 用户可见变化：群聊品牌改为 `negus`，应用图标由旧 `C` 改为 `N`；Web 包、构建标识和 GitHub 仓库统一使用 `negus`。
- 数据兼容：会话 LocalStorage/IndexedDB、群聊设备身份、用量与项目管理缓存读取旧命名空间并写入新命名空间，不删除旧数据。
- 验证：全部 Node 测试 `103/103`、生产 UI 构建和 `git diff --check` 通过；远端开发分支已包含产品提交 `7ae65d5284e893138ab8edd00ff0ae0166968618`。
- 运行：本地目录迁移由项目外独立 Worker 等待当前活动 Turn 收口后执行；固定网址、Named Tunnel、Token 和端口不改变。
