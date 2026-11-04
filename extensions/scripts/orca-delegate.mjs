#!/usr/bin/env node
/**
 * Orca 委派桥：把一次 codex / Claude Code 委派放进 Orca 的会话列表实时运行，回收最终答案。
 *
 * 输入：stdin 一行 JSON { prompt, cwd }；参数 --agent codex|claude [--timeout-ms N]（默认 600000）。
 * 输出：stdout 最后一行 JSON 信封：
 *   { ok: true, mode: 'orca', output, sessionPath, handle, worktree }
 *   { ok: true, mode: 'direct', output }        —— Orca 不可用时的直拉回退
 *   { ok: false, mode, error }
 * 进度信息走 stderr。取消（SIGTERM）：尽力让 Orca 侧会话留给人工接管后退出。
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const agent = args[args.indexOf('--agent') + 1]
const timeoutMs = Number(args[args.indexOf('--timeout-ms') + 1] ?? 600_000)
if (agent !== 'codex' && agent !== 'claude') { console.error('usage: orca-delegate.mjs --agent codex|claude [--timeout-ms N]'); process.exit(2) }

const input = await new Promise(resolve => { let s = ''; process.stdin.on('data', c => { s += c }); process.stdin.on('end', () => resolve(s)) })
const { prompt, cwd } = JSON.parse(input)
const log = (...a) => console.error('[orca-delegate]', ...a)
const orcaBin = process.env.ORCA_CLI_COMMAND || 'orca-ide'
const startedAt = Date.now()
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Orca CLI 与本机运行中的 App 走回环通信，机器级代理绝不能截它。 */
const orcaEnv = () => {
  const current = new Set((process.env.NO_PROXY ?? '').split(',').map(s => s.trim()).filter(Boolean))
  for (const entry of ['127.0.0.1', 'localhost', '::1']) current.add(entry)
  return { ...process.env, NO_PROXY: [...current].join(',') }
}

/** 跑一条 orca 命令并解析 --json 输出；失败抛带上下文的 Error。 */
function orca(argv, { timeout = 30_000 } = {}) {
  const r = spawnSync(orcaBin, [...argv, '--json'], { encoding: 'utf8', timeout, env: orcaEnv() })
  if (r.error || r.status !== 0) throw new Error(`${orcaBin} ${argv.join(' ')} failed (status=${String(r.status)} signal=${String(r.signal)} err=${String(r.error?.message)}): ${String(r.stderr ?? '').slice(0, 300)}`)
  let parsed
  try { parsed = JSON.parse(r.stdout) } catch (e) { throw new Error(`${orcaBin} ${argv.join(' ')} unparseable (stdout=${JSON.stringify(String(r.stdout ?? '').slice(0, 160))}): ${e.message}`) }
  if (parsed.ok === false) throw new Error(`${orcaBin} ${argv.join(' ')} reported: ${String(parsed.error ?? 'command failed')}`)
  return parsed.result ?? parsed
}
/** 尽力而为的 orca 调用（结果可忽略，如 repo set / terminal wait）。 */
const tryOrca = argv => { try { orca(argv); return true } catch (e) { log(String(e.message)); return false } }

/** —— 结果提取：读 CLI 侧会话记录的最终答复 —— */
const claudeProjectDir = target => join(homedir(), '.claude', 'projects', target.replace(/\//g, '-'))
function finalFromClaude(file) {
  let last = ''
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line === '') continue
    try {
      const e = JSON.parse(line)
      if (e.type === 'assistant' && Array.isArray(e.message?.content))
        last = e.message.content.filter(b => b.type === 'text').map(b => b.text).join('') || last
    } catch { /* 正在写的半行 */ }
  }
  return last
}
function finalFromCodex(file) {
  let last = ''
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line === '') continue
    try {
      const e = JSON.parse(line)
      const p = e.payload ?? {}
      if (p.type === 'message' && p.role === 'assistant' && Array.isArray(p.content))
        last = p.content.filter(b => b.type === 'output_text' || b.type === 'text').map(b => b.text).join('') || last
    } catch { /* 正在写的半行 */ }
  }
  return last
}
function newestFile(dir, sinceMs, recursive = false) {
  let best = null
  const visit = d => { for (const entry of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, entry.name)
    if (entry.isDirectory()) { if (recursive) visit(p); continue }
    const mtime = statSync(p).mtimeMs
    if (mtime >= sinceMs && (!best || mtime > best.mtime)) best = { path: p, mtime }
  } }
  if (existsSync(dir)) visit(dir)
  return best
}
const extract = () => agent === 'claude'
  ? (() => { const f = newestFile(claudeProjectDir(cwd), startedAt - 2_000); return f ? { sessionPath: f.path, output: finalFromClaude(f.path) } : null })()
  : (() => { const f = newestFile(join(homedir(), '.codex', 'sessions'), startedAt - 2_000, true); return f ? { sessionPath: f.path, output: finalFromCodex(f.path) } : null })()

