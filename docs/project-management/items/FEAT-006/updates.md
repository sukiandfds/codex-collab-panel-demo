# FEAT-006 更新记录

### 2026-07-28 23:19 +08:00

- 状态：in_progress
- 本次更新：确认固定域名可通过香港 VPN 路由到 HKG，但长期稳定线路仍待确定。
- 用户影响：活动任务期间不能切换 VPN/Tunnel，公网入口暂不作为已完成能力。
- 证据：`docs/feature-development/features/FEAT-006-stable-remote-access.md`

### 2026-08-06 23:35 +08:00

- 状态：in_progress
- 本次更新：重复验证公网附件上传延迟问题；同一张约 120 KB 图片本机上传约 0.10 秒，公网 `codex.negus.us.ci` 上传约 16.25 秒，首次测试约 10 秒。
- 用户影响：网页端发送图片消息明显慢于纯文字消息；查看已有图片正常。VPN 可能改善线路，但不稳定，不作为长期方案。
- 结论：问题已确认集中在公网 Tunnel/大陆网络的上传方向；Negus 本机上传和保存速度正常。
- 证据：`docs/feature-development/NETWORK_UPLOAD_INCIDENT_2026-08-06.md`、当前公网 POST `201` 响应与本机/公网耗时对比。
