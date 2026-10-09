/**
 * dsh-bushaoxin host entry.
 *
 * 三块，主体是文风层：
 *
 *  0. 文风层（**插件初衷**，默认开）—— 把"不烧心"梗写进系统提示，
 *     让助手回复**生成时**就是这个风格。这是唯一真正有效的路：
 *     assistant/message 是 append 之后的通知事件、客户端在流式帧上就渲染完了，
 *     所以事后改写助手回复做不到（详见 lib/drama.js 顶部）。
 *     强度用 config.styleLevel = 关|轻|中|重，config.toneHook=false 可直接关。
 *
 *  1. 短剧改写引擎（新增）—— 把任意文本拧成「老实商家 vs 黑心竞品」短剧：
 *       tool bushaoxin_rewrite         模型可调，带旋钮
 *       tool bushaoxin_drama           给主题排分幕骨架
 *       cmd  /bushaoxin_rewrite        人来拧，支持 preset=/slots=/density=/flip=/seed=
 *       cmd  /bushaoxin_drama          人来排剧本
 *
 *  2. 门诊部与供应链审计（原有）——
 *       GET /dsh-bushaoxin/report       JSON
 *       GET /dsh-bushaoxin/report.html  独立报告页
 *       GET /dsh-bushaoxin/heartbeat   给客户端挂件的心跳 JSON
 *       GET /dsh-bushaoxin/diagnosis   当日完整病历
 *       POST 无                        —— 任何写方法一律 405
 *       tool bushaoxin_check           模型可以自己来挂号
 *       cmd  /bushaoxin                人可以自己来复诊
 *
 * 梗层只观察、只输出文字：不改工具参数、不拦执行、不写任何 profile，
 * 也不给任何真实医疗建议（免责声明在 lib/meme.js 里）。
 * 改写输出末尾永远附一行真实技术结论，不可关闭。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { auditAll } from './audit.js'
import { renderReportHtml } from './report-html.js'
import {
  HOOK_LINE,
  NS,
  categoryOf,
  detectRepeat,
  digestOf,
  emptyLog,
  hashString,
  heartburnOf,
  indexOf,
  lesionOf,
  reportOf,
} from './meme.js'
import { PRESETS, STYLE_LEVELS, demoOutput, drama, normalizeStyleLevel, rewrite, styleDirective } from './drama.js'
import { renderDemoHtml } from './demo-html.js'

export const name = 'dsh-bushaoxin'

const CACHE_TTL_MS = 10_000
/** 单个会话的记忆预算：超了从最旧开始扔，门诊部不能变成内存泄漏。 */
const MAX_SESSIONS = 64
const MAX_LINES = 12
/** 连续第几次"摸同一个地方"开始记为复诊。 */
const REPEAT_THRESHOLD = 3
const TOOL_NAME = 'bushaoxin_check'
const REWRITE_TOOL = 'bushaoxin_rewrite'
const DRAMA_TOOL = 'bushaoxin_drama'
const STYLE_TOOL = 'bushaoxin_style'
const COMMAND_NAME = 'bushaoxin'
const REWRITE_COMMAND = 'bushaoxin_rewrite'
const DRAMA_COMMAND = 'bushaoxin_drama'
const STYLE_COMMAND = 'bushaoxin_style'

/** 滑动条的位置 → 强度名。UI 用连续滑条，内部仍是四档语义，不搞两套真相。 */
const LEVEL_BY_SLIDER = ['关', '轻', '中', '重']

function styleLevelFromSlider(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  const index = Math.min(LEVEL_BY_SLIDER.length - 1, Math.max(0, Math.round(number)))
  return LEVEL_BY_SLIDER[index]
}

function sendEmpty(response, status) {
  response.writeHead(status, { 'content-length': 0 })
  response.end()
}

