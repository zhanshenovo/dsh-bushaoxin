/**
 * dsh-bushaoxin · 不烧心短剧改写引擎（三期）
 *
 * 与 meme.js 同样的纪律：**纯函数，零 I/O，零宿主依赖**。
 * 同一个 (文本, 旋钮) 永远得到同一个输出 —— 所以 selftest 能逐字断言，
 * 用户也不会看到同一段话每次跑出不同的段子。
 *
 * 设计要点（针对"过于死板"的修正）：
 *   1. 辣度不是四档音量，而是 5 个独立旋钮：槽位 / 密度 / 翻转 / 口号域 / 种子。
 *   2. 招牌台词允许为 0 次（干辣路线），且按领域参数化，不复读同一句。
 *   3. 每篇结尾必带「保命真话」——真实技术结论，不可关闭。
 *      keepTruthLine=false 只允许在测试里用来验证渲染，默认永远为真。
 */

import { hashString } from './meme.js'

export const NS_DRAMA = 'dsh-bushaoxin/drama'

/* ------------------------------------------------------------------ 旋钮 */

/** 槽位：讲几幕。允许只讲一幕。 */
export const SLOT_MIN = 1
export const SLOT_MAX = 4

/** 翻转方式：收尾往哪儿拐，不是永远"翻车+认账"。 */
export const FLIPS = ['自嘲', '顾客复购', '黑心店反扑', '无']

/** 预设档位 = 旋钮的若干组合，不是天花板。可以自己拧。 */
export const PRESETS = {
  微辣: { slots: 1, density: 15, flip: '无' },
  中辣: { slots: 2, density: 30, flip: '顾客复购' },
  特辣: { slots: 4, density: 60, flip: '黑心店反扑' },
  变态辣: { slots: 4, density: 80, flip: '自嘲' },
  /** 完全不出现招牌台词，走冷幽默。 */
  干辣: { slots: 3, density: 0, flip: '无' },
}

export const DEFAULT_KNOBS = { slots: 3, density: 60, flip: '黑心店反扑', seed: 0 }

function clamp(value, min, max, fallback) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

/**
 * 两套词汇容易混：**强度**是关/轻/中/重（改对话语气），**档位**是微辣/中辣/特辣/变态辣/干辣（改改写成品）。
 * 用户把强度名当档位名传进来是很自然的事，所以这里显式认下来，别默默回落成默认值 ——
 * 静默回落等于让人以为 "轻" 生效了，其实给了个别的味道。
 */
const PRESET_ALIAS = {
  关: '干辣',
  轻: '微辣',
  中: '中辣',
  重: '特辣',
}

function presetOf(source, styleLevels) {
  const raw = typeof source.preset === 'string' ? source.preset.trim() : ''
  if (raw === '') return { name: '', preset: {}, aliased: false }
  if (Object.prototype.hasOwnProperty.call(PRESETS, raw)) return { name: raw, preset: PRESETS[raw], aliased: false }
  // 强度名（关/轻/中/重）映射到最接近的档位。
  if (Object.prototype.hasOwnProperty.call(PRESET_ALIAS, raw)) {
    const name = PRESET_ALIAS[raw]
    return { name, preset: PRESETS[name], aliased: true }
  }
  // 兜底：如果调用方还提供了强度表，认表里的键。
  if (styleLevels !== null && Object.prototype.hasOwnProperty.call(styleLevels ?? {}, raw)) {
    const name = PRESET_ALIAS[raw] ?? ''
    return name === '' ? { name: '', preset: {}, aliased: false } : { name, preset: PRESETS[name], aliased: true }
  }
  return { name: '', preset: {}, aliased: false }
}

/**
 * 把用户/模型给的一堆松垮参数收敛成合法旋钮。
 * 认不出来的档位名直接忽略，绝不抛 —— 梗坏了不能把活干坏了。
 */
export function resolveKnobs(input = {}, styleLevels = null) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const chosen = presetOf(source, styleLevels)
  const merged = { ...DEFAULT_KNOBS, ...chosen.preset, ...source }
  const flip = FLIPS.includes(merged.flip) ? merged.flip : DEFAULT_KNOBS.flip
  return {
    slots: clamp(merged.slots, SLOT_MIN, SLOT_MAX, DEFAULT_KNOBS.slots),
    density: clamp(merged.density, 0, 100, DEFAULT_KNOBS.density),
    flip,
    seed: clamp(merged.seed, 0, 1_000_000, DEFAULT_KNOBS.seed),
    presetName: chosen.name,
    presetAliased: chosen.aliased,
  }
}

/* ------------------------------------------------------------------ 领域 */

/**
 * 每个领域带一批「剧本候选」。掏哪一条由 (seed, domain, 文本) 决定，
 * 所以同一输入稳定，不同输入不撞车。
 */
