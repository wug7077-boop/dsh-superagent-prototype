# 补丁索引

本目录存放对 `upstream/`（官方源，git 提交永远保持原样）中**已有文件**的修改。每个补丁一个主题、按序编号；应用与校验由 `scripts/patches.mjs` 管理（见仓库根 [README.md](../README.md)）。

| 补丁 | 主题 | 涉及文件 | 上游化建议 |
| --- | --- | --- | --- |
| [0001](0001-windows-shell-tool-name.patch) | Windows 构建的 shell 工具名为 `pwsh`，工具白名单按平台切换 | `src/app/sessions.ts` | 普适 Windows 支持，建议提 PR 给上游 |
| [0002](0002-windows-drive-letter-paths.patch) | 配置路径模式接受盘符绝对路径（`C:/...`） | `src/deployment.ts` | 普适 Windows 支持，建议提 PR 给上游 |
| [0003](0003-windows-hide-console-windows.patch) | 服务拉起子进程时 `windowsHide`，避免闪控制台窗口 | `src/infra/commands.ts`、`src/sources/feishu-loops.ts` | 普适 Windows 支持，建议提 PR 给上游 |
| [0004](0004-local-git-proxy.patch) | worker git 流量走本地代理 | `src/infra/environment.ts` | ⚠️ 机器特定（硬编码 `127.0.0.1:7890`），**勿推上游**；待改造为环境变量驱动 |

## 维护规则

- 一个主题一个补丁；新补丁接续编号（0005 起），不改已有编号——升级时补丁的对应关系靠编号追踪。
- 新增**文件**不进补丁，放 `extensions/`（零冲突，升级永不失效）。
- 补丁失效（上游改了同一处）时：`node scripts/patches.mjs check` 会红，按 [UPGRADE.md](../UPGRADE.md) 重写该补丁。
- 合入上游的补丁：官方发布包含该功能后，删除对应补丁文件即可。
