/**
 * Self-test for dsh-bushaoxin.
 *
 * 两端都不需要真 host、不需要浏览器：
 *   - Host 半边套在一个假的 cordis context 上：喂几条工具调用进门诊部，
 *     然后直接调路由和工具，逐字检查病历、心跳、以及原有的供应链报告；
 *   - Client 半边用假的 `window.__ModuleLoader__` + 最小 react shim 求值，
 *     再拿 Host 刚产出的那份心跳 JSON 真渲染一遍——所以挂件里的错别字会在
 *     这里挂掉，而不是在用户输入框下面变成一片空白。
 *
 * Run: node test/selftest.mjs
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const failures = []
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// ---------------------------------------------------------------- 梗引擎（纯函数）

console.log('meme: 分类 / 复诊 / 指数')

const meme = await import(pathToFileURL(join(root, 'lib', 'meme.js')).href)

check('分类认得每一个自带工具类目',
  meme.categoryOf('read') === '看'
  && meme.categoryOf('grep') === '找'
  && meme.categoryOf('edit') === '写'
  && meme.categoryOf('pwsh') === '吃'
  && meme.categoryOf('subagent') === '分诊'
  && meme.categoryOf('ask_user_question') === '问')
check('没见过的工具落到"其他"，不抛错', meme.categoryOf('没见过这个工具') === '其他')

const dedupeState = { lastKey: '', lastTool: '', repeatStreak: 0 }
const first = meme.detectRepeat(dedupeState, 'read', 'read#1')
const second = meme.detectRepeat(dedupeState, 'read', 'read#1')
const third = meme.detectRepeat(dedupeState, 'read', 'read#1')
check('前两次同一个动作不当成复诊', first === null && second === null)
check('第三次开始才算复诊，并且真的吐出一句梗', third !== null && /连续第 3 次/.test(third), String(third))
check('换了动作就重新计数',
  meme.detectRepeat(dedupeState, 'read', 'read#2') === null)

const log = meme.emptyLog('session-fixed')
log.total = 4
log.byCategory = { 看: 4, 找: 0, 写: 0, 吃: 0, 分诊: 0, 问: 0, 其他: 0 }
const scoreA = meme.heartburnOf(log)
check('指数随调用量单调上升', meme.heartburnOf(meme.emptyLog('x')) < scoreA, `${scoreA}`)
check('指数封顶在 0-100',
  meme.indexOf(0) === 0 && meme.indexOf(100000) === 100, `${meme.indexOf(100000)}`)
check('分级与刻度一一对应',
  meme.gradeOf(0).grade === '0 级' && meme.gradeOf(100).grade === 'D 级')
check('六档忌口齐全', meme.DIET_PLAN.length === 6 && meme.DIET_PLAN[5].advice.includes('消化内科'))
check('会话号对同一 session 稳定',
  meme.visitNumberOf('session-fixed') === meme.visitNumberOf('session-fixed'))

// ---------------------------------------------------------------- Host 半边

console.log('host: apply() against a fake cordis context')

const { apply, createClinic, fingerprintOf } = await import(pathToFileURL(join(root, 'lib', 'index.js')).href)

const routes = new Map()
const logs = []
const injected = []
const tools = new Map()
const commands = new Map()
const sections = new Map()
const disposers = []

const host = {
  logger: { warn: (message) => logs.push(message) },
  effect(callback) {
    const dispose = callback()
    if (typeof dispose === 'function') disposers.push(dispose)
    return () => {}
  },
  webServer: {
    register(route) {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  },
  tools: {
    register(definition) {
      tools.set(definition.name, definition)
      return () => tools.delete(definition.name)
    },
  },
  commands: {
    register(definition) {
      commands.set(definition.name, definition)
      return () => commands.delete(definition.name)
    },
  },
  systemPrompt: {
    section(definition) {
      sections.set(definition.name, definition)
      return () => sections.delete(definition.name)
    },
  },
}

/**
 * 造一个假的 DSH home 当被测对象。
 *
 * 之前这里直接用 process.env.DSH_HOME（也就是本机真实的 ~/.dsh），
 * 于是「报告里有没有 profile」「有没有插件」这两条断言的通过与否
 * 取决于**这台机器装了什么** —— 本地绿、CI 红，测的是环境不是逻辑。
 *
 * 现在给一个确定性的 fixture：一个 profile、两个插件（属性正好相反）。
 */