const DOMAINS = [
  {
    id: '依赖',
    keywords: ['module', 'lodash', 'npm', 'pnpm', 'install', 'dependencies', '依赖', '装包', 'peer', 'lockfile'],
    rival: '那家「一键装依赖」的店',
    rivalLine: '充值即送 --force，三秒解决，包过。',
    rivalLine2: '装不上？--legacy-peer-deps 加一下，亲。',
    cheap: '它没说它改了什么，也没说它没看你的 Node 版本。',
    dear: ['先看清 lockfile', '再对版本', '最后才敢动手'],
    slogans: ['锁要对得上版，版要对得上货', '先对版，再下锅', '版本号不是装饰，是配料表'],
    cases: [
      {
        hit: ['--force', 'force', '强制'],
        evidence: 'node_modules 炒得喷香，package-lock.json 也顺手给你改了',
        crash: '构建在 CI 上翻车。那锅料端出来的时候谁都看懂了——它压根没看你的 Node 版本。',
        truth: '--force 会让 lockfile 与 package.json 脱节，本地能跑、CI 挂掉。先 git diff package-lock.json 再决定要不要留。',
      },
      {
        hit: ['--legacy-peer-deps', 'legacy', 'peer'],
        // 每条剧情自带招牌话术：讲 peer 冲突时，黑心店喊的必须是 peer 那个偏方，
        // 不能串到 --force 上去 —— 招牌和剧情对不上，观众一眼就看出来了。
        rivalLine: '装不上？--legacy-peer-deps 加一下，亲，就一行。',
        evidence: 'peer 冲突被压住了，没人再报错',
        crash: '下一次上游升级，那层被压住的冲突原封不动冒出来，还得从头查一遍是谁的锅。',
        truth: '--legacy-peer-deps 不解决 peer 冲突，只是让 npm 别说话。先查是哪个包要求了哪个不兼容的版本。',
      },
      {
        hit: ['cannot find module', '找不到模块', 'missing module', 'module not found'],
        evidence: '它给了个一闪而过的结论：装一下就好',
        crash: '装完还是找不到——因为缺的那个包压根不在你编辑的那个 package.json 里。',
        truth: "Cannot find module 'x' 就是 x 没装在当前解析路径下。先确认它是 dependencies 还是 devDependencies，再确认你装在了哪个目录。",
      },
    ],
    fallbackCase: {
      evidence: '依赖装上了，版本号没人看过',
      crash: '某天构建忽然用了另一个版本 —— 谁也说不清是它自己换的，还是本来就装错了。',
      truth: '依赖问题的第一步永远是看清 lockfile 和 package.json 对不对得上。',
    },
  },
  {
    id: '异常',
    keywords: ['catch', 'try', 'throw', 'exception', '日志', '异常', '报错', 'silent', '吞', 'html', '转义', 'escape'],
    rival: '隔壁那个「精简」流派',
    rivalLine: 'catch {} 就完了，日志多了看着烦，还影响性能。',
    rivalLine2: '报错弹出来用户会慌，先兜住再说。',
    cheap: '它把「什么都不做」包装成了「优雅」。',
    dear: ['多三行日志', '多一个告警', '多花你十分钟'],
    slogans: ['账要记', '亏要吃在明处', '响一声不丢人，丢人的是没人知道'],
    cases: [
      {
        hit: ['catch {}', 'empty catch', '空的 catch', '空 catch', 'catch 是空'],
        evidence: '看板一片绿，绿得有点太干净了',
        crash: '对账那天少了 400 万条记录，一条日志都没留下。',
        truth: '空 catch 不是优雅，是把异常静默转成数据错误。至少记日志，否则故障无法定位。',
      },
      {
        hit: ['catch', 'try', '异常', 'error'],
        evidence: '每个 catch 都回了个「操作失败」，干干净净',
        crash: '三个月后没人能说出它到底失败在哪一步——因为失败的原因被那句「操作失败」替换掉了。',
        truth: 'catch 里至少要带上 error 本身（栈、code、message），否则你只剩一个自我安慰的提示语。',
      },
    ],
    fallbackCase: {
      evidence: '异常被兜住了，流程没中断',
      crash: '也再没人知道它出过事。',
      truth: '兜住异常的同时要留下证据：谁、在哪、什么原因。',
    },
  },
  {
    id: '测试',
    keywords: ['test', 'spec', '断言', '用例', 'coverage', '覆盖率', 'skip', 'only', 'snapshot', '快照'],
    rival: '那家「先发版」的铺子',
    rivalLine: '反正只差几个点，先把发布发了。',
    rivalLine2: '这条用例太脆了，先 skip 掉，回头补。',
    cheap: '它上菜是真快。快到你把「回头补」这三个字说了三十遍。',
    dear: ['把红着的用例拆开看', '补一条回归', '再谈覆盖率'],
    slogans: ['秤先校，再谈肉价', '红了就先看红在哪', '别让用例替你闭嘴'],
    cases: [
      {
        hit: ['skip', '跳过', '忽略', 'xit', 'todo'],
        evidence: '那条用例被跳过，测试报告立刻变绿',
        crash: '三个礼拜后线上炸了——用户配置里的注释被整行吞掉，静默出错，一条告警都没有。',
        truth: 'skip 不会让用例消失，只会把失败延后到线上。先修根因（比如 \\r\\n 处理），再谈覆盖率。',
      },
      {
        hit: ['snapshot', '快照', 'toMatchSnapshot'],
        evidence: '快照全量重录，一次通过',
        crash: '半年后没人知道新快照里那些字段是「对的」还是「当时就这样」。',
        truth: '重录快照等于把断言交给你当下的实现。重录前先 diff，看清每一处变化是不是你要的。',
      },
    ],
    fallbackCase: {
      evidence: '测试跑完了，结果很安静',
      crash: '安静得让人不太放心。',
      truth: '测试的价值在于它敢红。全绿且从没红过的测试，通常什么也没测。',
    },
  },
  {
    id: '提交',
    keywords: ['commit', 'chore', 'fix', 'feat', 'message', '提交', '偶发', 'wip', 'refactor'],
    rival: '隔壁的提交只要一行',
    rivalLine: '修复偶发问题——完。',
    rivalLine2: 'WIP：先提交，下班。',
    cheap: '快捷、便宜、好交付。',
    dear: ['复现步骤', '根因', '影响范围', '回滚方式'],
    slogans: ['名字写全，别让半年后的自己猜', '一句话说不清的改动，通常也没想清'],
    cases: [
      {
        hit: ['偶发', 'fix', '修复', 'wip', 'WIP'],
        evidence: '三个月后它又被端上来一次，还是同一道菜',
        crash: '没人知道上次到底改了什么，包括去年改的那个人。',
        truth: 'commit 正文写清「为什么改」，是留给半年后 git blame 的你自己。写「偶发」等于没修。',
      },
      {
        hit: ['chore', 'refactor', '重构'],
        evidence: '几十个文件被顺手重排了空格，diff 长得像瀑布',
        crash: '真正的行为改动埋在里面，review 的人看不出来，出事时 bisect 也定位不到。',
        truth: '格式化和行为改动必须拆成两个 commit，否则 review 和 bisect 同时失效。',
      },
    ],
    fallbackCase: {
      evidence: '提交记录很干净，一行一条',
      crash: '干净到没有一条能回答「当时为什么这么改」。',
      truth: '让每个 commit 正文回答「为什么」，而不只是「改了什么」。',
    },
  },
  {
    id: '进程',
    keywords: ['rm -rf', 'kill', 'pkill', 'delete', '删除', '清空', 'drop', 'truncate', '危险'],
    rival: '有人主张直接铲平',
    rivalLine: '路径肯定对，直接 rm -rf 就完事了。',
    rivalLine2: '表先 drop 掉重建，反正能重跑。',
    cheap: '它动作很快，快到没有回头看第二眼。',
    dear: ['先 dry-run 列出会删哪些', '再加确认', '最后才按回车'],
    slogans: ['先看灶再点火', '删之前先数一遍', '手快的人，赔得快'],
    cases: [
      {
        hit: ['rm -rf', 'rm', 'delete', '删除', '清空'],
        evidence: '命令跑完了，终端干净利落地回了提示符',
        crash: '下一秒你发现当前目录就是你要删的那个。这一次，没有 git 帮你。',
        truth: 'rm -rf 前先跑一遍 dry-run（ls 或 --dry-run），并确认 CWD。不可逆操作要么加二次确认，要么给回收站兜底。',
      },
      {
        hit: ['drop', 'truncate', '清库'],
        evidence: '表重建完成，结构干净',
        crash: '数据没了。备份上一次成功是上周三。',
        truth: 'drop/truncate 之前先确认备份可恢复（真恢复过一次才算）。结构变更走迁移工具，不靠手敲。',
      },
    ],
    fallbackCase: {
      evidence: '操作执行得很顺利',
      crash: '顺利得没人去核对结果。',
      truth: '不可逆操作要先想「错了怎么回来」，再想「怎么快」。',
    },
  },
  {
    id: '成本',
    keywords: ['token', '成本', '费用', '账单', 'budget', '预算', '花钱', 'usage', '贵'],
    rival: '那家「砍预算」的套路工厂',
    rivalLine: '换个便宜模型、提示词砍短点，立刻省一半。',
    rivalLine2: '先开个监控看着，钱花在该花的地方。',
    cheap: '它卖的不是优化，是一张好看的账单。',
    dear: ['先定位到底是哪儿在烧', '改一行', '再谈换模型'],
    slogans: ['钱要花在明细上', '先查漏，再谈省', '账单好看不等于问题解决'],
    cases: [
      {
        hit: ['token', '重复读', '循环', '重试'],
        evidence: '账单涨得很有规律，每小时一格',
        crash: '最后查出来是一个循环里的字符串累加，O(n²)。改一行就完了，跟模型一点关系没有。',
        truth: '先把 O(n²) 改成 O(n)，再谈优化。改指标不是改性能。',
      },
      {
        hit: ['重试', 'retry', '失败率'],
        evidence: '重试次数加了三倍，成功率确实上去了',
        crash: '延迟和成本一起上去了，故障时间只是被推到了下一班人手里。',
        truth: '重试解决的是瞬时抖动，不是持续失败。加钱买失败是最贵的一种方案。',
      },
    ],
    fallbackCase: {
      evidence: '预算控制住了，指标也好看',
      crash: '只是没人知道省下来的是不是必要的那些钱。',
      truth: '先量化「贵在哪一步」，再决定砍哪一步。',
    },
  },
  {
    id: '度量',
    keywords: ['压测', 'P99', 'p99', 'latency', '延迟', 'QPS', '性能', 'benchmark', '指标'],
    rival: '隔壁的方案很便宜',
    rivalLine: '把 P99 的分母做大，指标立刻就好看。',
    rivalLine2: '采样率调低点，慢的那些就不进来了。',
    cheap: '它做的不是优化，是把量尺换了。',
    dear: ['先测哪儿慢', '再改那一处', '最后复测'],
    slogans: ['秤先校，再谈肉价', '先量准，再动手'],
    cases: [
      {
        hit: ['P99', 'p99', '压测', '延迟'],
        evidence: '改了统计口径之后，报表确实漂亮了',
        crash: '那顿贵，贵在没人再知道真实延迟是多少——包括写它的人。',
        truth: '先把 O(n²) 改成 O(n)，再谈优化。改指标不是改性能。',
      },
      {
        hit: ['缓存', 'cache', '加缓存'],
        evidence: '加了缓存，接口立刻快了十倍',
        crash: '三天后数据不一致的工单进来了，没人敢清缓存，因为没人知道清了会发生什么。',
        truth: '加缓存前先定失效策略和一致性边界，否则你只是把延迟换成了脏数据。',
      },
    ],
    fallbackCase: {
      evidence: '指标达成了目标',
      crash: '只是没人确认过这个指标衡量的是不是用户真的在等的那件事。',
      truth: '先确认指标对应真实体验，再拿它做决策。',
    },
  },
  {
    id: '密钥',
    keywords: ['.env', 'env', 'secret', 'token', 'key', '密钥', '凭证', 'credential', 'apikey', 'API key'],
    rival: '「本地能跑就行」派',
    rivalLine: '.env 提交一下，方便大家。',
    rivalLine2: '硬编码先放进去，回头抽出来。',
    cheap: '它方便了所有人，包括不该看到它的那些人。',
    dear: ['先把密钥挪进密钥管理', '再轮换', '最后清历史'],
    slogans: ['钥匙不进仓库', '锁要对得上版，版要对得上货'],
    cases: [
      {
        hit: ['.env', '提交', '硬编码', 'hardcode'],
        evidence: '.env 进了仓库，团队每个人都能跑起来了',
        crash: '第五遍的时候，密钥被扫出来了。当年劝他别提交的那个人，被请了回来。',
        truth: '已经进了历史的密钥，改代码救不回来——必须去轮换，再用 git filter-repo 清历史。',
      },
      {
        hit: ['密钥', 'secret', 'token', 'key'],
        evidence: '密钥被抽进了一个 constants 文件',
        crash: '它还在仓库里，只是换了个更好找的名字。',
        truth: '密钥必须来自环境变量或密钥管理服务，不能来自仓库里的任何文件。',
      },
    ],
    fallbackCase: {
      evidence: '配置读取正常，本地开发很顺',
      crash: '顺到你忘了它同时也在别人的 git log 里。',
      truth: '默认假设仓库是公开的：任何进过仓库的密钥都当作已泄露。',
    },
  },
  {
    id: '时区',
    keywords: ['时区', 'timezone', 'utc', '早一天', 'dayjs', 'moment'],
    rival: '隔壁的日报每天准时早一天',
    rivalLine: '存本地时间就行，反正都是同一批人看。',
    rivalLine2: '加个 +8 就对了。',
    cheap: '它不缺料、不缺火——缺一块表。',
    dear: ['入口统一转 UTC', '展示层再转本地', '边界用例补测试'],
    slogans: ['钟要对得上灶', '先对表，再开火'],
    cases: [
      {
        hit: ['时区', 'timezone', 'utc', '早一天', '日期'],
        evidence: '报表上的跨时区活动，被归到了前一天',
        crash: '连着出了三次事故，才有人去看那块表。',
        truth: '事件时间存本地时间还是 UTC，要在入口就定死。跨时区算日期一律先转 UTC，展示层再转回来。',
      },
      {
        hit: ['+8', '本地时间', 'offset'],
        evidence: '加了个 +8，测试环境全对',
        crash: '夏令时那天，另一个时区的同事看到的时间还是错的。',
        truth: '手写时区偏移在夏令时上必错。用带时区信息的库，或全程 UTC + 展示层转换。',
      },
    ],
    fallbackCase: {
      evidence: '时间戳存下来了',
      crash: '只是没人说得清它是哪个时区的。',
      truth: '时间一律带时区信息存储（UTC 或带 offset），别存没有时区的裸时间。',
    },
  },
  {
    id: '超时',
    keywords: ['timeout', '超时', 'ETIMEDOUT', '重试', 'retry', 'deadline'],
    rival: '「把超时改大」派',
    rivalLine: '改成 600 秒就好了。',
    rivalLine2: '加重试，重试三次总能成功。',
    cheap: '它确实好了——好了 600 秒。',
    dear: ['先看是哪一层慢', '再判断是真慢还是重试', '最后才调参'],
    slogans: ['先看灶再点火', '慢要慢在明处'],
    cases: [
      {
        hit: ['600', '超时', 'timeout'],
        evidence: '超时值调大之后，报错确实消失了',
        crash: '隔壁管这叫修复。其实它什么都没修，只是把发货时间往后挪了十分钟。',
        truth: '超时是症状不是病因。加超时而不查根因，等于把故障推迟到下一班人手里。',
      },
      {
        hit: ['重试', 'retry'],
        evidence: '加了三次重试，成功率从 92% 涨到 99%',
        crash: '代价是尾延迟翻了三倍，而真正的那个失败原因一次都没被看过。',
        truth: '重试只对瞬时抖动有效。持续失败需要看错误分布，不能靠次数掩盖。',
      },
    ],
    fallbackCase: {
      evidence: '超时配置调好了',
      crash: '没人验证过它在真实负载下够不够。',
      truth: '超时值要来自实测的 P99，而不是来自感觉。',
    },
  },
  {
    id: '权限',
    keywords: ['权限', 'permission', 'acl', 'public', '公开', 's3', 'bucket', 'role', 'iam'],
    rival: '「内部用的，公开一下没事」派',
    rivalLine: '先设成公开，回头再收。',
    rivalLine2: '* 权限先开着，不然调不通。',
    cheap: '它很快就能调通，快到你不用想清楚谁在访问。',
    dear: ['授权写原因', '写到期时间', '默认不公开'],
    slogans: ['默认关着', '钥匙不进仓库', '先立规矩，路才能越走越宽'],
    cases: [
      {
        hit: ['public', '公开', 's3', 'bucket'],
        evidence: '桶设成公开之后，外链立刻就通了',
        crash: '一年后，它出现在搜索引擎里。',
        truth: '公开一个桶是一次操作，收回来是无数次核查。默认私有，显式公开，并记录原因和到期时间。',
      },
      {
        hit: ['*', '通配', 'iam', 'role'],
        evidence: '权限给了 * 之后，所有调用都通了',
        crash: '没人再知道这个身份到底能碰哪些资源——包括给它授权的那个人。',
        truth: '权限用最小集，按资源写具体动作。* 会让你在出事时无法界定影响范围。',
      },
    ],
    fallbackCase: {
      evidence: '权限配通了，服务正常跑',
      crash: '只是没人能列出它到底能碰什么。',
      truth: '任何权限变更都要能回答：谁、能做什么、到什么时候。',
    },
  },
  {
    id: '编码',
    keywords: ['utf8', 'utf8mb4', '排序', 'collate', '乱码', '编码', 'charset', 'order by', 'ORDER BY'],
    rival: '那家只报结论的店',
    rivalLine: '改成 utf8mb4_0900_ai_ci 就对了，所有列都改。',
    rivalLine2: '加个 CONVERT 就好了，先上线。',
    cheap: '它不说哪些列依赖这个排序，也不说谁来验。',
    dear: ['先确认列', '再确认依赖', '再定规则', '最后回归'],
    slogans: ['先称重，再下料', '规则要先写下来'],
    cases: [
      {
        hit: ['排序', 'order by', 'ORDER BY', 'collate'],
        evidence: '换了排序规则之后，报错没了',
        crash: '生产库里排序全错，而且它不报错——没人发现，直到有人做了分页导出。',
        truth: '排序规则不一致会让 ORDER BY 在不同表上给出不同顺序，且不报错。上线前把排序规则统一，并补一条断言顺序的测试。',
      },
      {
        hit: ['utf8', '乱码', 'charset', '编码'],
        evidence: '库改成 utf8mb4 之后，emoji 存进去了',
        crash: '连接层还是 utf8，某些字符在写入那一刻就已经被替换成了问号，再也找不回来。',
        truth: '编码要库、表、列、连接四层一致。任何一层落后，数据会在写入时静默损坏。',
      },
    ],
    fallbackCase: {
      evidence: '编码调整完成',
      crash: '只是没验证过往返（写入再读出）是否一致。',
      truth: '编码改动必须做一次往返测试，只验证「能存进去」是不够的。',
    },
  },
  {
    id: '产物',
    keywords: ['dist', 'build', '产物', 'node_modules', '二进制', '打包', 'artifacts'],
    rival: '「提交一下方便部署」派',
    rivalLine: '把 dist 一并提交，部署省事。',
    rivalLine2: 'node_modules 也传上去，环境就一致了。',
    cheap: '方便了三周。',
    dear: ['产物交给制品库', '构建交给流水线', '仓库只放源'],
    slogans: ['秤归秤，货归货', '仓库不是仓库房'],
    cases: [
      {
        hit: ['dist', '产物', 'build'],
        evidence: 'dist 提交之后，部署确实简单了',
        crash: '三周后两个人同时改了同一个压缩文件，Git 给出的建议是：「你们自己选一个。」',
        truth: '构建产物进版本库会把 diff 变成噪音，并让每次冲突都无法人工合并。用制品库或流水线产物。',
      },
      {
        hit: ['node_modules', '二进制', 'vendored'],
        evidence: '依赖目录一起提交之后，装机再也没失败过',
        crash: '仓库一夜之间涨到 2GB，clone 要十分钟，而且没有任何人能 review 那些改动。',
        truth: '锁文件（lockfile）才是保证环境一致的机制，不是把依赖目录塞进仓库。',
      },
    ],
    fallbackCase: {
      evidence: '产物放进仓库了',
      crash: '只是没人说得清哪一份是「当次构建」的。',
      truth: '产物要有唯一来源和可追溯的构建号，不能靠人手工同步。',
    },
  },
  {
    // 生活/经营领域：给非技术观众讲的时候用。
    // 这一域的台词刻意不出现任何软件词，否则一开口就露馅。
    id: '质检',
    keywords: ['质检', '抽检', '原料', '供应商', '过期', '保质期', '批次', '出厂', '验收', '偷工', '省成本', '赶工期', '采购'],
    rival: '隔壁那家「省下来就是赚到」的店',
    rivalLine: '原料换便宜三成，出货快一倍，谁看得出来？',
    rivalLine2: '少两道抽检而已，前面几批不都没事？',
    cheap: '它卖的不是便宜，是一张好看的账。',
    dear: ['原料留样', '每批抽检', '验收签字', '出问题能追到批号'],
    slogans: ['账要算全，不能只算省下的那三成', '省下的钱，迟早从别的地方还回去', '便宜三成，赔一次就够'],
    cases: [
      {
        hit: ['原料', '供应商', '便宜', '省成本', '过期'],
        evidence: '账面立刻好看了：成本降三成，出货快一倍',
        crash: '半年后一批货被退回来做检测 —— 出问题的原料，进货单上写得清清楚楚，便宜那三成就是省在这儿。',
        truth: '原料留样、进货票据、每批可追。否则出事时你连是哪一批都说不清，只能全线下架。',
      },
      {
        hit: ['质检', '抽检', '赶工期', '跳过', '验收'],
        // 招牌要跟着剧情走：讲抽检就别喊原料的偏方。
        rivalLine: '少两道抽检而已，前面几批不都没事？',
        evidence: '少了两道抽检，工期赶上了，报表干干净净',
        crash: '三个月后一批货整批出问题 —— 那两道被省掉的抽检，本来正好拦住它。',
        truth: '抽检不是成本，是保险。要省就先算清一次整批召回的代价，再决定省哪一道。',
      },
      {
        hit: ['批次', '出厂', '保质期'],
        rivalLine: '记录写个日期就行了，谁真去翻批号？',
        evidence: '出厂记录只写了个日期，没写批号',
        crash: '召回通知下来的时候，没人知道要召回哪一批，最后全下了架。',
        truth: '批号必须跟货走。追不回去的货，等于每次都按最坏情况处理。',
      },
    ],
    fallbackCase: {
      evidence: '这批货顺利出手，没人多问一句',
      crash: '也没人知道它到底是怎么做出来的。',
      truth: '每批留一份记录。省下的是几分钟，赔上的是出事时说不清。',
    },
  },
]

