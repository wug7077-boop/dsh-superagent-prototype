# dsh-superagent 整合仓库

> 对 [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)（DSH 的研究原型 bundle）的二次开发改造项目：官方源原样放一个文件夹，自己的改造以补丁与扩展的形式独立存在——**文件隔离、核对直观、升级零合并冲突**。

## 项目定位

本仓库（fork 自官方，GitHub 地址 [wug7077-boop/dsh-superagent-prototype](https://github.com/wug7077-boop/dsh-superagent-prototype)）与官方是双层关系：GitHub 层面是 fork，仓库层面官方源以 git subtree 完整保存在 `upstream/`（含官方提交历史）。改造目标是让 dsh-superagent 在 Windows 与本机网络环境下可用，同时随时可吸收官方升级。

改造的完整设计、决策与执行记录见 [extensions/docs/010-integration-repo-design.md](extensions/docs/010-integration-repo-design.md)。

## 改造内容一览

对官方文件的修改全部以主题补丁存在（索引与上游化建议见 [patches/README.md](patches/README.md)）：

| 补丁 | 主题 |
| --- | --- |
| 0001 | Windows 构建的 shell 工具名为 `pwsh`，工具白名单按平台切换 |
| 0002 | 配置路径模式接受盘符绝对路径（`C:/...`） |
| 0003 | 服务拉起子进程时 `windowsHide`，避免闪控制台窗口 |
| 0004 | worker git 流量走本地代理（⚠️ 机器特定，待环境变量化） |

纯新增（零冲突，永不因升级失效）：跨平台服务管理脚本（`extensions/scripts/dsh-superagent.mjs` / `.cmd`）、[009 上下文管理改进方案](extensions/docs/009-context-management-plan.md)（未实施）、[010 整合仓库设计与执行记录](extensions/docs/010-integration-repo-design.md)。

## 布局

```
├── upstream/       官方源项目原样（git subtree 导入，含官方提交历史；提交永远保持纯净）
├── patches/        对官方已有文件的修改（一个主题一个补丁）——见 patches/README.md
├── extensions/     纯新增文件（管理脚本、方案文档、未来的插件模块），零冲突
├── scripts/        补丁与自测工具（patches.mjs / check.mjs）
└── .github/        CI 门禁（Markdown 检查 + 补丁健康检查）与贡献模板
```

## 日常使用

```bash
node scripts/patches.mjs status   # 查看补丁状态（applied / not applied / broken）
node scripts/patches.mjs apply    # 应用全部补丁到 upstream/ 工作树（常驻；提交时不提交 upstream/ 改动）
node scripts/patches.mjs revert   # 还原全部补丁（升级前执行）
node scripts/check.mjs            # 自测：确保补丁应用后在 upstream/ 跑 pnpm check
```

首次使用或升级后：`pnpm -C upstream install --frozen-lockfile`。

服务管理脚本在 `extensions/scripts/`（`dsh-superagent.mjs` / `.cmd`，跨平台），官方原版 Unix 脚本在 `upstream/scripts/`。

## 部署

DSH 通过 pnpm `link:` 依赖消费**包根**——本仓库的包根是 `upstream/` 而非仓库根。本机部署（profile `superagent`）：link 依赖指向 `<仓库>/upstream`，服务监听 `http://127.0.0.1:3083`（管理脚本需带 `--url`，默认端口 3082 不适用本机）。完整部署与迁移手册见 [UPGRADE.md](UPGRADE.md) 第二节。

## 核心纪律

1. **新增功能**放 `extensions/`（或做成 plugin / bundle 模块加 `cordis.patch.yml` 条目），不动官方文件；
2. **修改官方文件**只能通过 `patches/` 新增补丁——`upstream/` 的任何改动都不进 git 提交（CI 门禁拦截）;
3. **升级**按 [UPGRADE.md](UPGRADE.md) 流程执行；某个补丁打不上会红，重写该补丁即可，永远不会有合并冲突。

## CI 门禁

每个 PR 自动跑两个检查，失败即红：**Markdown 文档门禁**（结构 + 内部链接）与**补丁健康门禁**（逐补丁可应用性 + `upstream/` 提交纯净性）。

## 文档地图

| 文档 | 内容 |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献流程、commit 规范、扩展纪律 |
| [UPGRADE.md](UPGRADE.md) | 官方源升级流程、部署与迁移手册 |
| [patches/README.md](patches/README.md) | 补丁索引与上游化建议 |
| [extensions/docs/009-…](extensions/docs/009-context-management-plan.md) | 上下文管理改进方案（未实施） |
| [extensions/docs/010-…](extensions/docs/010-integration-repo-design.md) | 本仓库的设计定稿与执行记录 |
| [extensions/docs/011-…](extensions/docs/011-multi-agent-execution.md) | 多 agent 执行（codex / Claude Code）：机制、装配、Orca 审计入口与端到端验证 |
| [upstream/README.md](upstream/README.md) | 官方项目文档（含 `upstream/docs/` 编号系列） |
