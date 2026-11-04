# 贡献指南

> **本仓库是对 [dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) 的隔离式二次开发整合仓库**：官方源在 `upstream/` 永远保持原样，改造以 `patches/` 与 `extensions/` 的形式存在。日常大量工程工作由 coding agent 完成，本指南对人和 agent 一视同仁：走同一条流程，过同一道门禁。

欢迎以 Issue 和 Pull Request 参与贡献，整体流程是 **Fork → 建分支 → 提交 → 发起 PR**。

## 准备：Fork 与远端

```bash
gh repo fork wug7077-boop/dsh-superagent-prototype --clone
cd dsh-superagent-prototype
git remote add upstream https://github.com/deepseek-ai/dsh-superagent-prototype
```

克隆后 `origin` 指向你的 fork。吸收**官方源**更新用 [UPGRADE.md](UPGRADE.md) 的 subtree 流程；同步本整合仓库的 main 直接 `git pull`。

## 建分支

从 `main` 切出功能分支，命名 `<type>/<主题>`（`docs/`、`feat/`、`fix/`）。按切片推进工作时使用 `agent/slice-N-<主题>`。

## 提交

commit message 以类型前缀开头：

- `docs:`——文档变更
- `feat:`——新功能
- `fix:`——缺陷修复

格式为 `type: 摘要`。由 coding agent 主导完成的提交，按仓库既有约定以 agent 身份署名（如 `dsh-superagent agent <team@dsh.dev>`）；移植他人的工作时保留原作者（`--author`）。

## 扩展纪律（本仓库的核心约定）

1. **新增文件一律放 `extensions/`**（管理脚本、文档、未来的 plugin / bundle 模块加 `cordis.patch.yml` 条目）——新文件零冲突，升级永不失效；
2. **修改官方已有文件只能通过 `patches/` 补丁**——`upstream/` 在 git 提交历史里永远等于官方原样，任何对它的改动都不提交（补丁常驻打入工作树属正常状态）；
3. 补丁一个主题一个文件、编号递增，索引与上游化建议见 [patches/README.md](patches/README.md)；
4. 提交前自测：`node scripts/check.mjs`（应用补丁后在 `upstream/` 跑全量 typecheck + test + build）。

CI 门禁：全部 `*.md` 的结构与内部链接检查（文档集另查单 H1、标题不跳级、无尾随空白）+ 补丁健康检查（每个补丁可应用或已应用、`upstream/` 提交纯净），失败即红。

## 发起 PR

- PR 必须包含三段：变更说明、自测清单、关联 issue，模板见 `.github/PULL_REQUEST_TEMPLATE.md`；
- 涉及补丁的 PR 请在变更说明里逐条列出补丁的用途与是否建议上游化。

## 文档约定

- 面向用户的文档以中文撰写；官方文档（`upstream/` 内）保持原样不译；
- 整合仓库自身的说明在 [README.md](README.md)（布局与日常命令）与 [UPGRADE.md](UPGRADE.md)（升级与部署迁移）。

## Issue

报告问题或提出建议请使用 `.github/ISSUE_TEMPLATE/` 中的模板，模板内标注了必填字段。