const GENERIC_DOMAIN = {
  id: '通用',
  rival: '隔壁那家什么都能治的店',
  rivalLine: '放心，一键就好。',
  rivalLine2: '别问那么多，先跑起来。',
  cheap: '它不报价，只报结论。',
  dear: ['先把话说清楚', '再把步骤拆开', '最后才动手'],
  slogans: ['贵有贵的道理', '慢是为了不用返工'],
  cases: [
    {
      hit: [],
      evidence: '它给了一个很确定的答案',
      crash: '只是没人问过它凭什么这么确定。',
      truth: '快和确定不是同一件事。先确认结论的依据，再决定要不要跟。',
    },
  ],
  fallbackCase: {
    evidence: '事情办完了，过程很安静',
    crash: '安静得没有人留下任何记录。',
    truth: '把过程写下来。下次遇到同样的事，你就不用再从头猜一遍。',
  },
}

export const DOMAIN_IDS = DOMAINS.map((domain) => domain.id)

/**
 * 取一个领域的招牌台词池和它的「贵在哪」清单。
 *
 * 给演示/视频素材用：**从数据里取，不要从渲染出来的文本里正则抠** ——
 * 抠文本会连黑心店的招牌一起抓进来，那两句长得很像。
 */
export function domainInfo(id) {
  const domain = DOMAINS.find((entry) => entry.id === id)
  if (domain === undefined) return null
  return {
    id: domain.id,
    slogans: [...domain.slogans],
    dear: [...domain.dear],
    rival: domain.rival,
    rivalLine: domain.rivalLine,
    keywords: [...domain.keywords],
  }
}

