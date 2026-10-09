/**
 * dsh-bushaoxin · 三期（改写引擎）自测
 *
 * 只测纯函数，不碰宿主。跑法：node test/drama-selftest.mjs
 *
 * 这里断言的是三条硬承诺：
 *   1. 同一个 (文本, 旋钮) 永远得到同一份输出 —— 逐字相等。
 *   2. density=0 时招牌台词一次都不出现；任何档位下同一句招牌台词不重复。
 *   3. 保命真话永远在最后一行（除非测试显式关掉）。
 */
import assert from 'node:assert/strict'
import {
  DEFAULT_KNOBS,
  DEFAULT_STYLE_LEVEL,
  DOMAIN_IDS,
  FLIPS,
  PRESETS,
  STYLE_LEVELS,
  domainOf,
  drama,
  normalizeStyleLevel,
  rewrite,
  resolveKnobs,
  styleDirective,
  subjectOf,
} from '../lib/drama.js'

let passed = 0
const checks = []
function test(name, fn) {
  try {
    fn()
    passed += 1
    checks.push(`  ok   ${name}`)
  } catch (error) {
    checks.push(`  FAIL ${name}\n       ${error.message}`)
    process.exitCode = 1
  }
}

const SAMPLES = [
  "Error: Cannot find module 'lodash'",
  'FAIL test/parser.test.ts ✕ 解析器 应忽略行尾注释',
  '这行 try/catch 是空的，建议处理异常或至少记录日志。',
  'fix: 修复登录偶发失败',
  'rm -rf 之前要不要 dry-run？',
  'P99 = 2.3s，压测不通过',
  'WARNING: .env 已被 git 跟踪',
  '报告日期比实际早一天',
  'ETIMEDOUT 之后把超时改大到 600s',
  '想把 dist/ 一并提交，方便部署',
  'ORDER BY 结果排序错乱，没报错',
  'S3 桶权限误设为公开',
  '',
]

/* ---------------------------------------------------------------- 旋钮收敛 */

test('resolveKnobs 收敛越界值', () => {
  const knobs = resolveKnobs({ slots: 99, density: -5, flip: '不存在的翻转', seed: 99999999 })
  assert.equal(knobs.slots, 4)
  assert.equal(knobs.density, 0)
  assert.equal(knobs.flip, DEFAULT_KNOBS.flip)
  assert.equal(knobs.seed, 1_000_000)
})

test('resolveKnobs 认识预设档位', () => {
  const knobs = resolveKnobs({ preset: '干辣' })
  assert.equal(knobs.density, 0)
  assert.equal(knobs.slots, 3)
  assert.equal(knobs.presetName, '干辣')
})

test('resolveKnobs 忽略不存在的预设档位', () => {
  const knobs = resolveKnobs({ preset: '变态不辣' })
  assert.equal(knobs.presetName, '')
  assert.equal(knobs.slots, DEFAULT_KNOBS.slots)
})

test('五个预设档位的旋钮都是合法值', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    const knobs = resolveKnobs({ preset: name })
    assert.ok(knobs.slots >= 1 && knobs.slots <= 4, `${name} slots 越界`)
    assert.ok(knobs.density >= 0 && knobs.density <= 100, `${name} density 越界`)
    assert.ok(FLIPS.includes(knobs.flip), `${name} flip 非法`)
  }
})

/* ---------------------------------------------------------------- 确定性 */

test('同一个 (文本, 旋钮) 输出逐字相等', () => {
  for (const sample of SAMPLES) {
    for (const preset of Object.keys(PRESETS)) {
      const a = rewrite(sample, { preset }).script
      const b = rewrite(sample, { preset }).script
      assert.equal(a, b, `不稳定：${preset} / ${sample}`)
    }
  }
})

test('换种子会换台词，但不改骨架分段数', () => {
  const sample = "Error: Cannot find module 'lodash'"
  const a = rewrite(sample, { slots: 4, density: 60, seed: 1 })
  const b = rewrite(sample, { slots: 4, density: 60, seed: 4242 })
  assert.notEqual(a.script, b.script, '换种子应该换台词')
  assert.equal(a.domain, b.domain, '换种子不该换领域')
})

