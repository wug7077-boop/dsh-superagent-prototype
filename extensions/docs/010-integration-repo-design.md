# 隔离整合仓库设计与执行记录

本文是本整合仓库（对 [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) 的二次开发）的方案定稿与执行落盘：为什么这样设计、做了什么决定、执行到什么程度、还欠什么。日常操作手册见根目录 [README.md](../../README.md) 与 [UPGRADE.md](../../UPGRADE.md)。

## 1 背景与目标

对官方持续更新的开源项目做二次开发（Windows 适配、本地网络代理），同时**不能丢失对源项目升级的吸收能力**。两条硬约束：

- 自己的改造与官方代码**文件隔离**，一眼分清"官方的"和"我的"，方便核对；
- 升级官方版本时**不产生合并冲突**，改动的维护成本可枚举、可验证。

## 2 方案选型与决策记录

业界可选路径与本仓库的取舍：

| 方案 | 说明 | 取舍 |
| --- | --- | --- |
| 上游当依赖（插件/扩展点） | 官方作为 npm 依赖锁定版本 | 不适用：改造需触碰官方 `src/` 内部行为 |
| fork + merge + 标记对账 | 官方文件直接改，`// EXT:` 标记、升级时 merge | 曾采用（融纳切片⑤时），升级有冲突面、核对靠 grep，**放弃** |
| **subtree + patches 隔离** | 官方源原样入 `upstream/` 子树，修改全部是补丁文件 | **采纳**：文件隔离、升级零冲突、补丁显式存在逐个验证 |

两个关键决策：

1. **补丁常驻打入、提交保持纯净**：日常 `upstream/` 工作树带着补丁（开发即所见、IDE 与构建可用），但 git 提交历史里 `upstream/` 永远等于官方原样——纯净性由 CI 校验树哈希（`git rev-parse upstream/main^{tree}` 与 `HEAD:upstream` 比对），误提交即红。
2. **subtree 保留官方提交历史**：`git subtree` 导入官方全部历史，核对官方演进直接 `git log upstream/`；升级 = `git subtree pull`，只动 `upstream/` 前缀。

## 3 目标架构

```
repo/
├── upstream/       官方源原样（subtree，含官方历史；提交永远纯净，运行产物 .artifacts/ 在此但被忽略）
├── patches/        对官方已有文件的修改：一个主题一个补丁、编号递增——索引见 [patches/README.md](../../patches/README.md)
├── extensions/     纯新增文件（管理脚本、方案文档、未来插件模块），零冲突永不失效
├── scripts/        patches.mjs（apply/revert/status/check）与 check.mjs（补丁态全量自测）
└── .github/        CI 双门禁与贡献模板
```

git 流的三条铁律：

- 官方提交只进 `upstream/` 前缀（subtree 合并）；
- 改造只以 `patches/*.patch` 与 `extensions/` 的形式提交；
- `upstream/` 的任何改动不进提交（常驻补丁属工作树状态）。

## 4 治理体系

- **贡献流程**（[CONTRIBUTING.md](../../CONTRIBUTING.md)）：Fork → 建分支 → 提交（`docs:` / `feat:` / `fix:` 前缀，agent 主导的提交以 agent 身份署名）→ PR（变更说明 / 自测清单 / 关联 issue 三段模板）。切片工作用 `agent/slice-N-<主题>` 分支。
- **CI 门禁**（`.github/workflows/ci.yml`，两个 job）：
  - **Markdown 文档门禁**：全部 `*.md` 校验 UTF-8、无冲突标记、内部链接与页内锚点可解析（外链不做网络探测以保证稳定）；文档集（根三份 + `upstream/` 官方文档 + `extensions/docs/`）另查单 H1、标题不跳级、无尾随空白、无 Tab 缩进。
  - **补丁健康门禁**：`node scripts/patches.mjs check`——逐补丁「可应用或已应用」（`broken` 即上游演进导致失效）+ `upstream/` 提交纯净性树哈希校验。

## 5 改造融纳记录

