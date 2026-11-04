#!/usr/bin/env node
/**
 * 补丁序列管理：把 patches/*.patch 按序应用到 upstream/（官方源，git 提交永远保持原样）。
 *
 * 用法：node scripts/patches.mjs apply | revert | status | check
 *   apply   应用所有未应用的补丁（已应用的跳过），首个失败即停
 *   revert  按逆序还原所有已应用的补丁
 *   status  列出每个补丁的状态：applied / not applied / broken
 *   check   门禁：upstream/ 提交纯净（与官方基线树一致）且每个补丁「可应用或已应用」，
 *           任何一项不满足退出码 1（CI 用；需要能解析 upstream/main，见 UPGRADE.md）
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UPSTREAM_REF = 'upstream/main'
const PATCHES = readdirSync(join(REPO, 'patches')).filter(n => n.endsWith('.patch')).sort()

const git = (args, options = {}) => {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8', ...options })
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') }
}
const tryApply = (name, reverse, checkOnly) =>
  git(['apply', ...(reverse ? ['-R'] : []), ...(checkOnly ? ['--check'] : []), '--directory=upstream', join('patches', name)]).ok
const state = name => tryApply(name, true, true) ? 'applied' : tryApply(name, false, true) ? 'not applied' : 'broken'

const [command] = process.argv.slice(2)
if (!PATCHES.length) { console.error('patches/ 下没有 *.patch'); process.exit(1) }

if (command === 'status') {
  for (const name of PATCHES) console.log(`${state(name).padEnd(12)} ${name}`)
  process.exit(PATCHES.some(n => state(n) === 'broken') ? 1 : 0)
}

if (command === 'apply') {
  for (const name of PATCHES) {
    if (state(name) === 'applied') { console.log(`已应用，跳过   ${name}`); continue }
    if (!tryApply(name, false, false)) { console.error(`✗ 应用失败     ${name}（先 node scripts/patches.mjs status 查看状态）`); process.exit(1) }
    console.log(`✓ 已应用       ${name}`)
  }
  console.log('补丁已全部应用；提交时请勿提交 upstream/ 的改动（git 里官方文件永远原样）。')
}

else if (command === 'revert') {
  for (const name of [...PATCHES].reverse()) {
    if (state(name) !== 'applied') { console.log(`未应用，跳过   ${name}`); continue }
    if (!tryApply(name, true, false)) { console.error(`✗ 还原失败     ${name}`); process.exit(1) }
    console.log(`✓ 已还原       ${name}`)
  }
}

else if (command === 'check') {
  const problems = []
  const official = git(['rev-parse', `${UPSTREAM_REF}^{tree}`])
  const imported = git(['rev-parse', 'HEAD:upstream'])
  if (!official.ok || !imported.ok) {
    console.error(`无法解析 ${UPSTREAM_REF} 或 HEAD:upstream——请先配置官方远端：\n  git remote add upstream https://github.com/deepseek-ai/dsh-superagent-prototype.git && git fetch upstream`)
    process.exit(1)
  }
  if (official.out.trim() !== imported.out.trim())
    problems.push(`upstream/ 的提交不纯净：与官方基线树不一致（${official.out.trim()} != ${imported.out.trim()}）。若有未提交改动请先还原（node scripts/patches.mjs revert）；若已误提交，请从提交中移除。`)
  for (const name of PATCHES) {
    const s = state(name)
    if (s === 'broken') problems.push(`补丁失效：${name}（上游演进导致无法应用，需人工重写，见 UPGRADE.md）`)
    else console.log(`${s.padEnd(12)} ${name}`)
  }
  if (problems.length) { for (const p of problems) console.error(`✗ ${p}`); process.exit(1) }
  console.log(`patch gate: OK（${PATCHES.length} 个补丁，upstream/ 提交纯净）`)
}

else { console.error('用法：node scripts/patches.mjs apply | revert | status | check'); process.exit(1) }