test('文本里的具体线索会选中对应剧本', () => {
  const withForce = rewrite('跑 npm install --force 一下就好', {}, {})
  assert.match(withForce.truth, /--force/, '提到 --force 就该给 --force 的真话')
  const withLegacy = rewrite('加 --legacy-peer-deps 就装上了', {}, {})
  assert.match(withLegacy.truth, /legacy-peer-deps/, '提到 legacy 就该给 legacy 的真话')
})

test('线索命中更多的剧本优先，不靠哈希摇', () => {
  // 只命中 --force 一条线索时，无论种子怎么换都该讲 --force。
  for (const seed of [0, 1, 2, 3, 7, 99, 4242]) {
    const result = rewrite('npm install --force 之后 CI 就红了', { seed }, {})
    assert.match(result.truth, /--force/, `seed=${seed} 时没有优先讲 --force`)
  }
})

test('没有线索时讲通用真相，不硬套具体剧情', () => {
  // 这是现场试用抓到的 bug：查 Cannot find module，它却讲 --legacy-peer-deps。
  for (const seed of [0, 1, 5, 42]) {
    const result = rewrite("Error: Cannot find module 'lodash'", { slots: 4, seed }, {})
    assert.ok(!/--force|legacy-peer-deps/.test(result.truth), `seed=${seed} 时硬套了具体剧情：${result.truth}`)
  }
  const generic = rewrite('随便一段没有线索的依赖问题', {}, {})
  assert.match(generic.truth, /lockfile/)
})

test('招牌话术要跟着剧情走，不能串台', () => {
  // 现场试用抓到的 bug：讲 --legacy-peer-deps，招牌却喊 --force。
  const peer = rewrite('本地装依赖报 peer 冲突，同事让我加 --legacy-peer-deps', { slots: 2, density: 30 })
  assert.match(peer.script, /legacy-peer-deps 加一下/, 'peer 剧情应该喊 peer 的偏方')
  assert.ok(!peer.script.includes('充值即送 --force'), 'peer 剧情不该喊 --force')

  const force = rewrite('npm install --force 之后本地能跑，CI 挂了', { slots: 2, density: 30 })
  assert.match(force.script, /充值即送 --force/, '--force 剧情应该喊 --force')
})

/* ---------------------------------------------------------------- 密度 */

test('density=0 时一次招牌台词都不出现', () => {
  for (const sample of SAMPLES) {
    const result = rewrite(sample, { density: 0, slots: 4, flip: '无' })
    assert.ok(!result.script.includes('吃了不烧心'), `干辣出现了招牌台词：${sample}`)
  }
})

test('density>0 时至少出现一次「不烧心」', () => {
  for (const sample of SAMPLES) {
    const result = rewrite(sample, { density: 60, slots: 4 })
    assert.ok(result.script.includes('不烧心'), `没出现招牌：${sample}`)
  }
})

test('招牌台词不重复（同一句最多一次）', () => {
  for (const sample of SAMPLES) {
    for (const density of [15, 30, 60, 80, 100]) {
      const result = rewrite(sample, { density, slots: 4, flip: '无' })
      const slogans = ['贵是贵了点，但吃了不烧心', '锁要对得上版，版要对得上货', '账要记', '秤先校，再谈肉价', '钟要对得上灶', '秤归秤，货归货', '先称重，再下料', '先看灶再点火', '钥匙不进仓库', '先对表，再开火', '钱要花在明细上', '名字写全，别让半年后的自己猜', '先看灶再点火']
      for (const slogan of slogans) {
        const count = result.script.split(slogan).length - 1
        assert.ok(count <= 1, `招牌台词重复 ${count} 次：${slogan} @ ${sample} density=${density}`)
      }
    }
  }
})

/* ---------------------------------------------------------------- 槽位 */

test('slots=1 时只有一幕（不含黑心竞品）', () => {
  const result = rewrite('随便一段文本', { slots: 1, density: 60 })
  assert.ok(!result.script.includes('挂出招牌'), 'slots=1 不该出现黑心竞品招牌')
})

test('slots 递增时内容只增不减', () => {
  const sample = "Error: Cannot find module 'lodash'"
  const short = rewrite(sample, { slots: 2, density: 60 }).script
  const long = rewrite(sample, { slots: 4, density: 60 }).script
  assert.ok(long.length > short.length, 'slots=4 应该比 slots=2 长')
  assert.ok(long.includes('挂出招牌'), 'slots=4 应该仍然包含竞品招牌')
})