融纳来源：`dongyeTOP/dsh-superagent` 的 `c37b248`（基线与官方 `8c32a9d` 逐字节一致，曾以 fork+merge 方式合入，隔离重构时转换为补丁形态）：

| 原改动 | 去向 |
| --- | --- |
| `src/app/sessions.ts`：Windows shell 工具名 `pwsh` 按平台切换白名单 | 补丁 0001 |
| `src/deployment.ts`：配置路径接受盘符绝对路径 | 补丁 0002 |
| `src/infra/commands.ts` + `src/sources/feishu-loops.ts`：子进程 `windowsHide` | 补丁 0003 |
| `src/infra/environment.ts`：worker git 流量走本地代理（机器特定） | 补丁 0004 |
| `scripts/dsh-superagent.mjs` / `.cmd`：跨平台服务管理脚本 | `extensions/scripts/`（ROOT 调整指向 `upstream/`） |
| `docs/009-context-management-plan.md`：上下文管理改进方案（未实施） | `extensions/docs/009-context-management-plan.md` |

补丁的上游化建议见 [patches/README.md](../../patches/README.md)：0001~0003 为普适 Windows 支持、建议推上游；0004 机器特定、勿推。

## 6 执行与验证记录

按切片推进，每片独立分支与 PR（全部合入 fork `wug7077-boop/dsh-superagent-prototype` 的 main）：

| 切片 | PR | 内容 |
| --- | --- | --- |
| ①~④ | #1~#4 | 贡献指南、Issue 模板、PR 模板、CI md 门禁（治理基线） |
| ⑤ | #5 | 融纳 Windows 适配与 009 方案（当时为 fork+merge 形态） |
| ⑥ | #6 | 隔离重构：官方源入 `upstream/` 子树，改造转 `patches/` + `extensions/`，CI 增补丁门禁 |

验证证据（重构当时）：

- 官方区纯净：`upstream/` 树哈希与官方基线逐字节一致（`3efbb036…`）；
- 补丁工具全链路（apply / revert / status / check）通过；模拟「补丁误提交进 `upstream/`」被纯净性校验正确拦截；
- 打补丁态 `pnpm -C upstream` typecheck 与 build 通过，测试 1195/1197——2 个失败在官方源上原样复现（git 中文 locale 的报错文案断言、飞书事件消费者环境依赖），与本仓库改动无关；
- CI 双门禁在 PR⑥ 上真实运行全绿。

## 7 本机部署迁移记录

隔离重构改变了包根（仓库根 → `upstream/`），本机既有部署迁移四处（迁移前备份于 `~/dsh-demo/deploy-backup-20261104-205219`）：

1. **profile link 重指**：`~/.dsh/profiles/superagent/package.json` 的 `dsh-superagent` 依赖改为 `link:<仓库>/upstream`，profile 内重装生成新软链；
2. **状态库路径**：`~/.dsh/state/superagent/orchestrator.sqlite` 全部 11 行 settings 中的 gh 包装器（`cli`）与 `prepare` 脚本路径改指 `upstream/.artifacts/`；
3. **`.artifacts` 迁移**：整体拷贝至 `upstream/.artifacts`，修正 `superagent` 包装器内管理脚本的绝对路径；
4. **服务重启**：旧进程挂在已删除的旧根路径上，stop 后从新布局 start。

迁移后验证：管理脚本 `status`（需 `--url http://127.0.0.1:3083`，服务实际监听 3083 而非脚本默认 3082）11 个健康组件全部 `ready`，面板 HTTP 正常响应。

## 8 遗留事项

- **0004 代理补丁治理**：`http://127.0.0.1:7890` 为硬编码，建议改造为环境变量驱动（如 `DSH_SUPERAGENT_PROXY` 有值才写入 worker gitconfig），完成后仅剩普适 Windows 补丁；
- **0001~0003 推上游**：等官方接收后删除对应补丁文件即可；
- **workflow scope 授权**：`wug7077-boop` 的 gh OAuth token 缺 `workflow` scope，推送 `.github/workflows/` 变更需经 dongyeTOP SSH 通道绕行；在用户终端执行 `gh auth refresh -h github.com -s workflow` 一次性解决。
