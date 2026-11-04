/**
 * dsh-subagent-orca —— 把 superagent-bridge（Orca 多 agent worker）注册为 DSH 外部子代理提供方。
 *
 * 每条路由（claude/codex/dsh）注册一个独立提供方；worker 通过 subagent_orca_<tool> 工具委派任务。
 * start() 经 bridge.py dispatch 派发（Orca 中每 run 一个专属会话，实时可见），随后轮询
 * orchestration worker-read 的确定性状态（status.worker）取终态，最终答案取转录末尾的
 * assistant 文本，附工作区 HEAD SHA 证据。dispose()/取消映射为 bridge cancel（fence 语义）。
 *
 * 配置（profile patch 行的 config）：
 *   bridgePy    bridge.py 绝对路径（必填）
 *   configPath  bridge.config.json 路径（可选；经 BRIDGE_CONFIG 传给桥）
 *   approval    派发批准引用（默认「编排层代派」；工单 mandate 即授权）
 *   orcaExe     orca CLI 可执行名（默认 orca-ide；Linux 裸 orca 是读屏器，绝不可用）
 *   python      python 解释器（默认 python3）
 *   routes      [{provider, tool}] 路由表，默认 claude/codex/dsh 三条
 *   pollMs      完成轮询间隔（默认 8000）
 *   timeoutMs   单次委派总超时（默认 1800000，即 30 分钟）
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'

export const name = 'dsh-subagent-orca'
export const inject = ['subagents']

const NO_CAPABILITIES = { agentOptions: false, agentPreset: false, outputSchema: false, depthLimit: false }

export function apply(ctx, config) {
  const routes = Array.isArray(config?.routes) && config.routes.length ? config.routes : [
    { provider: 'orca-claude', tool: 'claude' },
    { provider: 'orca-codex', tool: 'codex' },
    { provider: 'orca-dsh', tool: 'dsh' },
  ]
  for (const route of routes) ctx.subagents.registerProvider(new OrcaRoute(config, route))
}

class OrcaRoute {
  constructor(config, route) {
    this.config = config ?? {}
    this.route = route
    this.name = route.provider
    this.capabilities = NO_CAPABILITIES
    this.inheritsParentContext = false
    this.counters = new Map()
  }

  async start(request) {
    const spec = (request.prompt ?? []).map(block => block?.text ?? '').filter(Boolean).join('\n').trim()
    if (!spec) throw new Error('dsh-subagent-orca: 需要非空文本任务')
    const ticket = sanitizeTicket(basename(request.cwd || 'dsh-ticket'))
    const taskRef = String((this.counters.get(ticket) ?? 0) + 1)
    this.counters.set(ticket, Number(taskRef))
    const cancelArgs = ['cancel', '--ticket', ticket, '--task-ref', taskRef]

    const dispatch = await this.bridge(['dispatch', '--ticket', ticket, '--task-ref', taskRef,
      '--tool', this.route.tool, '--spec', spec,
      '--approval', this.config.approval ?? 'dsh-superagent 工单授权（编排层代派）', '--no-wait'])
    if (!dispatch.ok) throw new Error(`dsh-subagent-orca: 桥派发失败 ${dispatch.error ?? ''}`)
    const dispatchId = dispatch.dispatchId
    if (!dispatchId) throw new Error('dsh-subagent-orca: 桥未返回 dispatchId')

    let cancelled = false
    const cancel = () => { if (!cancelled) { cancelled = true; void this.bridge(cancelArgs).catch(() => {}) } }
    request.signal.addEventListener('abort', cancel, { once: true })

    const result = (async () => {
      try {
        return await this.awaitOutcome(dispatchId, dispatch.worktree, cancel, () => cancelled)
      } finally {
        request.signal.removeEventListener('abort', cancel)
      }
    })()

    return { id: `orca-${randomUUID()}`, result, dispose: async () => { cancel(); await result.catch(() => {}) } }
  }

  /** 轮询 worker-read 的确定性状态直到终态；成功时附转录最终报告与工作区 HEAD 证据。超时自动经桥 cancel，避免孤儿 worker。 */
  async awaitOutcome(dispatchId, worktree, cancel, cancelled) {
    const pollMs = numberOr(this.config.pollMs, 8000)
    const timeoutMs = numberOr(this.config.timeoutMs, 1_800_000)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (cancelled()) return { output: [], stopReason: 'aborted' }
      await sleep(pollMs)
      let read
      try { read = await this.orca(['worker-read', '--dispatch', dispatchId]) } catch { continue }
      const status = read?.status ?? {}
      if (status.worker === 'succeeded') {
        const text = finalAssistantText(read?.transcript?.messages ?? [])
        const sha = await gitHead(worktree)
        const evidence = sha ? `\n\n[证据] Orca 工作区 ${worktree ?? ''} HEAD ${sha}` : ''
        if (!text && !sha) return { output: [], stopReason: 'error', diagnostic: 'worker succeeded 但无最终文本与证据' }
        return { output: [{ type: 'text', text: `${text ?? '(worker 未产出最终报告)'}${evidence}` }], stopReason: 'completed' }
      }
      if (status.terminal === 'exited') {
        const text = finalAssistantText(read?.transcript?.messages ?? [])
        return text
          ? { output: [{ type: 'text', text }], stopReason: 'error', diagnostic: `orca worker 终态 ${status.worker ?? 'unknown'}` }
          : { output: [], stopReason: 'error', diagnostic: `orca worker 终态 ${status.worker ?? 'unknown'}` }
      }
    }
    cancel()
    return { output: [], stopReason: 'error', diagnostic: `等待超时（${Math.round(timeoutMs / 60000)} 分钟），已自动经桥 cancel，可重试改派` }
  }

  bridge(args) {
    return runJson(this.config.python ?? 'python3', [this.config.bridgePy, ...args], this.env(), 180_000)
  }

  orca(args) {
    return runJson(this.config.orcaExe ?? 'orca-ide', ['orchestration', ...args, '--json'], this.env(), 60_000)
  }

  env() {
    const env = { ...process.env }
    // Orca CLI 与本机 App 走回环通信；机器级代理绝不能截它（只认大小写 NO_PROXY 的实现都要覆盖）。
    const loopback = ['127.0.0.1', 'localhost', '::1']
    for (const key of ['NO_PROXY', 'no_proxy']) {
      const current = new Set(String(env[key] ?? '').split(',').map(s => s.trim()).filter(Boolean))
      for (const entry of loopback) current.add(entry)
      env[key] = [...current].join(',')
    }
    if (this.config.configPath) env.BRIDGE_CONFIG = this.config.configPath
    return env
  }
}