/** 按关键词把文本归到一个领域；认不出来就落到「通用」。 */
export function domainOf(text) {
  const flat = String(text ?? '').toLowerCase()
  if (flat.trim() === '') return GENERIC_DOMAIN
  let best = null
  let bestHits = 0
  let bestSpan = 0
  for (const domain of DOMAINS) {
    let hits = 0
    let span = 0
    for (const keyword of domain.keywords) {
      if (flat.includes(keyword.toLowerCase())) {
        hits += 1
        // 记下最长的命中词：越长的词越具体。"出厂" 应该赢过 "日期"。
        if (keyword.length > span) span = keyword.length
      }
    }
    // 先比命中数，再比最具体的那一个；都相同就保持注册顺序（先注册赢）。
    if (hits > bestHits || (hits === bestHits && hits > 0 && span > bestSpan)) {
      bestHits = hits
      bestSpan = span
      best = domain
    }
  }
  return bestHits === 0 ? GENERIC_DOMAIN : best
}

/* ------------------------------------------------------------------ 工具 */

/** 把文本压成一行短摘，用作剧本里的"物证"标注，绝不塞整份文件。 */
export function subjectOf(text, max = 56) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (flat === '') return '（没说是什么事）'
  const code = flat.match(/[A-Za-z_][\w.-]{2,40}/)
  const short = flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
  return code === null ? short : `${short}（提到 ${code[0]}）`
}

