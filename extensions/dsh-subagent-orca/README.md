# dsh-subagent-orca

DSH 外部子代理提供方：经 [superagent-bridge](https://github.com/dongyeTOP/superagent-bridge)（私有）把任务委派给 **Orca 的多 agent worker（claude / codex / dsh）**。每次委派在 Orca 里获得一个专属会话（`worker-start` 派发，实时出现在 Orca 会话列表），结果经确定性状态轮询回收（`status.worker`），附工作区 HEAD SHA 证据。

## 机制

- 一个插件按 `routes` 注册多个提供方（默认 `orca-claude` / `orca-codex` / `orca-dsh`），各自对应一个 `dsh-tool-subagent` 工具行（`subagent_orca_claude` 等）。
- `start()`：`bridge.py dispatch --no-wait`（桥负责 Orca Run/终端身份、`sa-<ticket>` 工作区复用与并行分裂、基线同步）→ 轮询 `orchestration worker-read` 的 `status.worker` 直到终态 → 最终答案取转录末尾 assistant 文本 + `git rev-parse HEAD` 证据。
- 取消/释放：映射 `bridge.py cancel`（fence 语义）。
- 工单目录名即桥的 ticket 名：同一工单内的多次委派复用同一工作区（连续作业）。

## 前置

1. 本机部署 superagent-bridge（`bridge.py` + `bridge.config.json`，`init` 完成）；Orca 桌面在运行；
2. 基线 clone 已在 Orca 登记（`repo add`）；
3. worker CLI（claude/codex）已登录且能达外网（本机经代理，桥配置 `proxy` 项）。

## 装配

profile 依赖：`pnpm add link:<本包路径>`；profile `cordis.patch.yml` 追加提供方行与工具行，示例见仓库 `extensions/profile-patches/multi-agent.patch.yml`（orca 段）。完整方案见 `extensions/docs/011-multi-agent-execution.md`。