/** 读一小段请求体。滑条只发几十字节，超过上限就直接拒，不给内存攻击留口子。 */
function readJsonBody(request, limit = 16 * 1024) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        resolve({ error: 'payload too large' })
        try { request.destroy() } catch { /* 已经断了就算了 */ }
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') return resolve({ value: {} })
      try {
        return resolve({ value: JSON.parse(text) })
      } catch {
        return resolve({ error: 'invalid json' })
      }
    })
    request.on('error', () => resolve({ error: 'read failed' }))
  })
}

function resolveDshHome(config) {
  if (typeof config?.dshHome === 'string' && config.dshHome.trim() !== '') return config.dshHome.trim()
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return join(homedir(), '.dsh')
}

/** 极短指纹：只用来判断"是不是同一个动作"，不保存参数内容本身。 */
export function fingerprintOf(toolName, args) {
  let shape = ''
  try {
    shape = JSON.stringify(args ?? null)
  } catch {
    shape = '[unserializable]'
  }
  if (shape.length > 512) shape = shape.slice(0, 512)
  return `${toolName}#${hashString(shape)}`
}

/* ------------------------------------------------------------ 病历累加器（纯逻辑） */

export function createClinic(options = {}) {
  const sessions = new Map()
  const threshold = options.repeatThreshold ?? REPEAT_THRESHOLD
  const maxSessions = options.maxSessions ?? MAX_SESSIONS

  const resolve = (sessionId) => {
    const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : 'anonymous'
    let log = sessions.get(key)
    if (log === undefined) {
      log = emptyLog(key)
      sessions.set(key, log)
      // Map 保持插入顺序：第一个就是最旧的那个诊室。
      while (sessions.size > maxSessions) {
        const oldest = sessions.keys().next()
        if (oldest.done) break
        sessions.delete(oldest.value)
      }
    }
    return log
  }

  const fill = (line) => ({
    at: new Date().toISOString(),
    tool: line.tool,
    category: line.category,
    lesion: line.lesion,
  })

  return {
    /** 观察一次工具调用。永远不抛：梗坏了不能把活干坏了。 */
    observe(input) {
      if (options.enabled === false) return null
      try {
        const toolName = typeof input?.name === 'string' ? input.name : ''
        if (toolName === '' || toolName === TOOL_NAME) return null
        const sessionId = input?.agent?.id ?? input?.sessionId ?? 'anonymous'
        const log = resolve(sessionId)
        const category = categoryOf(toolName)
        const lesion = lesionOf(toolName, input?.arguments)
        const repeat = detectRepeat(log, toolName, fingerprintOf(toolName, input?.arguments), threshold)

        log.total += 1
        log.byCategory[category] = (log.byCategory[category] ?? 0) + 1
        log.lastLines.push(fill({ tool: toolName, category, lesion }))
        if (log.lastLines.length > MAX_LINES) log.lastLines.splice(0, log.lastLines.length - MAX_LINES)
        if (repeat !== null) log.repeats.push({ at: new Date().toISOString(), tool: toolName, lesion, meme: repeat })
        return repeat
      } catch {
        return null
      }
    },

    /** 记一次"反酸"（工具报错）。 */
    sour(input) {
      if (options.enabled === false) return
      try {
        const sessionId = input?.agent?.id ?? input?.sessionId ?? 'anonymous'
        const log = resolve(sessionId)
        log.errors += 1
      } catch {
        // 记不上就算了。
      }
    },

    /** 取一份当日病历。 */
    report(sessionId, now = new Date()) {
      return reportOf(resolve(sessionId), { now })
    },

    /** 给挂件的心跳：短、能轮询。 */
    heartbeat(sessionId, now = new Date()) {
      const report = reportOf(resolve(sessionId), { now })
      return {
        namespace: NS,
        index: report.index,
        tone: report.tone,
        visit: report.visit,
        visitLabel: report.visitLabel,
        digest: digestOf(report),
        dish: report.prescription[0] ?? '',
        total: report.total,
        repeats: report.repeatsCount,
        errors: report.errors,
        generatedAt: report.generatedAt,
      }
    },

    size() {
      return sessions.size
    },

    reset() {
      sessions.clear()
    },
  }
}

