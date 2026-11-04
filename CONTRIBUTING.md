# 贡献指南

> **dsh-superagent 是研究原型，日常大量工程工作由 coding agent 完成。** 本指南对人和 agent 一视同仁：走同一条流程，过同一道门禁。

欢迎以 Issue 和 Pull Request 参与贡献，整体流程是 **Fork → 建分支 → 提交 → 发起 PR**。

## 准备：Fork 与远端

```bash
gh repo fork deepseek-ai/dsh-superagent-prototype --clone
cd dsh-superagent-prototype
```

克隆后 `origin` 指向你的 fork，`upstream` 指向原仓库。吸收上游更新用 merge，不要 rebase 已共享的分支：

```bash
git fetch upstream
git merge upstream/main
```

## 建分支

从 `main` 切出功能分支，命名 `<type>/<主题>`，例如 `docs/contributing`、`feat/issue-source`、`fix/ticket-loop`。按切片推进工作时使用 `agent/slice-N-<主题>`。

## 提交

commit message 以类型前缀开头：

- `docs:`——文档变更
- `feat:`——新功能
- `fix:`——缺陷修复

格式为 `type: 摘要`，例如 `docs: 新增贡献指南 CONTRIBUTING.md`。

由 coding agent 主导完成的提交，按本仓库既有约定以 agent 身份署名，例如作者为 `dsh-superagent agent <team@dsh.dev>`。

## 发起 PR

- PR 必须包含三段：变更说明、自测清单、关联 issue，模板见 `.github/PULL_REQUEST_TEMPLATE.md`。
- 提交前自测：`pnpm check` 运行类型检查、测试与构建（见 [README](README.md) 的 Development 一节）。
- 文档变更需通过 CI 的 Markdown 门禁（见下）。

## 扩展纪律

dsh-superagent 是 DSH 的一个 bundle，扩展哲学是「组装，而不是修改」。守住以下纪律，才能持续吸收上游（DSH 框架与本原型）的更新：

- 新增功能优先以新的 plugin / bundle 模块加 [cordis.patch.yml](cordis.patch.yml) 条目的形式实现；
- 尽量不直接修改现有 `src/` 文件——没有修改过的文件，升级时永不冲突；
- 确需修改时，把改动压到最小，每处加 `// EXT: <原因>` 标记，并在 PR 的变更说明里逐条列出，便于升级时对账；
- 上游依赖锁定在 [pnpm-lock.yaml](pnpm-lock.yaml)，升级一律走 PR 并跑全量自测。

## 文档约定

- 面向用户的文档以中文撰写，沿用 [README](README.md) 的编号文档体系（`docs/000` 起），新文档接续编号。
- CI 门禁（`.github/workflows/ci.yml`）检查仓库内全部 `*.md`：文档集（`README.md`、`SETUP.md`、本文件与 `docs/*.md`）要求单 H1、标题不跳级、无尾随空白；所有 `*.md` 的内部链接与页内锚点必须有效，失败即红。

## Issue

报告问题或提出建议请使用 `.github/ISSUE_TEMPLATE/` 中的模板，模板内标注了必填字段。