const FIXTURE_HOME = mkdtempSync(join(tmpdir(), 'bushaoxin-selftest-'))

const writePlugin = (name, manifest) => {
  const dir = join(FIXTURE_HOME, 'profiles', 'fixture-profile', 'node_modules', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...manifest }, null, 2), 'utf8')
}

mkdirSync(join(FIXTURE_HOME, 'profiles', 'fixture-profile'), { recursive: true })
writeFileSync(
  join(FIXTURE_HOME, 'profiles', 'fixture-profile', 'package.json'),
  JSON.stringify({
    name: 'fixture-profile',
    private: true,
    dependencies: { 'fixture-clean': '1.0.0', 'fixture-postinstall': '2.0.0' },
  }, null, 2),
  'utf8',
)
// 一个干净的：没有安装期脚本
writePlugin('fixture-clean', { description: '一个干净的测试插件', license: 'MIT' })
// 一个要警惕的：声明了 postinstall
writePlugin('fixture-postinstall', {
  description: '一个带安装期脚本的测试插件',
  license: 'MIT',
  scripts: { postinstall: 'node ./setup.js' },
})

process.env.DSH_HOME = FIXTURE_HOME

const listeners = new Map()
const ctx = {
  inject(services, callback) {
    injected.push(services)
    callback(host)
  },
  on(eventName, listener) {
    const list = listeners.get(eventName) ?? []
    list.push(listener)
    listeners.set(eventName, list)
    return () => {}
  },
}

apply(ctx, { dshHome: FIXTURE_HOME })

const injectedServices = injected.flat()
check('injects the webServer service', injectedServices.includes('webServer'))
check('injects the tools service', injectedServices.includes('tools'))
check('injects the commands service', injectedServices.includes('commands'))
check('文风层默认开启（这是插件的初衷）', injectedServices.includes('systemPrompt'))
check('文风层注册进系统提示', sections.has('dsh-bushaoxin-tone'))
check('文风层明确禁止复读与编造',
  /不要照抄/.test(sections.get('dsh-bushaoxin-tone')?.text ?? '')
  && /编造技术事实/.test(sections.get('dsh-bushaoxin-tone')?.text ?? ''))
check('注册了改写与剧本两个工具',
  tools.has('bushaoxin_rewrite') && tools.has('bushaoxin_drama'))
check('注册了改写与剧本两个命令',
  commands.has('bushaoxin_rewrite') && commands.has('bushaoxin_drama'))
check('注册了选辣度工具与文风命令',
  tools.has('bushaoxin_style') && commands.has('bushaoxin_style'))
check('注册了演示页路由', routes.has('/dsh-bushaoxin/demo.html'))

// 「我主动选辣度」必须真的改状态，不能只是回一句话。
const styleTool = tools.get('bushaoxin_style')
const styleCmd = commands.get('bushaoxin_style')
const SESSION_STYLE = 'session-style-test'
const styleExec = { agent: { id: SESSION_STYLE } }
const levelOf = (sessionId) => {
  const text = styleCmd.handler({ agent: { id: sessionId }, args: '' }).text
  const match = text.match(/现在用「(.+?)」/)
  return match ? match[1] : ''
}

const applied = await styleTool.execute({ level: '重' }, styleExec)
check('选辣度工具确认了切换', applied?.level === '重' && /已切到「重」/.test(applied?.message ?? ''),
  JSON.stringify(applied))
check('选辣度之后同一会话看到的就是新强度', levelOf(SESSION_STYLE) === '重', levelOf(SESSION_STYLE))

const backToMid = await styleTool.execute({ level: '中' }, styleExec)
check('再选一次能改回来', backToMid?.level === '中' && levelOf(SESSION_STYLE) === '中')

const bogus = await styleTool.execute({ level: '变态不辣' }, styleExec)
check('认不出的强度不会改坏状态',
  /认不出/.test(bogus?.message ?? '') && levelOf(SESSION_STYLE) === '中', `level=${levelOf(SESSION_STYLE)}`)

const thirdSession = await styleTool.execute({ level: '关' }, { agent: { id: 'session-third' } })
check('不同会话的辣度互不干扰',
  levelOf('session-third') === '关' && levelOf(SESSION_STYLE) === '中' && thirdSession?.level === '关')