/** —— Orca 路由 —— */
async function orcaRoute() {
  const remoteOf = dir => { const r = spawnSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null }
  const myRemote = remoteOf(cwd)
  const repos = orca(['repo', 'list']).repos ?? []
  const repo = repos.find(r => myRemote !== null && remoteOf(r.path) === myRemote)
  if (!repo) throw new Error(`no Orca repo shares origin ${myRemote ?? '(none)'} with ${cwd}`)
  const rowsOf = () => { const rows = orca(['worktree', 'list', '--repo', `id:${repo.id}`]); return Array.isArray(rows) ? rows : rows.worktrees ?? [] }
  let row = rowsOf().find(w => w.path === cwd)
  if (!row) { tryOrca(['repo', 'set', '--repo', `id:${repo.id}`, '--external-worktree-visibility', 'show']); row = rowsOf().find(w => w.path === cwd) }
  if (!row) throw new Error(`worktree ${cwd} not visible in Orca even after enabling external visibility`)
  const selector = row.id ?? `id:${repo.id}::${row.path}`
  log(`launching ${agent} in Orca worktree ${selector}`)
  const launched = orca(['agent', 'launch', '--agent', agent, '--worktree', selector, '--prompt', prompt])
  const outcome = launched.launch?.outcome ?? launched.outcome ?? {}
  const handle = outcome.handle ?? launched.agentTerminalHandle
  log(`launched: kind=${String(outcome.kind)} handle=${String(handle)}`)

  const deadline = startedAt + timeoutMs
  while (Date.now() < deadline) {
    if (handle && outcome.kind === 'terminal') tryOrca(['terminal', 'wait', '--terminal', handle, '--for', 'tui-idle', '--timeout-ms', '15000'])
    const found = extract()
    if (found && found.output.trim() !== '') {
      const before = statSync(found.sessionPath).mtimeMs
      await sleep(4_000)
      if (statSync(found.sessionPath).mtimeMs === before) return { ok: true, mode: 'orca', output: found.output, sessionPath: found.sessionPath, handle, worktree: selector }
    }
    await sleep(3_000)
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for the ${agent} session to settle`)
}

/** —— 直拉回退 —— */
function directRoute() {
  const spawned = agent === 'codex'
    ? spawn('codex', ['exec', '--cd', cwd, prompt], { stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn('claude', ['-p', prompt, '--output-format', 'json'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = '', err = ''
  spawned.stdout.on('data', c => { out += c })
  spawned.stderr.on('data', c => { err += c })
  const timer = setTimeout(() => spawned.kill('SIGTERM'), timeoutMs)
  return new Promise(resolve => spawned.on('close', code => {
    clearTimeout(timer)
    if (code !== 0) return resolve({ ok: false, mode: 'direct', error: `direct ${agent} exited ${code}: ${err.slice(-500)}` })
    let output = out.trim()
    if (agent === 'claude') { try { output = JSON.parse(out).result ?? output } catch { /* 保留原文 */ } }
    resolve({ ok: true, mode: 'direct', output })
  }))
}

process.on('SIGTERM', () => { log('cancelled; leaving any Orca session for human takeover'); process.exit(3) })

let envelope
try { envelope = await orcaRoute() }
catch (error) { log(`orca route failed (${error.message}); falling back to direct ${agent}`); envelope = await directRoute() }
process.stdout.write(JSON.stringify(envelope) + '\n')
process.exit(envelope.ok ? 0 : 1)