function candidatesOf(domain) {
  return [...domain.cases, { hit: [], ...domain.fallbackCase }]
}

/**
 * 选剧本：先看有没有命中具体线索（比如文本里写了 --force），
 * 命中多个就用 seed+文本 定序；都没命中就按 seed 挑一个通用剧本。
 */
export function pickCase(text, domain, seed) {
  const flat = String(text ?? '').toLowerCase()
  const all = candidatesOf(domain)
  const fallback = { hit: [], ...domain.fallbackCase }
  const scored = all
    .map((entry) => ({
      entry,
      score: entry.hit.filter((k) => flat.includes(k.toLowerCase())).length,
    }))
    .filter((item) => item.score > 0)
  // 一条线索都没命中时用通用剧本，绝不硬套某个具体剧情 ——
  // 否则你查 "Cannot find module"，它给你讲 --force，牛头不对马嘴。
  if (scored.length === 0) return fallback
  // 命中多的优先：文本里明写 --force 就该讲 --force，不靠哈希摇。
  const best = scored.reduce((max, item) => (item.score > max ? item.score : max), 0)
  const pool = scored.filter((item) => item.score === best).map((item) => item.entry)
  const index = (seed + hashString(`${domain.id}|${flat}`)) % pool.length
  return pool[index]
}

