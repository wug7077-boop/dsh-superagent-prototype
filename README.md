# dsh-superagent 整合仓库

> 基于 [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)（DSH 的研究原型 bundle）做二次开发的**隔离式整合仓库**：官方源原样放一个文件夹，自己的改造以补丁与扩展的形式独立存在，升级零合并冲突。

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

## 核心纪律

1. **新增功能**放 `extensions/`（或做成 plugin / bundle 模块加 `cordis.patch.yml` 条目），不动官方文件；
2. **修改官方文件**只能通过 `patches/` 新增补丁——`upstream/` 的任何改动都不进 git 提交（CI 门禁拦截）;
3. **升级**按 [UPGRADE.md](UPGRADE.md) 流程执行；某个补丁打不上会红，重写该补丁即可，永远不会有合并冲突。

贡献流程、commit 规范与 PR 约定见 [CONTRIBUTING.md](CONTRIBUTING.md)；官方项目自身的文档在 [upstream/README.md](upstream/README.md) 与 `upstream/docs/`。