check('命令不带参数时不改强度', levelOf(SESSION_STYLE) === '中')
check('registers the JSON report route', routes.has('/dsh-bushaoxin/report'))
check('registers the HTML report route', routes.has('/dsh-bushaoxin/'))
check('registers the heartbeat route', routes.has('/dsh-bushaoxin/heartbeat'))
check('registers the diagnosis route', routes.has('/dsh-bushaoxin/diagnosis'))
check('registers no route that is not read-only', [...routes.keys()].every((path) => path.startsWith('/dsh-bushaoxin/')))
check('subscribes to the tool-call feed without wrapping it', listeners.has('tools/execute'))
check('subscribes to the error feed', listeners.has('agent/error'))

const call = async (path, method = 'GET', url = path) => {
  const response = {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(chunk) {
      if (chunk) this.body += chunk
    },
  }
  await routes.get(path).handler({ method, url }, response)
  return response
}

const inspectRoute = (path) => routes.get(path).handler({ method: 'GET', url: path }, {
  writeHead() {}, end() {},
})

check('心跳路由在空会话下也回答', typeof inspectRoute('/dsh-bushaoxin/heartbeat') === 'object')

// 会话号提前声明：下面的滑条断言和门诊断言都用它。
const SESSION = 'session-selftest'

/* --------------------------------------------- 滑条的宿主端：GET 读、POST 写 */

const sendRequest = (request) => {
  const response = {
    status: null, headers: null, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(chunk) { if (chunk) this.body += chunk },
  }
  const handler = routes.get('/dsh-bushaoxin/style').handler
  return Promise.resolve(handler(request, response)).then(() => response)
}

const jsonRequest = (method, body, url = '/dsh-bushaoxin/style') => ({
  method,
  url,
  on(event, listener) {
    if (event === 'data' && body !== undefined) listener(Buffer.from(JSON.stringify(body), 'utf8'))
    if (event === 'end') listener()
    return this
  },
  destroy() {},
})

const styleRead = await sendRequest({ method: 'GET', url: `/dsh-bushaoxin/style?session=${SESSION}` })
const styleReadBody = JSON.parse(styleRead.body)
check('滑条读端回答 200 且带四档刻度',
  styleRead.status === 200 && Array.isArray(styleReadBody.stops) && styleReadBody.stops.length === 4,
  styleRead.body.slice(0, 160))
check('滑条读端给出当前档位索引', typeof styleReadBody.slider === 'number')

const styleWrite = await sendRequest(jsonRequest('POST', { session: SESSION, slider: 3 }))
const styleWriteBody = JSON.parse(styleWrite.body)
check('滑条写端接受 slider 并落到「重」',
  styleWrite.status === 200 && styleWriteBody.level === '重' && styleWriteBody.slider === 3, styleWrite.body)

const styleBack = JSON.parse((await sendRequest({ method: 'GET', url: `/dsh-bushaoxin/style?session=${SESSION}` })).body)
check('写完之后读回来就是新档位', styleBack.level === '重', JSON.stringify(styleBack))

const styleZero = JSON.parse((await sendRequest(jsonRequest('POST', { session: SESSION, slider: 0 }))).body)
check('slider=0 就是「关」', styleZero.level === '关', JSON.stringify(styleZero))

const styleByLevel = JSON.parse((await sendRequest(jsonRequest('POST', { session: SESSION, level: '轻' }))).body)
check('也接受直接给 level 名', styleByLevel.level === '轻', JSON.stringify(styleByLevel))

const otherSession = JSON.parse((await sendRequest({ method: 'GET', url: '/dsh-bushaoxin/style?session=session-other' })).body)
check('别的会话不受影响，仍是默认档', otherSession.level === '中', JSON.stringify(otherSession))

const badLevel = await sendRequest(jsonRequest('POST', { session: SESSION, level: '变态不辣' }))
check('非法档位被拒 400', badLevel.status === 400, `${badLevel.status} ${badLevel.body}`)
const badSlider = await sendRequest(jsonRequest('POST', { session: SESSION, slider: '右' }))
check('非法 slider 被拒 400', badSlider.status === 400, `${badSlider.status} ${badSlider.body}`)
const notPost = await sendRequest({ method: 'DELETE', url: '/dsh-bushaoxin/style' })
check('写端只认 POST，其余 405', notPost.status === 405, String(notPost.status))
// 恢复默认，免得后面的用例被这次测试留下的状态影响。
await sendRequest(jsonRequest('POST', { session: SESSION, level: '中' }))


