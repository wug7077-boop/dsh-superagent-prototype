# 多 agent 执行能力（codex / Claude Code）

工单执行可以委派给外部 coding agent——OpenAI Codex 与 Anthropic Claude Code。本方案为部署层装配（零仓库代码改动），本文记录机制、装配、可观测性与端到端验证结论。日常操作见 [UPGRADE.md](../../UPGRADE.md) 的「启用多 agent 执行」一节。

## 机制

DSH 原生支持外部子代理提供方（`ctx.subagents` 命名注册表）：一次委派 = 在发起委派会话的工作区里给外部 agent 提交一个自包含文本任务，仅回传最终答案，子级过程不进入父级上下文。两个官方提供方包：

- `@deepseek-ai/dsh-subagent-codex`——每次运行拉起官方 `codex app-server --stdio`，临时线程、单轮执行；认证用宿主机原生 Codex 登录态（ChatGPT 账号）。
- `@deepseek-ai/dsh-subagent-claude-code`——经官方 Claude Agent SDK 调用原生 `claude` CLI；读取宿主机原生 Claude 设置与 OAuth 登录态。

worker 预设自带的通用 `subagent` 工具固定为 `provider: spawn`（本地 DSH 子会话，用于并行本地任务），与上述两个专用委派工具（`subagent_codex` / `subagent_claude_code`，Host 全局工具行、所有预设可见）共存不冲突。GLM worker 在工单中三选一：自己干、spawn 本地子代理、或委派 codex / Claude Code。

## 装配（部署层）

1. 安装提供方包到 DSH profile（npm 版本声明滞后于运行时，需按提示授予精确版本豁免）：
   `dsh plugin --profile superagent allow-version @deepseek-ai/dsh-subagent-codex@<版> --dsh-version <版> --accept-risk`（两个包同理），再 `dsh plugin --profile superagent add <包名>`；
2. 在 profile 的 `cordis.patch.yml` 追加提供方行与工具行——完整模板见 [extensions/profile-patches/multi-agent.patch.yml](../profile-patches/multi-agent.patch.yml)；
3. **代理是硬前提**（与补丁 0004 同源）：codex 需可达 `chatgpt.com`、claude 需可达 `api.anthropic.com`，本机直连均被重置。两级注入：提供方行 `config.env` 显式代理（覆盖工具调用路径）+ `upstream/.artifacts/service-env.json` 进程级代理（覆盖 worker 经 bash 直接调 CLI 的回退路径），均含 `NO_PROXY=127.0.0.1,localhost`；
4. 重启服务后 worker 会话即可见两个委派工具。

## 可观测性：调用记录与 Orca

每次委派在 CLI 侧落**本地会话记录**，这是运维审计的事实源：

| agent | 记录落点 | 内容 |
| --- | --- | --- |
| codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | 完整轮次：任务、每步消息、最终答案、线程 id |
| Claude Code | `~/.claude/projects/<工作区路径转义>/*.jsonl` | 每次调用一条会话记录（冒烟测试与正式委派各一条） |

**Orca 索引这些记录**，是本机的 agent 调用审计入口——委派是否发生、何时、给了什么任务，在 Orca 里可直接核对。

排查辨析：常驻 Orca IDE 自身也会拉起 agent 进程（如 `orca-ide → claude` 进程对），**与本链路无关**。区分方法看父进程树归属：本链路的 CLI 进程挂在 dsh 服务进程之下，Orca 自身的挂在其 IDE 进程之下；调用链本身不经 Orca——DSH 提供方从 PATH 直连官方 CLI（`~/.local/bin/codex` → 官方 npm 包，`~/.local/bin/claude` → 官方 Bun 二进制）。

## 端到端验证记录（2026-11-04）

以允许名单账号在目标仓库发两条显式工单请求（显式请求在任何 accept 模式下均受理；临时 resume、测后恢复 paused），`maxWorkers: 1` 顺序执行：

| 工单 | 请求 | 委派 | CLI 记录 | 结果 |
| --- | --- | --- | --- | --- |
| A | issue #2：README 末项分号改句号，要求经 codex | codex（单字精确修改） | `rollout-…T21-38-21` / `…T21-42-18` 两条 | issue #2 回复 ✅；PR 因注入代理的服务重启打断推送，由运维手工补齐为 PR #5 |
| B | issue #3：「全部分区入口登记」消歧，要求经 Claude Code | Claude Code（冒烟 + 正式委派两条会话） | `~/.claude/projects/…fix-readme-wording-b203877e619c/` | issue #3 回复 ✅ + PR #4 自动创建 ✅ |

结论：**worker 按工单指定把实现工作委派给了不同的外部 agent**，修改精确、回复与 PR 链路完整；记录在案的 CLI 会话即 Orca 侧可核对的调用凭证。

## 运维注意

- 代理进程（`127.0.0.1:7890`）不可用时 codex / claude 委派会失败重连（表现为 worker 长时间 job 等待），先查代理；
- worker 卡在委派重试循环时，可经管理 API `POST tickets/:id/stop` 停工单、`POST triggers/:id/requeue` 重排队；
- npm 上提供方包版本滞后，升级 DSH 运行时后需按需重新授予版本豁免并回归验证。
