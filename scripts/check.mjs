#!/usr/bin/env node
/**
 * 自测入口：确保补丁已应用，然后在 upstream/（包根）里跑 pnpm check（类型检查 + 测试 + 构建）。
 * 补丁保持应用状态（常驻打入策略）；首次使用前请先在 upstream/ 里 pnpm install。
 */
import { spawnSync } from 'node:child_process'

const run = (file, args) => spawnSync(file, args, { stdio: 'inherit' }).status ?? 1

const applied = run('node', ['scripts/patches.mjs', 'apply'])
if (applied !== 0) process.exit(applied)
const code = run('pnpm', ['-C', 'upstream', 'check'])
if (code === 0) console.log('check 通过（补丁保持应用状态；git 提交时请勿提交 upstream/ 的改动）。')
process.exit(code)