// 喂几条真实的工具调用进门诊部：三连读、一次改、一条命令。
const feed = (name, args, id = SESSION) => {
  for (const listener of listeners.get('tools/execute') ?? []) {
    listener({ name, arguments: args, agent: { id } }, () => Promise.resolve({ isError: false }))
  }
}

feed('read', { file_path: 'C:/work/a.js' })
feed('read', { file_path: 'C:/work/a.js' })
feed('read', { file_path: 'C:/work/a.js' })
feed('edit', { file_path: 'C:/work/a.js', old_string: 'a', new_string: 'b' })
feed('pwsh', { command: 'npm test', description: 'run the tests' })
check('同一动作只被记成一次复诊，不是三次',
  (listeners.get('tools/execute') ?? []).length === 1)

const heartbeatResponse = await call('/dsh-bushaoxin/heartbeat', 'GET', `/dsh-bushaoxin/heartbeat?session=${SESSION}`)
check('心跳路由回答 200', heartbeatResponse.status === 200, `got ${heartbeatResponse.status}`)
check('心跳是 JSON', String(heartbeatResponse.headers?.['content-type']).includes('application/json'))
const heartbeat = JSON.parse(heartbeatResponse.body)
check('心跳带上了这轮会话的进食次数', heartbeat.total === 5, `got ${heartbeat.total}`)
check('心跳数出了复诊次数', heartbeat.repeats === 1, `got ${heartbeat.repeats}`)
check('心跳给出了一个 0-100 的指数',
  Number.isInteger(heartbeat.index) && heartbeat.index >= 0 && heartbeat.index <= 100, `got ${heartbeat.index}`)
check('心跳给出了一句能显示的话', typeof heartbeat.digest === 'string' && heartbeat.digest.includes('不烧心'))
check('心跳带上了处方', typeof heartbeat.dish === 'string' && heartbeat.dish.length > 0)

const anonymousHeartbeat = JSON.parse((await call('/dsh-bushaoxin/heartbeat')).body)
check('没有 session 参数时回落到匿名诊室，不串号', anonymousHeartbeat.total === 0, `got ${anonymousHeartbeat.total}`)

const diagnosis = JSON.parse((await call('/dsh-bushaoxin/diagnosis', 'GET', `/dsh-bushaoxin/diagnosis?session=${SESSION}`)).body)
check('病历有主诉', typeof diagnosis.complain === 'string' && diagnosis.complain.length > 0)
check('病历有镜检所见', Array.isArray(diagnosis.findings) && diagnosis.findings.length > 0)
check('病历有诊断', diagnosis.diagnoses.some((line) => line.includes('复诊')))
check('病历有处方与医嘱', diagnosis.prescription.length >= 2 && typeof diagnosis.kicker === 'string')
check('病历挂着免责声明', typeof diagnosis.disclaimer === 'string' && diagnosis.disclaimer.includes('整活'))
check('病历保留了原始调用分布',
  diagnosis.byCategory['看'] === 3 && diagnosis.byCategory['写'] === 1 && diagnosis.byCategory['吃'] === 1,
  JSON.stringify(diagnosis.byCategory))

const rejected = await call('/dsh-bushaoxin/heartbeat', 'POST')
check('mutating methods are refused with 405', rejected.status === 405, `got ${rejected.status}`)

// ---------------------------------------------------------------- 门诊工具与命令

console.log('host: 门诊工具与命令')

const definition = tools.get('bushaoxin_check')
check('注册了 bushaoxin_check 工具', definition !== undefined)
check('工具描述了它自己只是个玩笑', definition.description.includes('不得作为真实医疗建议'))
check('工具带 output.render', definition.output && typeof definition.output.render === 'function')

const toolValue = await definition.execute({ reason: '连续改了 5 遍同一个文件' }, { agent: { id: SESSION } })
check('工具返回一份完整病历', toolValue.index >= 0 && toolValue.total === 5)
check('工具把挂号理由写进病历', toolValue.audit === '挂号理由：连续改了 5 遍同一个文件')

