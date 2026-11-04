# 升级与部署迁移手册

官方源（`upstream/`）通过 git subtree 跟踪 [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)。升级 = 拉官方新版本 + 重放补丁；补丁打不上时**只有那一个补丁需要人工处理**，不存在合并冲突。

## 一、升级官方源

前提：远端 `upstream` 指向官方仓库（`git remote -v` 确认）。

```bash
# 1. 还原常驻补丁，让 upstream/ 工作树回到纯净
node scripts/patches.mjs revert

# 2. 拉官方最新 main 进 upstream/（subtree 合并，只动 upstream/ 前缀）
git fetch upstream main
git subtree pull --prefix=upstream upstream/main -m 'chore: 升级官方源到 <版本/commit>'

# 3. 重放补丁
node scripts/patches.mjs apply

# 4. 门禁自测
node scripts/patches.mjs check     # 补丁健康 + upstream/ 提交纯净
pnpm -C upstream install --frozen-lockfile
node scripts/check.mjs             # 官方全量 typecheck + test + build

# 5. 重建部署产物并重启（见下节）
```

### 补丁失效时

`check` 报 `broken` 的补丁：官方改动了同一处代码。处置：

1. `node scripts/patches.mjs revert` 后打开 `upstream/` 对应文件，看官方新版怎么写的；
2. 目标不变（保留我们的行为、采纳官方的新实现），重写 `patches/` 里那个 `.patch` 文件（`git diff` 重新生成或手改 hunk）；
3. 回到上面第 3 步。若官方已内置等价功能，直接删除该补丁并在提交说明里记一笔。

### 核对官方变更

- 官方新提交了什么：`git log --oneline <旧基线>..upstream/main`（subtree 导入时官方历史在本仓库可见）；
- 升级前后官方树差异：`git diff <旧subtree提交>..HEAD -- upstream/`。

## 二、部署（DSH profile 消费本仓库）

DSH 通过 pnpm `link:` 依赖消费**包根**——本仓库的包根是 `upstream/`，不是仓库根。部署或换机器时：

```bash
# 在 DSH profile（如 ~/.dsh/profiles/superagent）里把 link 指到 upstream/：
cd ~/.dsh/profiles/superagent
# package.json: "dsh-superagent": "link:<本仓库绝对路径>/upstream"
pnpm install

# 构建：
cd <本仓库> && node scripts/patches.mjs apply && pnpm -C upstream build
```

迁移既有部署时还需检查三处历史路径（详见下节本机迁移记录）：

1. **状态库设置**：`~/.dsh/state/superagent/orchestrator.sqlite` 中 GitHub Source 的 `cli` 设置指向的 gh 包装器路径，需指向 `<仓库>/upstream/.artifacts/bin/...`；
2. **`.artifacts` 下的包装脚本**（如 `superagent`、`bin/gh-*`）内含绝对路径，重新生成；
3. **外部定时任务**（hourly check）持有的 `<checkout>` 路径若指向旧仓库根，改为 `<仓库>/upstream`。

## 三、日常开发注意

- 补丁常驻打入：`upstream/` 工作树带着补丁是正常状态，**但提交时永远不提交这些改动**（`git add` 时排除 `upstream/`；CI 的 patch 门禁会拦截误提交）；
- 改官方文件 = 改 `patches/` 里的补丁（`revert` → 改 `upstream/` 文件 → `git diff --directory` 重新生成该补丁 → `apply`）；
- 新文件一律进 `extensions/`。
