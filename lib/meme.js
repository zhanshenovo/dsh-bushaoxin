/**
 * dsh-bushaoxin · 不烧心梗引擎
 *
 * 整个"工作流里的不烧心"梗都在这里，而且是**纯函数 + 一个明确状态的累加器**：
 * 没有 cordis、没有宿主、没有 I/O，所以 test/selftest.mjs 能把每一句话都断言一遍。
 *
 * 医学声明（很严肃）：本文件里所有诊断、处方、挂号记录都是段子。
 * 唯一一句真话在 REPORT_DISCLAIMER 和 DIET_PLAN 的最后一档里。
 */

export const NS = 'dsh-bushaoxin'

/* ------------------------------------------------------------------ 工具分类 */

const CATEGORY_BY_TOOL = {
  read: '看',
  read_image: '看',
  glob: '找',
  grep: '找',
  session_search: '找',
  session_event_search: '找',
  web_search: '找',
  web_fetch: '找',
  skill: '看',
  write: '写',
  edit: '写',
  todo_write: '写',
  present: '写',
  pwsh: '吃',
  bash: '吃',
  lsp: '吃',
  job_output: '吃',
  subagent: '分诊',
  subagent_fork: '分诊',
  workflow: '分诊',
  send_message: '分诊',
  interrupt_agent: '分诊',
  list_agents: '分诊',
  ask_user_question: '问',
  exit_plan_mode: '问',
  create_goal: '写',
  update_goal: '写',
  get_goal: '看',
  cordis_inspect_list: '看',
  cordis_inspect_query: '看',
}

/** 「问」类工具只在模型真的开口时计数，避免把每次自省都算成打扰用户。 */
export const ASK_TOOLS = new Set(['ask_user_question', 'exit_plan_mode'])

const CATEGORY_ORDER = ['看', '找', '写', '吃', '分诊', '问']
const CATEGORY_HEAT = { 看: 1, 找: 1, 写: 4, 吃: 6, 分诊: 12, 问: 2 }

export function categoryOf(toolName) {
  if (typeof toolName !== 'string') return '其他'
  return CATEGORY_BY_TOOL[toolName] ?? '其他'
}

/* ------------------------------------------------------------------ 复诊检测 */

const REPEAT_MEMES = [
  '同一位患者，同一个部位，第三次了。',
  '这不是复诊，这是复读。',
  '同一个地方反复按，按出溃疡只是时间问题。',
  '第七次摸同一个抽屉，你说钥匙是不是掉里面了。',
]

/** 复诊（重复动作）判定：同一工具 + 同样输入，连续第 `threshold` 次开始算。 */
export function detectRepeat(state, toolName, fingerprint, threshold = 3) {
  if (state.lastKey === fingerprint && state.lastTool === toolName) {
    state.repeatStreak += 1
  } else {
    state.lastKey = fingerprint
    state.lastTool = toolName
    state.repeatStreak = 1
  }
  if (state.repeatStreak < threshold) return null
  const times = state.repeatStreak
  return `${REPEAT_MEMES[(times + hashString(fingerprint)) % REPEAT_MEMES.length]}（连续第 ${times} 次）`
}

/** 稳定的小哈希：让同一份输入永远得到同一句吐槽。 */
export function hashString(text) {
  const input = String(text ?? '')
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}

/** 从工具参数里挑一个"病灶"，只取短标识，绝不把整份文件塞进病历。 */
export function lesionOf(toolName, args) {
  if (args === null || typeof args !== 'object') return ''
  const pick = (...keys) => {
    for (const key of keys) {
      const value = args[key]
      if (typeof value === 'string' && value.trim() !== '') return shorten(value)
    }
    return ''
  }
  if (toolName === 'pwsh' || toolName === 'bash') return pick('description', 'command')
  if (toolName === 'glob' || toolName === 'grep' || toolName === 'web_search') return pick('pattern', 'query')
  return pick('file_path', 'path', 'url', 'agent_id', 'pattern', 'query', 'name')
}