test('四种翻转各自留下不同收尾', () => {
  const sample = "Error: Cannot find module 'lodash'"
  const seen = new Set()
  for (const flip of FLIPS) {
    const result = rewrite(sample, { slots: 4, density: 60, flip })
    seen.add(result.script.includes('绝对不翻车') ? '反扑' : result.script.includes('哭了') ? '复购' : result.script.includes('论斤称') ? '自嘲' : '无')
  }
  assert.equal(seen.size, 4, `四种翻转应该产出四种收尾，实际 ${[...seen].join(',')}`)
})

/* ---------------------------------------------------------------- 真话 */

test('保命真话永远在最后一行', () => {
  for (const sample of SAMPLES) {
    for (const preset of Object.keys(PRESETS)) {
      const result = rewrite(sample, { preset })
      const lines = result.script.split('\n').filter((l) => l.trim() !== '')
      assert.match(lines[lines.length - 1], /^📍 \*\*技术真话\*\*：/, `${preset} / ${sample} 结尾不是真话`)
      assert.ok(result.truth.length > 8, '真话不能是空壳')
    }
  }
})

test('keepTruthLine=false 只用于测试，能关掉真话', () => {
  const result = rewrite('x', {}, { keepTruthLine: false })
  assert.ok(!result.script.includes('技术真话'))
})

test('英文技术报错的领域识别正确', () => {
  assert.equal(domainOf("Error: Cannot find module 'lodash'").id, '依赖')
  assert.equal(domainOf('FAIL test/parser.test.ts').id, '测试')
  assert.equal(domainOf('catch {} 是空的').id, '异常')
  assert.equal(domainOf('fix: 修复登录偶发失败').id, '提交')
})

test('认不出来的文本落到「通用」而不是崩', () => {
  assert.equal(domainOf('今天天气不错').id, '通用')
  assert.equal(domainOf('').id, '通用')
  assert.equal(domainOf(null).id, '通用')
  assert.equal(domainOf(undefined).id, '通用')
})

test('生活类话题落到「质检」，而不是硬套软件剧情', () => {
  assert.equal(domainOf('为了省成本换了更便宜的原料供应商').id, '质检')
  assert.equal(domainOf('为了赶工期跳过了几道质检').id, '质检')
  assert.equal(domainOf('这批货的出厂记录没写批号').id, '质检')
})

test('过度通用的词不参与归域（否则「只写了个日期」会被时区抢走）', () => {
  // 回归：曾经时区域的关键词里有「日期」，把「出厂记录只写了个日期」抢到时报错剧本去了。
  assert.equal(domainOf('出厂记录只写了个日期，没写批号').id, '质检')
  // 反过来，只有"日期"这种通用词时宁可不猜，也不要乱套一个领域。
  assert.equal(domainOf('日报日期不对').id, '通用')
  assert.equal(domainOf('这个 error 又来了').id, '通用')
  // 真正带时区信号的还是要认出来。
  assert.equal(domainOf('报告日期比实际早一天，跨时区的活动都归错了').id, '时区')
})

test('质检领域的台词不出现软件词（否则非技术观众一开口就出戏）', () => {
  const software = /模型|提示词|token|代码|函数|接口|部署|依赖|测试|commit|CI|lockfile|repo|版本号|指标|优化|构建/i
  for (const text of ['为了省成本换了更便宜的原料供应商', '为了赶工期跳过了几道质检', '出厂记录没写批号']) {
    for (const preset of Object.keys(PRESETS)) {
      const result = rewrite(text, { preset, slots: 4, density: 60 })
      assert.ok(!software.test(result.script),
        `${preset} / ${text} 出现了软件词：${result.script.replace(/\n/g, ' ').slice(0, 180)}`)
    }
  }
})

test('每个领域都能产出非空剧本', () => {
  for (const id of [...DOMAIN_IDS, '通用']) {
    const result = rewrite(`测试 ${id} 领域`, { slots: 4, density: 60, seed: 7 })
    assert.ok(result.script.includes('📍'), `${id} 没有真话`)
    assert.ok(result.script.length > 40, `${id} 输出太短`)
  }
})

/* ---------------------------------------------------------------- 剧本 */