const runJson = (command, args, env, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let stdout = '', stderr = ''
  const timer = setTimeout(() => { child.kill(); reject(new Error(`dsh-subagent-orca: ${args[0]} 超时`)) }, timeoutMs)
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.on('error', error => { clearTimeout(timer); reject(error) })
  child.on('close', () => {
    clearTimeout(timer)
    const parsed = lastJson(stdout)
    if (parsed) return resolve(parsed)
    reject(new Error(`dsh-subagent-orca: ${args[0]} 输出无法解析 ${snippet(stdout || stderr)}`))
  })
})

const lastJson = text => {
  const whole = text.trim()
  if (whole.startsWith('{')) { try { return JSON.parse(whole) } catch { /* 整体不是合法 JSON（日志混排），退回逐行 */ } }
  let found = null
  for (const line of whole.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try { found = JSON.parse(trimmed) } catch { /* 跳过不可解析行，保留最后一个可解析对象 */ }
  }
  return found
}

const finalAssistantText = messages => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const text = (message.blocks ?? []).filter(block => block?.type === 'text').map(block => block.text ?? '').join('').trim()
    if (text) return text
  }
  return null
}

const gitHead = async worktree => {
  if (!worktree) return null
  try { return await new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', worktree, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    let out = ''
    child.stdout.on('data', chunk => { out += chunk })
    child.on('error', reject)
    child.on('close', () => resolve(out.trim() || null))
  }) } catch { return null }
}

const sanitizeTicket = value => value.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'dsh-ticket'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const numberOr = (value, fallback) => Number.isFinite(value) ? value : fallback
const snippet = text => `「${String(text).slice(-200).trim()}」`