/** 从池子里按 seed 稳定取一条，n 是池子长度。 */
function pick(pool, seed, salt) {
  return pool[(seed + hashString(salt)) % pool.length]
}

/* ------------------------------------------------------------------ 渲染 */

function line(text) {
  return `> ${text}`
}

/**
 * 招牌台词注入器。
 * density 决定"说几次"：0 = 一次都不说（干辣），100 = 允许说到饱和，但同一句永不重复。
 */
function sloganBlock(domain, knobs, salt) {
  const wants = knobs.density === 0 ? 0 : 1 + Math.round((knobs.density / 100) * 2)
  const pool = [...domain.slogans, '贵是贵了点，但吃了不烧心']
  const chosen = []
  for (let step = 0; step < wants && step < pool.length; step += 1) {
    const index = (knobs.seed + hashString(`${salt}|${step}|${domain.id}`)) % pool.length
    const candidate = pool[index]
    if (!chosen.includes(candidate)) chosen.push(candidate)
  }
  return chosen
}

const FLIP_LINES = {
  自嘲: '（各位看官，这段「先立规矩」的台词，隔壁流水线上也印得出来，论斤称。）',
  顾客复购: '「那我为什么还来？」\n「因为你上次没来的时候，哭了。」',
  黑心店反扑: '它后来又挂了个新招牌：「本店承诺，绝对不翻车。」',
  无: null,
}

/**
 * 主入口：把一段文本改写成「不烧心」短剧。
 * 返回 { script, knobs, domain, truth }，script 是可直接显示的文本。
 */
export function rewrite(text, input = {}, options = {}) {
  const knobs = resolveKnobs({ ...options.defaults, ...input })
  const domain = domainOf(text)
  const picked = pickCase(text, domain, knobs.seed)
  const subject = subjectOf(text)
  const salt = `${domain.id}|${subject}|${knobs.seed}`
  const slogans = sloganBlock(domain, knobs, salt)

  const copy = {
    rival: domain.rival,
    // 剧情自带招牌就用自己的：讲 peer 的时候不能还在喊 --force。
    rivalLine: picked.rivalLine ?? domain.rivalLine,
    rivalLine2: picked.rivalLine ?? domain.rivalLine2,
    cheap: domain.cheap,
    dear: domain.dear,
    evidence: picked.evidence,
    crash: picked.crash,
    slogan0: slogans[0] ?? '贵是贵了点，但吃了不烧心',
    slogan1: slogans[1] ?? null,
    slogan2: slogans[2] ?? null,
  }

  const body = []

  // 槽 1 · 立价：老实商家为什么贵
  if (knobs.slots >= 1 && knobs.density > 0) {
    body.push(`顾客：「${copy.slogan0}。」`)
  }

  // 槽 2 · 抢客：黑心竞品登场（只有 slots>=2 才请它出来）
  if (knobs.slots >= 2) {
    body.push(`${copy.rival}挂出招牌：**「${copy.rivalLine}」**`)
    if (knobs.density >= 50) body.push(copy.cheap)
  }

  // 槽 3 · 翻车：物证 + 事故
  if (knobs.slots >= 3) {
    body.push(copy.evidence)
    body.push(copy.crash)
  }

  // 槽 4 · 护规 + 翻转
  if (knobs.slots >= 4) {
    body.push(`老店这边报价一直不好看：${copy.dear.join('，')}。`)
    if (copy.slogan1 !== null) body.push(`「${copy.slogan1}。」`)
    const flip = FLIP_LINES[knobs.flip]
    if (flip !== null && flip !== undefined) body.push(flip)
    if (copy.slogan2 !== null) body.push(`「${copy.slogan2}。」`)
  } else if (knobs.slots === 3 && copy.slogan1 !== null) {
    body.push(`「${copy.slogan1}。」`)
  }

  if (body.length === 0) body.push(`顾客：「${copy.slogan0}。」`)

  const head = `【不烧心 · ${knobs.presetName === '' ? '自定义' : knobs.presetName}】`
  const tail = `物证：${subject}`

  const script = [
    head,
    line(tail),
    '',
    ...body.map((paragraph) => line(paragraph)),
  ].join('\n')

  const keepTruth = options.keepTruthLine !== false
  const withTruth = keepTruth ? `${script}\n\n📍 **技术真话**：${picked.truth}` : script

  return {
    namespace: NS_DRAMA,
    knobs,
    domain: domain.id,
    truth: picked.truth,
    script: withTruth,
  }
}

