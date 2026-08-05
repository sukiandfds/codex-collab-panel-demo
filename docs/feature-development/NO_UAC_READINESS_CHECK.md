# Windows 无 UAC 开发环境只读检查

## 作用

`windows/scripts/check-dev-environment.ps1` 用于在原开发电脑上确认：普通用户是否具备完成代码修改、依赖使用、测试、构建和 Git 操作的基础条件。

它只报告，不修复：

- 不创建测试文件，也不修改现有文件、ACL、注册表或环境变量；
- 不安装或更新 Node.js、pnpm、Git；
- 不启动、停止或重启项目进程、Windows 服务；
- 不绑定端口，不尝试 UAC，也不操作安全桌面；
- 不运行 `node`、`pnpm` 或 `git` 命令，版本只从文件元数据或项目配置读取。

因此，这个工具可提前发现日常远程开发可能被权限卡住的地方，但不会把电脑“修成”某种状态。

## 使用

在仓库根目录的普通 PowerShell 中运行：

```powershell
powershell -NoProfile -File .\windows\scripts\check-dev-environment.ps1
```

如果日常使用 PowerShell 7：

```powershell
pwsh -NoProfile -File .\windows\scripts\check-dev-environment.ps1
```

机器读取 JSON 结果：

```powershell
pwsh -NoProfile -File .\windows\scripts\check-dev-environment.ps1 -Json
```

检查其他项目目录或端口：

```powershell
pwsh -NoProfile -File .\windows\scripts\check-dev-environment.ps1 `
  -ProjectRoot 'D:\projects\negus' `
  -Port 9360,9335,9350
```

脚本无论发现多少问题都只输出报告，不用退出码代替用户判断，也不会自动执行“修复”。

## 实际检查内容

| 编号 | 检查 | 实际说明 |
| --- | --- | --- |
| 1 | 项目与用户路径 | 检查仓库、`.git`、`web-ui/node_modules`、`LOCALAPPDATA`、`TEMP`、Codex 目录及 pnpm 目录的 ACL。为了保持完全只读，不写探针文件，所以结果标为 ACL 推断。 |
| 2 | 开发工具 | 检查 Node.js、pnpm、Git 是否能从当前 `PATH` 找到，并读取可安全取得的文件版本。Node.js 默认要求 22 或更高；pnpm 期望版本来自根目录 `package.json`。 |
| 3 | PowerShell | 报告当前 PowerShell 版本、执行策略和语言模式；不会修改执行策略。 |
| 4 | 端口 | 使用 .NET 只读枚举 TCP 监听端口，默认检查 `9360`、`9335`、`9350`。不使用曾误报的 CIM/WMI 查询，不绑定端口，也不结束占用进程。 |
| 5 | UAC 风险 | 标出项目或 pnpm 目录是否落在 `Windows`、`Program Files`、`ProgramData` 等受保护位置；报告当前检查是否在管理员进程内运行，以及符号链接的 Developer Mode 状态。 |

报告状态：

- `PASS`：当前只读证据满足要求；
- `WARN`：可以继续，但原电脑上仍需确认，例如端口已有监听或版本无法只读确定；
- `BLOCKED`：普通开发链路明显缺少工具或写权限；
- `INFO`：边界说明，不代表故障。

## 如何理解结果

1. 项目目录和缓存目录都应位于当前用户可写范围；不要为了日常构建把 Codex 或项目整体改成管理员运行。
2. `9360` 显示已监听，不一定是错误，可能就是项目服务正在运行。应先确认是不是预期服务，工具不会替用户停止它。
3. 如果检查器本身在管理员 PowerShell 中运行，会给出警告：管理员可写不代表远程任务用普通权限也可写，应在普通 PowerShell 中再运行一次。
4. ACL 是只读推断，无法覆盖所有企业组策略、杀毒软件拦截、文件锁或运行时行为。最终仍需在原开发电脑上跑一次真实的修改、安装项目依赖、测试、构建、Git 和必要后端重启链路。
5. 驱动、Windows 服务、机器级防火墙、`HKLM`、受保护目录修改仍属于本机维护事项，不应加入日常网页开发流程。

## 只读验证

判断逻辑有独立测试，不需要 Pester，也不会写临时文件：

```powershell
powershell -NoProfile -File .\windows\tests\dev-environment-readiness.test.ps1
```

测试覆盖受保护路径、ACL 允许/拒绝、版本解析、端口占用及 pnpm 目录风险。真实原电脑仍需另做一次端到端验证，本工具不把“静态检查通过”误报成“所有开发操作已经验证”。