/* ------------------------------------------------------------ HTTP 工具 */

function sendJson(response, status, body) {
  const payload = JSON.stringify(body, null, 2)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(html),
  })
  response.end(html)
}

/* ------------------------------------------------------------ 病历工具定义 */

/** 工具的输出渲染：模型看到的正文就是这些文本行。 */
export function renderDigest(value) {
  if (value === null || typeof value !== 'object') return [{ type: 'text', text: String(value ?? '') }]
  if (typeof value.error === 'string') return [{ type: 'text', text: `不烧心门诊部：${value.error}` }]
  const lines = [
    `不烧心门诊部 · ${value.visitLabel ?? '今日门诊'} · 烧心指数 ${value.index ?? 0}/100（${value.grade ?? '—'}）`,
    `主诉：${value.complain ?? '—'}`,
    `镜检所见：${(value.findings ?? []).join('；') || '—'}`,
    `诊断：${(value.diagnoses ?? []).join('；') || '—'}`,
    `处方：${(value.prescription ?? []).join(' ／ ') || '—'}`,
    `医嘱：${value.kicker ?? '—'}`,
    '本工具纯属整活，不构成任何医疗建议。用户若真有不适，请提示其就医。',
  ]
  return [{ type: 'text', text: lines.join('\n') }]
}

export function toolDefinition(clinic, sessionIdOf) {
  return {
    name: TOOL_NAME,
    description:
      '挂一个"不烧心"门诊号：读取本次会话的工具调用记录，生成一份段子式的胃镜报告' +
      '（烧心指数 0-100、主诉、镜检所见、诊断、处方、医嘱）。' +
      '当用户提到烧心/反酸/上火/胃，或你已经在同一件事上反复折腾三次以上时调用。' +
      '它只读不写，纯属玩笑，不得作为真实医疗建议。',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: '可选：为什么来挂号（例如"连续改了 5 遍同一个文件"）。只用于记录，不影响诊断。',
        },
      },
      required: [],
    },
    output: {
      schema: { type: 'object' },
      render: (args, value) => renderDigest(value),
    },
    async execute(args, exec) {
      const sessionId = sessionIdOf(exec) ?? 'anonymous'
      const now = new Date()
      const report = clinic.report(sessionId, now)
      const reason = typeof args?.reason === 'string' ? args.reason.trim() : ''
      return {
        ...report,
        reason,
        ...(reason === '' ? {} : { audit: `挂号理由：${reason}` }),
      }
    },
  }
}

/* ------------------------------------------------------------ 改写引擎工具（三期） */

/** 三期的默认旋钮：profile 里 config.defaults 可以整体覆盖。 */
function dramaDefaults(config) {
  const raw = config?.defaults
  return raw !== null && typeof raw === 'object' ? raw : {}
}

/** 把工具收到的一堆松垮旋钮收敛一下，只留下认识的键。 */
function knobsFromArgs(args) {
  const out = {}
  for (const key of ['preset', 'slots', 'density', 'flip', 'seed']) {
    if (args?.[key] !== undefined && args?.[key] !== null) out[key] = args[key]
  }
  return out
}

function renderScript(value) {
  if (value === null || typeof value !== 'object') return [{ type: 'text', text: String(value ?? '') }]
  if (typeof value.error === 'string') return [{ type: 'text', text: `不烧心：${value.error}` }]
  return [{ type: 'text', text: String(value.script ?? '') }]
}