test('drama 输出角色表、分幕与尾注', () => {
  const result = drama('升级依赖', { slots: 4, density: 60 })
  assert.match(result.script, /角色表/)
  assert.match(result.script, /第一幕/)
  assert.match(result.script, /尾注/)
  assert.ok(result.characters.length >= 2, '角色表至少两个角色')
})

test('drama 的幕数跟随 slots，翻转另加尾声', () => {
  assert.equal(drama('升级依赖', { slots: 2, flip: '无' }).scenes.length, 2)
  assert.equal(drama('升级依赖', { slots: 4, flip: '无' }).scenes.length, 4)
  // 带翻转时会多一个尾声场景，这是设计的一部分而不是 bug。
  assert.equal(drama('升级依赖', { slots: 2 }).scenes.length, 3)
  assert.equal(drama('升级依赖', { slots: 4 }).scenes.length, 5)
})

test('drama 同样确定', () => {
  assert.equal(drama('升级依赖', { slots: 3 }).script, drama('升级依赖', { slots: 3 }).script)
})

test('drama 的干辣档不摆招牌台词', () => {
  // 现场试用抓到的 bug：density=0 时剧本里仍然出现了两次招牌台词。
  for (const topic of ['升级依赖', '写单元测试', '异常处理']) {
    const result = drama(topic, { density: 0, slots: 4, flip: '无' })
    assert.ok(!result.script.includes('吃了不烧心'), `干辣剧本出现了招牌台词：${topic}`)
    assert.match(result.script, /干辣版/, `干辣剧本没说清是干辣版：${topic}`)
  }
})

test('drama 非干辣档仍然给出招牌台词', () => {
  const result = drama('升级依赖', { density: 60, slots: 4 })
  assert.ok(result.script.includes('不烧心'), '非干辣剧本应该有招牌味')
})

/* ---------------------------------------------------------------- 工具函数 */

test('subjectOf 压成一行且带截断', () => {
  const long = 'a'.repeat(300)
  const out = subjectOf(long)
  assert.ok(out.length < 120, '摘要不能原样返回长文本')
  assert.ok(!out.includes('\n'), '摘要不能有换行')
  assert.equal(subjectOf('   '), '（没说是什么事）')
})

test('文风层要求不复读、必须跟真话、不许演短剧', () => {
  for (const level of ['轻', '中', '重']) {
    const text = styleDirective(level)
    assert.match(text, /不要照抄/, `${level} 没禁止照抄`)
    assert.match(text, /真实的技术结论/, `${level} 没要求跟结论`)
    assert.match(text, /不要"演"短剧/, `${level} 没禁止演短剧`)
    assert.match(text, /编造技术事实/, `${level} 没禁止编造`)
  }
})

test('文风强度「关」会明确要求用平常表达', () => {
  const text = styleDirective('关')
  assert.match(text, /已关闭/)
  assert.match(text, /不要使用任何网络梗/)
})

test('文风强度控制每轮允许的梗次数', () => {
  assert.match(styleDirective('轻'), /最多带 1 次/)
  assert.match(styleDirective('重'), /最多带 2 次/)
})

test('非法强度名回落到默认强度', () => {
  assert.equal(normalizeStyleLevel('超辣'), DEFAULT_STYLE_LEVEL)
  assert.equal(normalizeStyleLevel(''), DEFAULT_STYLE_LEVEL)
  assert.equal(normalizeStyleLevel(null), DEFAULT_STYLE_LEVEL)
  assert.equal(normalizeStyleLevel('关'), '关')
  assert.equal(Object.keys(STYLE_LEVELS).length, 4)
})

test('所有输出都不含未替换的模板占位符', () => {
  for (const sample of SAMPLES) {
    const result = rewrite(sample, { slots: 4, density: 100, seed: 3 })
    assert.ok(!result.script.includes('undefined'), `出现 undefined：${sample}`)
    assert.ok(!result.script.includes('null'), `出现 null：${sample}`)
    assert.ok(!result.script.includes('[object'), `出现 [object：${sample}`)
  }
})

/* ---------------------------------------------------------------- 汇总 */

console.log(checks.join('\n'))
console.log(`\n${passed}/${checks.length} 通过`)
if (process.exitCode === 1) {
  console.log('有断言失败，别装。')
}