const renderedBlocks = definition.output.render({}, toolValue)
check('工具渲染出文本块', Array.isArray(renderedBlocks) && renderedBlocks[0].type === 'text')
check('工具正文里包含烧心指数与实际次数',
  renderedBlocks[0].text.includes('烧心指数') && renderedBlocks[0].text.includes(String(toolValue.index)))
check('工具正文里重复了一遍免责声明', renderedBlocks[0].text.includes('不构成任何医疗建议'))

const command = commands.get('bushaoxin')
check('注册了 /bushaoxin 命令', command !== undefined)
const commandResult = await command.handler({ agent: { id: SESSION }, rawInput: '', attachments: [], signal: new AbortController().signal })
check('命令回 success', commandResult.kind === 'success')
check('命令正文里指数和处方都在',
  commandResult.text.includes('烧心指数') && commandResult.text.includes('处方'))
check('命令正文里也有免责声明', commandResult.text.includes('不构成医疗建议'))

// 指纹：只用来判断"是不是同一个动作"，不能把整份参数存下来。
const bigFingerprint = fingerprintOf('write', { file_path: 'x', content: 'A'.repeat(5000) })
check('指纹是定长的，不保存参数原文', bigFingerprint.length < 24, `len=${bigFingerprint.length}`)
check('相同参数得到相同指纹', bigFingerprint === fingerprintOf('write', { file_path: 'x', content: 'A'.repeat(5000) }))

// 记忆预算：会话不能无限增长。
const bounded = createClinic({ maxSessions: 3 })
for (let index = 0; index < 10; index += 1) bounded.observe({ name: 'read', arguments: { file_path: `f${index}` }, agent: { id: `s${index}` } })
check('会话记忆有上限，不会泄漏', bounded.size() === 3, `got ${bounded.size()}`)

// 观察层永远不许把活干坏。
const broken = createClinic()
let threw = false
try {
  broken.observe({ name: 'read', arguments: { get file_path() { throw new Error('坏参数') } }, agent: { id: 'x' } })
} catch {
  threw = true
}
check('观察失败不会抛给宿主', threw === false)

// ---------------------------------------------------------------- 供应链审计（原有）

console.log('host: 供应链报告仍然可用')

const json = await call('/dsh-bushaoxin/report')
check('report route answers 200', json.status === 200, `got ${json.status}`)
const report = JSON.parse(json.body)
check('report lists at least one profile', Array.isArray(report.profiles) && report.profiles.length > 0)
check('report carries a disclaimer', typeof report.disclaimer === 'string' && report.disclaimer.length > 0)

const plugins = report.profiles.flatMap((profile) => profile.plugins)
check('report covers at least one installed plugin', plugins.length > 0)
// 断言"审计真的解析了我们放的 fixture"，而不是"本机碰巧有插件"。
const auditedNames = plugins.map((plugin) => plugin.package)
check('审计读到了 fixture 里的两个插件',
  auditedNames.includes('fixture-clean') && auditedNames.includes('fixture-postinstall'),
  auditedNames.join(', '))
const warned = plugins.find((plugin) => plugin.package === 'fixture-postinstall')
check('审计认出了安装期脚本的风险',
  JSON.stringify(warned ?? {}).includes('postinstall'),
  JSON.stringify(warned ?? {}).slice(0, 200))
const shapeOk = plugins.every((plugin) =>
  typeof plugin.package === 'string'
  && plugin.package.length > 0
  && (plugin.score === null || (plugin.score >= 0 && plugin.score <= 100))
  && Array.isArray(plugin.items)
  && plugin.items.length === 6
  && plugin.items.every((item) => ['ok', 'note', 'warn'].includes(item.status) && typeof item.detail === 'string'))
check('every plugin has a score and the six label rows', shapeOk,
  plugins.filter((plugin) => !(Array.isArray(plugin.items) && plugin.items.length === 6)).map((p) => p.package).join(', '))

console.log(`    audited: ${plugins.map((p) => `${p.package}@${p.version || '?'}=${p.score}`).join('  ')}`)

const html = await call('/dsh-bushaoxin/')
check('HTML route answers 200', html.status === 200, `got ${html.status}`)
check('HTML route is a self-contained document',
  html.body.startsWith('<!doctype html>') && !/<(script|link)\b/i.test(html.body))

