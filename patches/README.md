# 补丁索引

本目录存放对 `upstream/`（官方源，git 提交永远保持原样）中**已有文件**的修改。每个补丁一个主题、按序编号；应用与校验由 `scripts/patches.mjs` 管理（见仓库根 [README.md](../README.md)）。

| 补丁 | 主题 | 涉及文件 | 上游化建议 |
| --- | --- | --- | --- |
| [0001](0001-windows-shell-tool-name.patch) | Windows 构建的 shell 工具名为 `pwsh`，工具白名单按平台切换 | `src/app/sessions.ts` | 普适 Windows 支持，建议提 PR 给上游 |
| [0002](0002-windows-drive-letter-paths.patch) | 配置路径模式接受盘符绝对路径（`C:/...`） | `src/deployment.ts` | 普适 Windows 支持，建议提 PR 给上游 |
| [0003](0003-windows-hide-console-windows.patch) | 服务拉起子进程时 `windowsHide`，避免闪控制台窗口 | `src/infra/commands.ts`、`src/sources/feishu-loops.ts` | 普适 Windows 支持，建议提 PR 给上游 |
| [0004](0004-local-git-proxy.patch) | worker git 流量走本地代理 | `src/infra/environment.ts` | ⚠️ 机器特定（硬编码 `127.0.0.1:7890`），**勿推上游**；待改造为环境变量驱动 |
| [0005](0005-worker-delegation-via-orca-tools.patch) | worker 委派外部 agent 必须走 `subagent_orca_*` 工具（经 Orca 实时运行），禁止直调 orca CLI / orchestration / 裸 CLI | `prompts/worker.md` | 部署特定（依赖 Orca 桥装配），勿推上游 |
| [0007](0007-worker-tools-allow-orca.patch) | `WORK_TOOLS` 白名单加入 `subagent_orca_*`——executor 会话工具总闸（`tools.restrict`）放行 orca 委派工具；名单有 filter 兜底，未装配插件的机器不受影响 | `src/app/sessions.ts` | 部署特定（依赖 Orca 桥装配），勿推上游 |

> 0006（orca 工具行组合进 worker 预设）已删除：实测无效——工具行在 harness 中零装载痕迹（疑 cordis 对 link 包行形态的组合细节），F 工单全新会话验证工具仍不可见。若后续打通工具注册且 Host 行仍不进预设，可按本表描述重新提取。

## 维护规则

- 一个主题一个补丁；新补丁接续编号（0005 起），不改已有编号——升级时补丁的对应关系靠编号追踪。
- 新增**文件**不进补丁，放 `extensions/`（零冲突，升级永不失效）。
- 补丁失效（上游改了同一处）时：`node scripts/patches.mjs check` 会红，按 [UPGRADE.md](../UPGRADE.md) 重写该补丁。
- 合入上游的补丁：官方发布包含该功能后，删除对应补丁文件即可。
| [0007](0007-worker-tools-allow-orca.patch) | worker 工具白名单（WORK_TOOLS）放行 `subagent_orca_*` 委派工具——真根因：白名单掩码挡掉了预设里已组合的工具 | `src/app/sessions.ts` | 部署特定（依赖 Orca 桥装配），勿推上游 |