export function rewriteToolDefinition(defaults = {}) {
  return {
    name: REWRITE_TOOL,
    description:
      '把一段文本改写成「不烧心」网络梗风格的短剧对白（老实商家涨价卖得贵 vs 黑心竞品低价抢客、' +
      '最后翻车的固定套路）。用户要求整活、玩梗、把报错/审查意见/提交信息"不烧心一下"时调用。' +
      '旋钮：preset（微辣/中辣/特辣/变态辣/干辣）、slots(1-4 讲几幕)、density(0-100 招牌台词密度，0 就是完全不出现)、' +
      'flip（自嘲/顾客复购/黑心店反扑/无）、seed（换种子可以换一批台词而不改骨架）。' +
      '输出末尾永远附一行真实技术结论，不要删掉它，也不要把它也算成段子。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要改写的原文，例如一段报错、一条审查意见、一个 commit message。' },
        preset: { type: 'string', enum: Object.keys(PRESETS), description: '预设档位，等价于一组合适的旋钮。' },
        slots: { type: 'integer', description: '讲几幕：1 只有招牌台词，2 加上黑心竞品，3 再加翻车，4 再加护规与翻转。' },
        density: { type: 'integer', description: '招牌台词密度 0-100。0 = 干辣，一次都不说。' },
        flip: { type: 'string', enum: ['自嘲', '顾客复购', '黑心店反扑', '无'], description: '收尾往哪儿拐。' },
        seed: { type: 'integer', description: '换一批台词但不改骨架。同一个 (文本, 旋钮) 永远得到同一份输出。' },
      },
      required: ['text'],
    },
    output: { schema: { type: 'object' }, render: (args, value) => renderScript(value) },
    async execute(args) {
      const text = typeof args?.text === 'string' ? args.text : ''
      if (text.trim() === '') return { error: '没给原文。把要整活的那段文本放进 text。' }
      return rewrite(text, knobsFromArgs(args), { defaults })
    },
  }
}

export function dramaToolDefinition(defaults = {}) {
  return {
    name: DRAMA_TOOL,
    description:
      '给一个主题，生成一份「不烧心」短剧剧本骨架（角色表 + 分幕 + 旁白 + 尾注）。' +
      '用户说"帮我写个不烧心剧本""把这个主题排成一出戏"时调用。' +
      '旋钮与 bushaoxin_rewrite 相同。末尾同样附一行真实技术结论。',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '主题，例如"升级依赖""写单元测试""重构这个函数"。' },
        preset: { type: 'string', enum: Object.keys(PRESETS), description: '预设档位。' },
        slots: { type: 'integer', description: '几幕（1-4）。' },
        density: { type: 'integer', description: '招牌台词密度 0-100。' },
        flip: { type: 'string', enum: ['自嘲', '顾客复购', '黑心店反扑', '无'], description: '收尾往哪儿拐。' },
        seed: { type: 'integer', description: '换种子换台词。' },
      },
      required: ['topic'],
    },
    output: { schema: { type: 'object' }, render: (args, value) => renderScript(value) },
    async execute(args) {
      const topic = typeof args?.topic === 'string' ? args.topic : ''
      if (topic.trim() === '') return { error: '没给主题。把想排成戏的主题放进 topic。' }
      return drama(topic, knobsFromArgs(args), { defaults })
    },
  }
}

/* ------------------------------------------------------------ 入口 */