// ---------------------------------------------------------------- Client 半边

console.log('client: bundle against a fake __ModuleLoader__')

/**
 * 最小 react shim。两件事必须做对，否则测试会骗人：
 *   1. state 按"渲染代"分槽，渲染结束后弹掉——这样异步回调带着上一代 setter
 *      写进来时，污染不到下一次渲染；
 *   2. effect 只在某个槽第一次出现时跑一次、且不返回清理函数——真 React 里
 *      deps 没变就不会重跑 effect，shim 也必须如此，否则组件每画一次就重新
 *      拉一次心跳，测出来的行为根本不是线上行为。
 */
const reactShim = (() => {
  const store = []
  let generation = 0
  let index = 0
  let cursor = 0
  let settled = false
  return {
    reset() {
      generation += 1
      index = 0
      settled = false
      return generation
    },
    /** 用例之间彻底清干净：上一次的 state 不许漏进下一个用例。 */
    resetAll() {
      store.length = 0
      generation = 0
      index = 0
      cursor = 0
      settled = false
    },
    /**
     * 一次渲染提交完成。游标退回 0，下一次渲染从第一个 hook 开始重新编号；
     * 同时记下这次渲染用掉了几个槽。条目本身继续活着——异步回调可能还握着
     * 这一代的 setter，丢条目会让"心跳回来了"更新到一个孤儿对象上。
     */
    settle() {
      settled = true
      cursor = index
      index = 0
    },
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
    useState(initial) {
      const slot = index++
      if (!settled && cursor > 0) cursor = 0
      const gen = generation
      if (store[slot] === undefined || store[slot].generation !== gen) {
        store[slot] = { generation: gen, value: typeof initial === 'function' ? initial() : initial }
      }
      const entry = store[slot]
      return [entry.value, (next) => {
        entry.value = typeof next === 'function' ? next(entry.value) : next
      }]
    },
    useEffect(callback) {
      const slot = index++
      if (!settled && cursor > 0) cursor = 0
      if (store[slot] !== undefined && store[slot].generation === generation && store[slot].ran === true) return
      store[slot] = { generation, ran: true }
      callback()
    },
    // 真 react 有 useCallback，替身也得有：一次渲染内保持同一个函数引用。
    useCallback(callback) {
      const slot = index++
      if (!settled && cursor > 0) cursor = 0
      if (store[slot] === undefined || store[slot].generation !== generation) {
        store[slot] = { generation, value: callback }
      }
      return store[slot].value
    },
  }
})()

let captured = null
const fakeWindow = {
  __ModuleLoader__: {
    load(spec) {
      captured = spec
    },
  },
}

const bundle = readFileSync(join(root, 'client', 'client.js'), 'utf8')
// eslint-disable-next-line no-new-func -- evaluating the loader-shaped bundle is the point
new Function('window', bundle)(fakeWindow)

check('bundle registers itself with the module loader', captured !== null && captured.id === 'dsh-bushaoxin')

const clientModule = captured.factory((specifier) => {
  if (specifier === 'react') return reactShim
  throw new Error(`unexpected external: ${specifier}`)
})

check('client exports name', clientModule.name === 'dsh-bushaoxin')
check('client declares inject', Array.isArray(clientModule.inject) && clientModule.inject.includes('slots'))
check('client exports apply', typeof clientModule.apply === 'function')

const registered = []
const clientCtx = {
  effect(callback) {
    callback()
    return () => {}
  },
  locale: { register: (namespace) => ({ namespace }) },
  slots: {
    inject(slot, callback) {
      if (slot === 'conversation.composer.dock') callback()
    },
    register(meta, render) {
      registered.push({ meta, render })
      return () => {}
    },
  },
}

clientModule.apply(clientCtx)

check('client registers exactly one dock entry', registered.length === 1, `got ${registered.length}`)
check('the dock entry targets conversation.composer.dock',
  registered[0]?.meta?.name === 'conversation.composer.dock' && registered[0]?.meta?.id === 'bushaoxin-clinic')
check('the dock entry does not steal a shipped id',
  !['stats', 'cost-meter', 'cost-meter-statistics'].includes(registered[0]?.meta?.id))