/**
 * 剧本骨架（bushaoxin_drama）：给一个主题，吐四幕结构 + 角色表。
 * 与 rewrite 共用领域词表，所以同一主题会得到与改写一致的世界观。
 */
export function drama(topic, input = {}, options = {}) {
  const knobs = resolveKnobs({ ...options.defaults, ...input })
  const domain = domainOf(topic)
  const picked = pickCase(topic, domain, knobs.seed)
  const slogans = sloganBlock(domain, knobs, `drama|${domain.id}|${knobs.seed}`)

  const scenes = [
    {
      title: '第一幕 · 立价',
      cast: ['老实商家'],
      beat: `商家解释为什么贵：${domain.dear.join('，')}。`,
    },
    {
      title: '第二幕 · 抢客',
      cast: ['老实商家', '黑心竞品', '顾客'],
      beat: `黑心竞品挂出招牌「${picked.rivalLine ?? domain.rivalLine}」，把人抢走。${domain.cheap}`,
    },
    {
      title: '第三幕 · 护规',
      cast: ['顾客', '老实商家'],
      // 密度为 0（干辣）时不摆招牌台词，用一个动作交代同一件事。
      beat: knobs.density === 0
        ? '老顾客回来了，老板没提价，也没改做法 —— 该怎么做还怎么做。'
        : `老顾客回来说出那句：「${slogans[0] ?? '贵是贵了点，但吃了不烧心'}」。`,
    },
    {
      title: '第四幕 · 翻车',
      cast: ['黑心竞品', '顾客'],
      // 先交代物证再翻车：只有"结局"那一拍，戏是立不住的。
      beat: `${picked.evidence}。${picked.crash}`,
    },
  ].slice(0, knobs.slots)

  const flip = FLIP_LINES[knobs.flip]
  if (flip !== null && flip !== undefined) {
    scenes.push({
      title: knobs.flip === '顾客复购' ? '尾声 · 复购' : knobs.flip === '自嘲' ? '尾声 · 自嘲' : '尾声 · 反扑',
      cast: ['旁白'],
      beat: flip.replace(/\n/g, ' '),
    })
  }

  const characters = [...new Set(scenes.flatMap((scene) => scene.cast))]

  const text = [
    `# 不烧心剧本 · ${domain.id} · ${topic}`,
    '',
    `**角色表**：${characters.join('、')}`,
    `**旋钮**：槽位 ${knobs.slots} · 密度 ${knobs.density}% · 翻转 ${knobs.flip} · 种子 ${knobs.seed}`,
    '',
    ...scenes.map((scene) => `**${scene.title}**（${scene.cast.join('、')}）\n${scene.beat}\n`),
    // 干辣（density=0）不摆招牌台词，尾注如实说明。
    knobs.density === 0
      ? '**尾注**：干辣版，不摆招牌台词。'
      : `**尾注**：${slogans[0] ?? '贵是贵了点，但吃了不烧心'}`,
  ].join('\n')

  const keepTruth = options.keepTruthLine !== false
  return {
    namespace: NS_DRAMA,
    knobs,
    domain: domain.id,
    characters,
    scenes,
    truth: picked.truth,
    script: keepTruth ? `${text}\n\n📍 **技术真话**：${picked.truth}` : text,
  }
}

/* ------------------------------------------------------------------ 演示数据 */

/**
 * 给演示页准备数据：样板输入 × 全部火力档，一次算好。
 *
 * 放这里的理由和别处一样 —— 页面和引擎共用同一份真相，演示里出现的每个字
 * 都是 rewrite() 真能产出的，不存在"台上说得到、台下复现不了"。
 */
export const DEMO_SAMPLES = [
  { id: 'deps', label: '依赖报错', level: '依赖', text: "Error: Cannot find module 'lodash'" },
  { id: 'force', label: '--force 的坑', level: '依赖', text: 'npm install --force 之后本地能跑，CI 挂了' },
  { id: 'test', label: '测试想 skip', level: '测试', text: 'FAIL test/parser.test.ts ✕ 解析器 应忽略行尾注释' },
  { id: 'catch', label: '空的 catch', level: '异常', text: 'catch {} 是空的，建议处理异常或至少记录日志。' },
  { id: 'commit', label: 'commit message', level: '提交', text: 'fix: 修复登录偶发失败' },
  { id: 'secret', label: '.env 被提交', level: '密钥', text: 'WARNING: .env 已被 git 跟踪' },
  { id: 'tz', label: '时区差一天', level: '时区', text: '报告日期比实际早一天' },
  { id: 'dist', label: '提交 dist', level: '产物', text: '想把 dist/ 一并提交，方便部署' },
  // 这条特意含 < 和 >，用来真的触发演示页的 JSON 转义（否则那条防线永远是空跑的）。
  { id: 'html', label: 'HTML 转义', level: '异常', text: '渲染 <div> 时没有转义用户输入，有 XSS 风险' },
]