export function apply(ctx, config) {
  if (config?.enabled === false) return

  const clinic = createClinic({
    enabled: config?.enabled !== false,
    repeatThreshold: typeof config?.repeatThreshold === 'number' ? config.repeatThreshold : REPEAT_THRESHOLD,
    maxSessions: typeof config?.maxSessions === 'number' ? config.maxSessions : MAX_SESSIONS,
  })

  const sessionIdOf = (subject) => {
    const candidate = subject?.agent?.id ?? subject?.session?.id
    return typeof candidate === 'string' && candidate !== '' ? candidate : undefined
  }
  /** 会话键：所有按会话存的东西（门诊部、辣度）都用它，保证不会一处一个 key。 */
  const sessionKeyOf = (subjectOrId) => {
    if (typeof subjectOrId === 'string') return subjectOrId !== '' ? subjectOrId : 'anonymous'
    return sessionIdOf(subjectOrId) ?? 'anonymous'
  }

  /* --- 观察层：只读事件，绝不改变任何执行结果 --- */

  const listensTools = typeof config?.observeTools !== 'boolean' ? true : config.observeTools
  if (listensTools && typeof ctx.on === 'function') {
    ctx.on('tools/execute', (exec, next) => {
      try {
        clinic.observe({ name: exec?.name, arguments: exec?.arguments, agent: exec?.agent })
      } catch {
        // 观察失败不影响执行。
      }
      return next()
    })
  }

  if (listensTools && typeof ctx.on === 'function') {
    ctx.on('agent/error', (payload) => {
      clinic.sour({ agent: payload?.agent })
    })
  }

  /* --- 工具：模型自己来挂号 --- */

  /* --- 工具：模型自己来挂号 / 自己来改写 --- */

  if (typeof ctx.inject === 'function' && config?.tool !== false) {
    const defaults = dramaDefaults(config)
    ctx.inject(['tools'], (host) => {
      host.effect(() => host.tools.register(toolDefinition(clinic, sessionIdOf)), 'dsh-bushaoxin: 门诊工具')
      host.effect(() => host.tools.register(rewriteToolDefinition(defaults)), 'dsh-bushaoxin: 改写工具')
      host.effect(() => host.tools.register(dramaToolDefinition(defaults)), 'dsh-bushaoxin: 剧本工具')
    })
  }

  /* --- 命令：人来复诊 --- */

  if (typeof ctx.inject === 'function' && config?.command !== false) {
    ctx.inject(['commands'], (host) => {
      host.effect(() => host.commands.register({
        name: COMMAND_NAME,
        description: '不烧心门诊部：当前烧心指数与处方（/bushaoxin）',
        handler: (invocation) => {
          const sessionId = sessionIdOf(invocation) ?? 'anonymous'
          const report = clinic.report(sessionId)
          const body = [
            `不烧心门诊部 · ${report.visitLabel} · 烧心指数 ${report.index}/100（${report.grade}）`,
            `${report.gradeLabel}`,
            `主诉：${report.complain}`,
            `诊断：${report.diagnoses.join('；')}`,
            `处方：${report.prescription.join(' ／ ')}`,
            `医嘱：${report.kicker}`,
            '',
            '（本命令纯属整活，不构成医疗建议。）',
          ].join('\n')
          return { kind: 'success', text: body }
        },
      }), 'dsh-bushaoxin: 门诊命令')

      host.effect(() => host.commands.register({
        name: STYLE_COMMAND,
        description: '不烧心文风：不带参数看当前注入的文风正文；带参数（关|轻|中|重）当场改这一段的辣度',
        handler: (invocation) => {
          const asked = String(invocation?.args ?? invocation?.argument ?? invocation?.input ?? '').trim()
          const sessionId = sessionIdOf(invocation)
          const current = styleLevelOf(sessionId)
          // 给了参数就是"选辣度"，不只是预览 —— 用户在对话里要有能自己动手的开关。
          const applied = asked === '' ? current : setStyleLevelOf(sessionId, asked)
          const changed = asked !== '' && applied !== current
          const body = [
            `不烧心文风 · 这一段现在用「${applied}」${changed ? `（刚从「${current}」改过来）` : ''}`,
            `配置默认「${defaultLevel}」 · 开关 toneHook=${config?.toneHook === false ? 'false（已关）' : 'true（默认开）'}`,
            STYLE_LEVELS[applied].note,
            '',
            '以下是**此刻写进系统提示**的正文（助手在生成前就收到它，所以回复从一开始就是那个风格）：',
            '',
            ...styleDirective(applied).split('\n').map((line) => line === '' ? '' : `  │ ${line}`),
            '',
            '—— 只改说话方式：不写角色对白、不加旁白、不许复读原台词、梗后必须跟真实技术结论。',
            '—— 要剧本请用 /bushaoxin_rewrite 或 /bushaoxin_drama 显式产出。',
          ].join('\n')
          return { kind: 'success', text: body }
        },
      }), 'dsh-bushaoxin: 文风命令')

      const defaults = dramaDefaults(config)
      const parseArgs = (raw) => {
        const text = String(raw ?? '').trim()
        if (text === '') return { knobs: {}, rest: '' }
        const tokens = text.split(/\s+/)
        const knobs = {}
        const rest = []
        for (const token of tokens) {
          const at = token.indexOf('=')
          if (at <= 0) {
            rest.push(token)
            continue
          }
          const key = token.slice(0, at)
          const value = token.slice(at + 1)
          if (['preset', 'slots', 'density', 'flip', 'seed'].includes(key)) knobs[key] = value
          else rest.push(token)
        }
        return { knobs, rest: rest.join(' ') }
      }

      host.effect(() => host.commands.register({
        name: REWRITE_COMMAND,
        description: '不烧心改写：把一段文本拧成短剧。用法 /bushaoxin_rewrite [preset=特辣] [slots=3] [density=60] [flip=自嘲] [seed=7] 原文',
        handler: (invocation) => {
          const args = parseArgs(invocation?.args ?? invocation?.argument ?? invocation?.input ?? '')
          const source = args.rest.trim() === '' ? String(invocation?.selection ?? '').trim() : args.rest
          if (source === '') {
            return {
              kind: 'error',
              text: [
                '用法：/bushaoxin_rewrite [旋钮...] <原文>',
                `旋钮：preset=${Object.keys(PRESETS).join('|')}  slots=1-4  density=0-100  flip=自嘲|顾客复购|黑心店反扑|无  seed=整数`,
                '例：/bushaoxin_rewrite preset=干辣 FAIL test/parser.test.ts ✕ 解析器 应忽略行尾注释',
              ].join('\n'),
            }
          }
          const result = rewrite(source, args.knobs, { defaults })
          return { kind: 'success', text: result.script }
        },
      }), 'dsh-bushaoxin: 改写命令')

      host.effect(() => host.commands.register({
        name: DRAMA_COMMAND,
        description: '不烧心剧本：给一个主题排出分幕骨架。用法 /bushaoxin_drama [旋钮...] <主题>',
        handler: (invocation) => {
          const args = parseArgs(invocation?.args ?? invocation?.argument ?? invocation?.input ?? '')
          const topic = args.rest.trim()
          if (topic === '') return { kind: 'error', text: '用法：/bushaoxin_drama [旋钮...] <主题>，例如 /bushaoxin_drama 升级依赖' }
          const result = drama(topic, args.knobs, { defaults })
          return { kind: 'success', text: result.script }
        },
      }), 'dsh-bushaoxin: 剧本命令')
    })
  }

  /* --- 文风层（本插件的主体）：默认开，因为它就是插件的初衷 ---
   *
   * 这是唯一能真正"改对话风格"的机制：文风在**生成前**写进系统提示，
   * 所以助手的回复从一开始就是那个风格。事后改写做不到（见 lib/drama.js 顶部说明）。
   */

  const defaultLevel = normalizeStyleLevel(config?.styleLevel)
  const toneOn = config?.toneHook !== false

  /* 会话内选辣度：人在对话里说「用重辣回答」，就当场改这一段的强度。
   * 存最近若干个会话，超了从最旧的扔 —— 和门诊部同一套纪律，不能变成内存泄漏。 */
  const styleBySession = new Map()
  const MAX_STYLE_SESSIONS = 64
  const styleLevelOf = (sessionId) => {
    const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : 'anonymous'
    return styleBySession.get(key) ?? defaultLevel
  }
  const setStyleLevelOf = (sessionId, level) => {
    const key = typeof sessionId === 'string' && sessionId !== '' ? sessionId : 'anonymous'
    const normalized = normalizeStyleLevel(level)
    styleBySession.set(key, normalized)
    while (styleBySession.size > MAX_STYLE_SESSIONS) {
      const oldest = styleBySession.keys().next()
      if (oldest.done) break
      styleBySession.delete(oldest.value)
    }
    return normalized
  }

  if (toneOn && typeof ctx.inject === 'function') {
    ctx.inject(['systemPrompt'], (host) => {
      host.effect(() => {
        // 文风层是默认开的，所以这条路径必须容错：
        // 宿主没提供 systemPrompt.section 时安静降级，绝不让整插件加载失败。
        try {
          if (typeof host?.systemPrompt?.section !== 'function') return undefined
          return host.systemPrompt.section({
            name: 'dsh-bushaoxin-tone',
            order: 60,
            // 注意：这里的强度是"配置默认值"。用户在会话里选的辣度走 bushaoxin_style 工具，
            // 由模型在当轮回复里执行 —— 因为系统提示的 section 内容不支持热替换。
            text: [HOOK_LINE, '', styleDirective(defaultLevel)].join('\n'),
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (host?.logger?.warn) host.logger.warn(`[dsh-bushaoxin] 文风层注册失败，已跳过: ${message}`)
          return undefined
        }
      }, 'dsh-bushaoxin: 文风层')
    })
  }

  /* --- 工具：让"我主动选辣度"这件事有个正式入口 --- */

  if (typeof ctx.inject === 'function' && config?.tool !== false) {
    ctx.inject(['tools'], (host) => {
      host.effect(() => host.tools.register({
        name: STYLE_TOOL,
        description:
          '设置「不烧心」文风强度，只影响对话风格，不影响任何技术判断。' +
          '当用户说"我要选辣度""用重辣回答""这段正经点说""关掉这个梗"时调用。' +
          '强度：关（完全不用梗）/ 轻（最多一次，克制）/ 中（技术话题平均每两三轮一次）/ 重（基本每轮都带，最多两次）。' +
          '调用之后，当轮回复就按所选强度来，并在开头用一句话确认。',
        parameters: {
          type: 'object',
          properties: {
            level: { type: 'string', enum: Object.keys(STYLE_LEVELS), description: '想要的强度。' },
          },
          required: ['level'],
        },
        output: {
          schema: { type: 'object' },
          render: (args, value) => [{ type: 'text', text: String(value?.message ?? '') }],
        },
        async execute(args, exec) {
          const asked = typeof args?.level === 'string' ? args.level : ''
          if (!Object.prototype.hasOwnProperty.call(STYLE_LEVELS, asked)) {
            return { message: `不烧心：认不出强度「${asked}」。可选：${Object.keys(STYLE_LEVELS).join(' / ')}。` }
          }
          const applied = setStyleLevelOf(sessionIdOf(exec), asked)
          const note = STYLE_LEVELS[applied].note
          return {
            level: applied,
            note,
            message: `不烧心文风已切到「${applied}」：${note}本轮回复就按这个强度来。`,
          }
        },
      }), 'dsh-bushaoxin: 选辣度工具')
    })
  }

  /* --- HTTP：心跳 + 病历 + 原有审计报告 --- */

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (host) => {
      const dshHome = resolveDshHome(config)
      let cache = null

      const audit = () => {
        const now = Date.now()
        if (cache !== null && now - cache.at < CACHE_TTL_MS) return cache.value
        const value = auditAll(dshHome)
        cache = { at: now, value }
        return value
      }

      const guard = (handler, contentType) => async (request, response) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.writeHead(405, { allow: 'GET, HEAD' })
          response.end()
          return
        }
        try {
          const body = handler(request)
          if (contentType === 'json') sendJson(response, 200, body)
          else sendHtml(response, 200, body)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          // A failed scan is a report about the scan, never a crashed host.
          if (host.logger?.warn) host.logger.warn(`[dsh-bushaoxin] scan failed: ${message}`)
          if (contentType === 'json') sendJson(response, 500, { error: message })
          else sendHtml(response, 500, `<pre>${message.replace(/[<&]/g, '')}</pre>`)
        }
      }

      // 会话定位：心跳/病历按 URL 上的 ?session= 走，缺省就是匿名诊室。
      const sessionFromRequest = (request) => {
        const raw = typeof request?.url === 'string' ? request.url : ''
        const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''
        for (const pair of query.split('&')) {
          const [key, value = ''] = pair.split('=')
          if (key === 'session') {
            try {
              return decodeURIComponent(value) || 'anonymous'
            } catch {
              return 'anonymous'
            }
          }
        }
        return 'anonymous'
      }

      host.effect(() => {
        const routes = [
          { path: '/dsh-bushaoxin/heartbeat', kind: 'json', handler: (request) => clinic.heartbeat(sessionFromRequest(request)) },
          {
            path: '/dsh-bushaoxin/diagnosis',
            kind: 'json',
            handler: (request) => {
              const report = clinic.report(sessionFromRequest(request))
              return { ...report, digests: report.diagnoses }
            },
          },
          { path: '/dsh-bushaoxin/report', kind: 'json', handler: () => audit() },
          { path: '/dsh-bushaoxin/report.html', kind: 'html', handler: () => renderReportHtml(audit()) },
          // 演示页：给观众看的左右对比。每次请求重新算，保证和当前引擎一致。
          { path: '/dsh-bushaoxin/demo.html', kind: 'html', handler: () => renderDemoHtml(demoOutput()) },
          { path: '/dsh-bushaoxin/', kind: 'html', handler: () => renderReportHtml(audit()) },
        ]
        const disposers = []
        for (const route of routes) {
          const off = host.webServer.register({
            kind: 'exact',
            path: route.path,
            handler: guard((request) => route.handler(request), route.kind),
          })
          // The disposer contract is not guaranteed on every host: treat a
          // missing one as a no-op rather than leaving a route unretractable.
          if (typeof off === 'function') disposers.push(off)
        }

        // 滑条的读写口。**必须一个 handler 管两个方法**：
        // 同一路径注册两次的话，后注册的那个会顶掉前一个，GET 就再也读不到了。
        const styleBody = (sessionId, level) => ({
          session: sessionId,
          level,
          slider: LEVEL_BY_SLIDER.indexOf(level),
          stops: LEVEL_BY_SLIDER,
          defaultLevel,
          toneEnabled: toneOn,
          note: STYLE_LEVELS[level].note,
        })
        const offStyle = host.webServer.register({
          kind: 'exact',
          path: '/dsh-bushaoxin/style',
          handler: async (request, response) => {
            const sessionId = sessionFromRequest(request)
            if (request.method === 'GET' || request.method === 'HEAD') {
              sendJson(response, 200, styleBody(sessionId, styleLevelOf(sessionId)))
              return
            }
            if (request.method !== 'POST') {
              response.writeHead(405, { allow: 'GET, HEAD, POST' })
              response.end()
              return
            }
            const body = await readJsonBody(request)
            if (body.error !== undefined) {
              sendJson(response, 400, { error: body.error })
              return
            }
            const payload = body.value ?? {}
            const requested = payload.level !== undefined
              ? String(payload.level)
              : styleLevelFromSlider(payload.slider)
            if (requested === null || !Object.prototype.hasOwnProperty.call(STYLE_LEVELS, requested)) {
              sendJson(response, 400, { error: `unknown level: ${String(requested)}`, stops: LEVEL_BY_SLIDER })
              return
            }
            // 只改本会话：载荷里给的 session 优先于查询串，缺省落回 URL 上的会话。
            const target = typeof payload.session === 'string' && payload.session !== ''
              ? payload.session
              : sessionId
            sendJson(response, 200, styleBody(target, setStyleLevelOf(target, requested)))
          },
        })
        if (typeof offStyle === 'function') disposers.push(offStyle)
        return () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              // An already-disposed route is not an error worth surfacing.
            }
          }
        }
      }, 'dsh-bushaoxin: report routes')
    })
  }
}