// 真渲染：fetch 交回 Host 刚生成的那份心跳，所以渲染路径是对着活数据跑的。
// 挂件现在会打两个路由（心跳 + 辣度），所以记录的是一份清单，不是最后一个。
const fetchedUrls = []
const fetchCountOf = (route) => fetchedUrls.filter((url) => url.startsWith(route)).length
globalThis.fetch = async (url) => {
  fetchedUrls.push(String(url))
  if (String(url).startsWith('/dsh-bushaoxin/style')) {
    return { ok: true, status: 200, json: async () => ({ session: SESSION, level: '中', slider: 2, stops: ['关', '轻', '中', '重'] }) }
  }
  return { ok: true, status: 200, json: async () => heartbeat }
}

const element = registered[0].render({ sessionId: SESSION })
check('the dock renders a component element', element !== null && typeof element.type === 'function')

const draw = (props) => {
  reactShim.reset()
  const node = element.type(props)
  // 真 React 在这里提交；shim 借这个时机把游标退回去。
  reactShim.settle()
  return node
}

/**
 * 认真实的重渲染：**不换代**。
 * 之前的写法在重渲染时也调 reset()，于是第二次渲染被当成新挂载，state 被重建、
 * effect 又跑一遍——测出来的是"重新挂载"，而不是"心跳回来后再画一次"。
 */
const rerender = (props) => {
  const node = element.type(props ?? { sessionId: SESSION })
  reactShim.settle()
  return node
}

const flatten = (node, out = []) => {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out)
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    for (const child of node.children ?? []) flatten(child, out)
    if (node.props?.children) flatten(node.props.children, out)
  }
  return out
}

// 挂载：effect 已跑，心跳还在路上。
reactShim.resetAll()
const loading = element.type({ sessionId: SESSION })
reactShim.settle()
// 滑条触发按钮必须一直在 —— 它的存在不依赖心跳，否则心跳一挂就没法调强度了。
check('挂载时就渲染出滑条触发按钮，不等心跳',
  flatten(loading).join(' ').includes('不烧心'), flatten(loading).join(' '))

// 心跳回来之后的重渲染——同一个挂载，只是又画了一次。
await new Promise((resolve) => setTimeout(resolve, 20))
const tree = rerender()
const text = flatten(tree).join(' ')

check('挂件按会话号去问心跳',
  fetchedUrls.includes(`/dsh-bushaoxin/heartbeat?session=${SESSION}`),
  fetchedUrls.join(' | '))
check('一次挂载只拉一次心跳，不因重渲染重复请求',
  fetchCountOf('/dsh-bushaoxin/heartbeat') === 1,
  `heartbeat 请求 ${fetchCountOf('/dsh-bushaoxin/heartbeat')} 次`)
check('挂载时也会去读一次宿主的辣度',
  fetchCountOf('/dsh-bushaoxin/style') === 1,
  `style 请求 ${fetchCountOf('/dsh-bushaoxin/style')} 次`)
check('挂件显示了烧心指数', text.includes('不烧心 ') && text.includes(String(heartbeat.index)), text.slice(0, 160))
check('挂件显示了就诊号与进食次数',
  text.includes(heartbeat.visitLabel) && text.includes(String(heartbeat.total)), text.slice(0, 160))
check('挂件显示了复诊次数', text.includes('复诊 1 次'), text.slice(0, 160))
check('挂件显示了处方', text.includes(heartbeat.dish), text.slice(0, 160))

// 没有 sessionId：不闪别人的数据，也不去请求任何路由；触发按钮仍在（纯本地偏好）。
const beforeNoSession = fetchedUrls.length
const noSession = draw({})
const noSessionText = flatten(noSession).join(' ')
check('拿不到 sessionId 时不显示心跳数据',
  noSession.props?.['data-bushaoxin'] === 'ready' && !noSessionText.includes(heartbeat.dish),
  noSessionText.slice(0, 200))
check('拿不到 sessionId 时一个请求都不发',
  fetchedUrls.length === beforeNoSession, `多发了 ${fetchedUrls.length - beforeNoSession} 个请求`)
check('拿不到 sessionId 时触发按钮仍可用（滑条是本地偏好）',
  noSessionText.includes('不烧心'))