function shorten(value, max = 64) {
  const flat = String(value).replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

/* ------------------------------------------------------------------ 烧心指数 */

export function emptyLog(sessionId = '') {
  return {
    sessionId,
    total: 0,
    byCategory: { 看: 0, 找: 0, 写: 0, 吃: 0, 分诊: 0, 问: 0, 其他: 0 },
    repeats: [],
    errors: 0,
    lastLines: [],
    lastTool: '',
    lastKey: '',
    repeatStreak: 0,
    startedAt: Date.now(),
  }
}

/**
 * 积分规则（可整活，但算得是认真的）：
 *   吃 ‑ pwsh/bash/子进程   6 分    辛辣油腻，最伤
 *   写 ‑ write/edit         4 分    麻辣火锅，一次一顿
 *   分诊 ‑ 子代理/workflow  12 分   症状扩散，另开一个诊室
 *   找 ‑ 搜索               1 分    轻微反酸
 *   看 ‑ 阅读               1 分    清淡
 *   复诊 ‑ 重复动作         +5 分   同一个地方反复按
 *   反酸 ‑ 工具报错         +8 分   条件反射
 */
export function heartburnOf(log) {
  const counts = log.byCategory ?? {}
  let points = 3 // 开局就有点反酸：谁干活不上火呢
  for (const [category, weight] of Object.entries(CATEGORY_HEAT)) {
    points += (counts[category] ?? 0) * weight
  }
  points += (counts.其他 ?? 0) * 2
  points += (log.repeats?.length ?? 0) * 5
  points += (log.errors ?? 0) * 8
  return points
}

/** 分数刻度：刻意做成非线性，让"还能忍"和"该挂号了"离得远一点，人也别天天收到警告。 */
export function indexOf(points) {
  const index = Math.round(100 * (1 - Math.exp(-points / 140)))
  return Math.max(0, Math.min(100, index))
}

export const ENDOSCOPY_GRADES = [
  { max: 19, grade: '0 级', label: '胃黏膜光滑，未见异常', tone: 'calm' },
  { max: 39, grade: 'A 级', label: '黏膜轻度充血，无需处理', tone: 'calm' },
  { max: 59, grade: 'B 级', label: '点状发红，建议清谈饮食', tone: 'note' },
  { max: 79, grade: 'C 级', label: '条状发红伴糜烂，建议少食多餐', tone: 'warn' },
  { max: 100, grade: 'D 级', label: '融合性糜烂，建议立即离屏', tone: 'risk' },
]

export function gradeOf(index) {
  for (const entry of ENDOSCOPY_GRADES) {
    if (index <= entry.max) return entry
  }
  return ENDOSCOPY_GRADES[ENDOSCOPY_GRADES.length - 1]
}

/* ------------------------------------------------------------------ 忌口 */

export const DIET_PLAN = [
  { id: 0, dish: '温白开', advice: '没啥事，继续。胃比你有出息。' },
  { id: 1, dish: '小米粥', advice: '清淡为主，别连着开新坑。' },
  { id: 2, dish: '苏打饼干', advice: '开始有点反酸了，建议先把手头这件事收尾。' },
  { id: 3, dish: '温牛奶', advice: '别再加辣了。再开一个子代理就是往锅里倒辣椒油。' },
  { id: 4, dish: '床头抬高 15 厘米', advice: '今晚睡前 3 小时别再进食（我说的"进食"是指再派一个 agent）。' },
  { id: 5, dish: '抑酸药 + 挂号', advice: '建议尽快去看消化内科 —— 这一条是真的。' },
]

export function dishOf(index) {
  return DIET_PLAN[Math.min(DIET_PLAN.length - 1, Math.floor(index / 20))]
}

/* ------------------------------------------------------------------ 冷知识 */

export const FACTS = [
  '胃是情绪器官。它比你的老板更早知道你在硬撑。',
  '反酸不一定是吃多了，也可能是这件事你其实不想做。',
  '凌晨两点的代码和凌晨两点的火锅，伤的是同一个地方。',
  '「多喝热水」在医学上不成立，但在人际关系上非常成立。',
]

/* ------------------------------------------------------------------ 胃镜报告 */

export const REPORT_DISCLAIMER =
  '本报告为整活。全部诊断由本机 token 消耗量与工具调用次数推算，不具备医学效力；' +
  '若你真的反酸、烧心、胸骨后疼痛，请去看消化内科，不要来找插件。'

/** 会话号：让"第几诊"对同一个 session 永远一致，像病历号一样赖着不走。 */
export function visitNumberOf(sessionId) {
  return (hashString(sessionId) % 900) + 100
}

function complainOf(log) {
  const counts = log.byCategory ?? {}
  const parts = []
  if ((log.repeats?.length ?? 0) > 0) parts.push(`反复摸同一个地方 ${log.repeats.length} 次`)
  if ((counts.写 ?? 0) >= 3) parts.push('刚吃完麻辣火锅（连改几个文件）')
  if ((counts.吃 ?? 0) >= 3) parts.push('猛灌冰可乐（连跑几条命令）')
  if ((counts.分诊 ?? 0) > 0) parts.push(`开了 ${counts.分诊} 个分诊台（子代理）`)
  if ((log.errors ?? 0) > 0) parts.push(`条件反射性反酸 ${log.errors} 次`)
  if (parts.length === 0) parts.push('反酸、烧心，说不清哪一顿吃的')
  return parts.join('；')
}

function findingsOf(log) {
  const counts = log.byCategory ?? {}
  const view = []
  if ((counts.看 ?? 0) > 0) view.push(`食管下段黏膜受"${counts.看} 次阅读"摩擦，轻度充血`)
  if ((log.repeats?.length ?? 0) >= 2) view.push('同一部位可见片状发红，患者仍坚持"这次不一样"')
  if ((counts.写 ?? 0) >= 2) view.push(`胃体见 ${counts.写} 处麻辣样糜烂，考虑与批量改动相关`)
  if ((counts.吃 ?? 0) > 0) view.push(`胃窦见 ${counts.吃} 处点状出血，追问病史：刚跑过命令`)
  if ((counts.分诊 ?? 0) > 0) view.push('可见多处散在病灶，与多处子代理同时开工一致')
  if (view.length === 0) view.push('黏膜橘红色，皱襞规整，未见明确病灶')
  return view
}

/**
 * 生成一份完整报告。纯函数：同一个 log 永远得到同一份报告，
 * 所以测试可以逐字断言，用户也不会看到报告自己乱跳。
 */
export function reportOf(log, options = {}) {
  const points = heartburnOf(log)
  const index = indexOf(points)
  const grade = gradeOf(index)
  const dish = dishOf(index)
  const visit = visitNumberOf(log.sessionId ?? '')
  const now = options.now instanceof Date ? options.now : new Date()
  const hour = now.getHours()

  const observation = log.lastLines && log.lastLines.length > 0
    ? log.lastLines.slice(-4)
    : ['（本次就诊尚未开始进食，胃里空空的，很健康。）']

  const diagnoses = []
  const counts = log.byCategory ?? {}
  if ((log.repeats?.length ?? 0) > 0) diagnoses.push('强迫性复诊（反复执行同一动作）')
  if ((counts.写 ?? 0) >= 3) diagnoses.push('饮食不节（改动过频）')
  if ((counts.吃 ?? 0) >= 3) diagnoses.push('辛辣刺激（命令密集）')
  if ((counts.分诊 ?? 0) >= 2) diagnoses.push('多处病灶（并行任务过多）')
  if ((log.errors ?? 0) >= 2) diagnoses.push('应激性黏膜病变（连续报错）')
  if (diagnoses.length === 0) diagnoses.push('暂未发现明确病变，建议保持')

  const nightShift = hour >= 23 || hour < 6

  return {
    namespace: NS,
    visit,
    visitLabel: `第 ${visit} 诊`,
    index,
    points,
    grade: grade.grade,
    tone: grade.tone,
    gradeLabel: log.sessionId ? grade.label : grade.label,
    summary: grade.label,
    complain: complainOf(log),
    findings: findingsOf(log),
    observation,
    diagnoses,
    byCategory: { ...counts },
    total: log.total ?? 0,
    repeats: (log.repeats ?? []).slice(-5),
    repeatsCount: (log.repeats ?? []).length,
    errors: log.errors ?? 0,
    prescription: [
      dish.dish,
      dish.advice,
      nightShift ? '另外：现在是深夜，色温已经替你降了，别再开新坑。' : null,
    ].filter((line) => line !== null),
    kicker: index >= 80
      ? '再烧就去看消化内科，我认真的。'
      : index >= 60
        ? '先把手上这件事收尾，再开下一个。'
        : '可以继续，但别再按同一个地方了。',
    disclaimer: REPORT_DISCLAIMER,
    menu: DIET_PLAN,
    facts: FACTS,
    generatedAt: now.toISOString(),
  }
}

/** 给推送用的单行摘要：短、带数字、不占地方。 */
export function digestOf(report) {
  if (report.total === 0) return '不烧心 · 胃里空空，暂无异常'
  return `不烧心 · ${report.index}/100 · ${report.grade} · ${report.prescription[0]}`
}

/* ------------------------------------------------------------------ 病历钩子 */

export const HOOK_LINE =
  '如果用户提到烧心、反酸、上火、胃疼、胃，或者你在同一件事上反复折腾了三次以上，' +
  '可以调用 bushaoxin_check 获取一份当日病历（会给出一个段子式的烧心指数和处方）。' +
  '这只是工作流里的一个玩笑，不要据此给出任何真实的医疗建议。'