/** 同一段输入，引擎会怎么讲。 */
export function demoOutput() {
  const flavors = Object.keys(PRESETS)
  return {
    namespace: NS_DRAMA,
    flavors,
    levels: Object.keys(STYLE_LEVELS).map((name) => ({ name, note: STYLE_LEVELS[name].note })),
    styleSection: styleDirective(DEFAULT_STYLE_LEVEL),
    samples: DEMO_SAMPLES.map((sample) => ({
      ...sample,
      plain: PLAIN_ADVICE[sample.id] ?? '',
      results: Object.fromEntries(
        flavors.map((flavor) => [flavor, rewrite(sample.text, { preset: flavor, seed: 3 }).script]),
      ),
    })),
  }
}

/** 「标准助手」会怎么讲同一件事 —— 对比的左半边。 */
export const PLAIN_ADVICE = {
  deps: '缺少依赖 lodash。请执行 npm install lodash 安装后重试。',
  force: '不建议使用 --force，它会导致 lockfile 与 package.json 不一致，可能引发构建失败。',
  test: '该用例失败。建议先修复失败原因，不要跳过（skip）测试用例。',
  catch: '空的 catch 块会吞掉异常。建议至少记录日志，或向上抛出。',
  commit: '提交信息过于笼统，建议说明根因、影响范围与回滚方式。',
  secret: '检测到 .env 已被 git 跟踪。请移除并轮换其中包含的密钥。',
  tz: '日期计算存在时区偏移问题，建议统一使用 UTC 存储与计算。',
  dist: '不建议将构建产物纳入版本控制，应使用制品库或流水线产物。',
  html: '渲染用户输入时必须做 HTML 转义，否则会产生 XSS 漏洞。',
}

/* ------------------------------------------------------------------ 文风层（主体） */

/**
 * 这个插件的初衷：**改对话风格**。
 *
 * 技术事实（已核对宿主源码，别再试别的路）：
 *   - assistant/message 是 session.append **之后**才发出的通知事件，改不了正文；
 *   - 客户端在 agent/assistant-stream 的帧上就已经实时渲染完了。
 * 所以"事后改写助手回复"做不到。唯一真正有效的路是**在生成前**把文风写进系统提示 ——
 * 这样助手的回复从一开始就是那个风格，而不是被贴上去的。
 *
 * 文风强度的意思是「一次对话里允许带几次梗」，不是「梗有多长」。
 */
export const STYLE_LEVELS = {
  关: { perReply: 0, note: '完全关闭文风层，助手照常说话。' },
  轻: { perReply: 1, note: '整段回复最多出现一次梗味，偏克制。' },
  中: { perReply: 1, note: '技术话题里平均每两三轮带一次，正常对话不带。' },
  重: { perReply: 2, note: '只要话题沾技术，基本每轮都带，允许两次。' },
}

export const DEFAULT_STYLE_LEVEL = '中'

export function normalizeStyleLevel(value) {
  const name = typeof value === 'string' ? value.trim() : ''
  return Object.prototype.hasOwnProperty.call(STYLE_LEVELS, name) ? name : DEFAULT_STYLE_LEVEL
}

/**
 * 生成写入系统提示的文风指令。
 *
 * 关键约束（都是被上一版教训逼出来的）：
 *   1. 不许复读原台词 —— 原梗就是被 AI 批量复读搞腻的，插件不能犯同一个错。
 *   2. 梗后面必须跟真实技术结论，不能只有段子。
 *   3. 不许"演"短剧（不写角色对白、不加旁白、不编场景），只改说话的方式。
 *      —— 否则助手会开始角色扮演，把工作对话变成小剧场，那是灾难。
 *   4. 严肃场合（线上事故、用户明确要求正经）自动切回正常表达。
 */
export function styleDirective(level = DEFAULT_STYLE_LEVEL) {
  const name = normalizeStyleLevel(level)
  const config = STYLE_LEVELS[name]
  if (config.perReply === 0) {
    return '【不烧心文风】已关闭。请使用你平常的表达方式，不要使用任何网络梗。'
  }
  return [
    `【不烧心文风 · ${name}】用户在设置里开启了「不烧心」整活模式，用来调侃"便宜的路有坑、慢的路可靠"这类取舍。`,
    '',
    '梗的用法（可以做）：',
    '- 顾客那句是「贵是贵了点，但吃了不烧心」；老板那句是「怕亏钱，但更怕坏规矩，先把规矩立住，路才能越走越宽」。',
    '- 只在"快而便宜的做法其实有坑"这种取舍出现时用，且**必须自己组织语言**：把台词揉进正常句子里，或按领域换词（依赖说"锁要对得上版"，测试说"秤先校，再谈肉价"，异常说"账要记"，时区说"钟要对得上灶"）。',
    `- 整段回复里最多带 ${config.perReply} 次梗味。${config.note}`,
    '- 梗后面**必须**跟上真实的技术结论。段子是包装，结论才是内容。',
    '',
    '禁区（不要做）：',
    '- 不要照抄上面任何一句台词原文。原梗就是因为被 AI 批量复读才变腻的，复读等于把这个梗再杀一次。',
    '- 不要"演"短剧：不写「顾客：」「老板：」这类角色对白，不加旁白、不加场景描写、不加【镜头】。你是在回答技术问题，不是在写剧本。要剧本请用 bushaoxin_rewrite / bushaoxin_drama 工具显式产出。',
    '- 不要在用户处理线上事故、排查故障、或明确要求正经时用这个文风。',
    '- 不要为了配合段子编造技术事实。段子可以让路，事实不行。',
    '- 不要主动提"我在用不烧心文风"，让它自然出现在表达里就够了。',
  ].join('\n')
}