// 心跳挂了：只丢心跳那块，触发按钮和滑条照常。
globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
const failedMount = draw({ sessionId: SESSION })
await new Promise((resolve) => setTimeout(resolve, 20))
const afterFailure = rerender()
const failedText = flatten(afterFailure).join(' ')
check('心跳失败时不抛错，且滑条触发按钮还在',
  afterFailure.props?.['data-bushaoxin'] === 'ready' && failedText.includes('不烧心'),
  JSON.stringify(afterFailure.props ?? null).slice(0, 200))

/* ------------------------------------------------- 滑条：点开 → 拖动 → 真写回宿主 */

// 按 type 找节点：需要拿到按钮的 onClick 和 range 的 onChange。
const findByType = (node, type, out = []) => {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) {
    for (const child of node) findByType(child, type, out)
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    if (node.type === type) out.push(node)
    for (const child of node.children ?? []) findByType(child, type, out)
  }
  return out
}

globalThis.fetch = async (url, init) => {
  fetchedUrls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ?? '' })
  if (String(url).startsWith('/dsh-bushaoxin/style')) {
    return init?.method === 'POST'
      ? { ok: true, status: 200, json: async () => ({ session: SESSION, level: '重', slider: 3 }) }
      : { ok: true, status: 200, json: async () => ({ session: SESSION, level: '中', slider: 2 }) }
  }
  return { ok: true, status: 200, json: async () => heartbeat }
}

reactShim.resetAll()
const closed = element.type({ sessionId: SESSION })
reactShim.settle()
const triggerButton = findByType(closed, 'button')[0]
check('滑条默认是收起的', findByType(closed, 'input').length === 0)
check('找到触发按钮', triggerButton !== undefined && typeof triggerButton.props?.onClick === 'function')

// 点开：先点，再重渲染一次，才能看到 open 之后的那棵树。
triggerButton.props.onClick()
const opened = rerender()
const range = findByType(opened, 'input').find((node) => node.props?.type === 'range')
check('点一下上方就拉出滑条', range !== undefined, JSON.stringify(findByType(opened, 'input').map((n) => n.props?.type)))
check('滑条有四个刻度档', range?.props?.min === 0 && range?.props?.max === 3 && range?.props?.step === 1)
check('滑条面板在触发按钮之前（即在输入框上方）',
  JSON.stringify(opened).indexOf('style-panel') < JSON.stringify(opened).indexOf('不烧心'))

// 拖到最右（重）
const beforeDrag = fetchedUrls.length
range.props.onChange({ target: { value: '3' } })
await new Promise((resolve) => setTimeout(resolve, 20))
const dragPosts = fetchedUrls.slice(beforeDrag).filter((entry) => entry.method === 'POST')
check('拖滑条会 POST 到宿主', dragPosts.length === 1, JSON.stringify(dragPosts))
check('POST 的载荷带着会话与刻度',
  dragPosts[0]?.url === '/dsh-bushaoxin/style'
  && JSON.parse(dragPosts[0].body).slider === 3
  && JSON.parse(dragPosts[0].body).session === SESSION,
  dragPosts[0]?.body)
const afterDrag = flatten(rerender()).join(' ')
check('拖动后按钮上显示新强度', afterDrag.includes('不烧心 · 重'), afterDrag.slice(0, 120))

// 宿主机绝了写入：必须如实说明"只存在本地"，不许假装生效。
globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
const offline = findByType(rerender(), 'input').find((node) => node.props?.type === 'range')
offline.props.onChange({ target: { value: '0' } })
await new Promise((resolve) => setTimeout(resolve, 20))
const offlineText = flatten(rerender()).join(' ')
check('宿主机绝时明确告知只存在本地',
  offlineText.includes('只存在本地') && offlineText.includes('未能同步到宿主'), offlineText.slice(0, 200))

// ---------------------------------------------------------------------- result

// 测试用的假 DSH home 用完就删，别在临时目录里堆垃圾。
rmSync(FIXTURE_HOME, { recursive: true, force: true })

if (logs.length > 0) console.log(`\nhost warnings: ${logs.join(' | ')}`)

if (failures.length > 0) {
  console.error(`\nFAILED (${failures.length}):\n - ${failures.join('\n - ')}`)
  process.exit(1)
}
console.log('\nall checks passed')
// 客户端挂件的 setInterval 会一直转，测试跑完就显式收工，否则 pnpm test 永远不结束。
process.exit(0)
