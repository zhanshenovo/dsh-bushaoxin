/**
 * 视频拍摄素材包：把视频里要投屏的每一段都算出来，落成一份 txt。
 * 这样拍摄脚本里引用的输出就是引擎真产物，不用手抄、不会写错。
 *
 * 跑法：node test/video-assets.mjs  →  test/video-assets.txt
 */
import { writeFileSync } from 'node:fs'
import { PRESETS, demoOutput, drama, rewrite, styleDirective } from '../lib/drama.js'

const out = []
const h = (title, char = '═') => {
  out.push('')
  out.push(char.repeat(78))
  out.push(`  ${title}`)
  out.push(char.repeat(78))
}

h('不烧心 · 视频拍摄素材包')
out.push('本文件里每一段都可直接投屏。全部由引擎实时生成，无手写文案。')

/* ------------------------------------------------ 镜头 1：标准助手（对照用） */

h('镜头 2 素材 · 「标准助手」的说法（对照，手写文案）')
out.push('说明：这是拍摄时口头念或做成对比字幕的那一版，不是引擎产物。')
out.push('')
out.push('  不建议使用 --force，它会导致 lockfile 与 package.json 不一致，')
out.push('  可能引发构建失败。')

/* ------------------------------------------------ 镜头 3：特辣改写 */

h('镜头 3 素材 · 特辣改写（投屏原文）')
out.push('命令：')
out.push('  /bushaoxin_rewrite preset=特辣 npm install --force 之后本地能跑，CI 挂了')
out.push('')
out.push(rewrite('npm install --force 之后本地能跑，CI 挂了', { preset: '特辣' }).script)

/* ------------------------------------------------ 镜头 5：三个技术例子 */

h('镜头 5 素材 · 三个技术例子（换话题，证明不复读）')
const techCases = [
  ['异常', 'catch {} 是空的，建议处理异常或至少记录日志', '干辣'],
  ['时区', '报告日期比实际早一天，跨时区的活动都归错了', '中辣'],
  ['密钥', '本地 .env 能跑，数据不对查了一下午', '特辣'],
]
for (const [label, text, preset] of techCases) {
  out.push('')
  out.push(`── ${label} ──`)
  out.push(`命令：/bushaoxin_rewrite preset=${preset} ${text}`)
  out.push('')
  out.push(rewrite(text, { preset }).script)
}

/* ------------------------------------------------ 镜头 6：脚本骨架 */

h('镜头 6 素材 · 剧本骨架（给"它不演小剧场"那段做对照）')
out.push('命令：/bushaoxin_drama 升级依赖')
out.push('')
out.push(drama('升级依赖', { preset: '特辣' }).script)

/* ------------------------------------------------ 镜头 7：生活化例子 */

h('镜头 7 素材 · 生活/经营例子（面向非技术观众）')
const lifeCases = [
  '为了省成本换了更便宜的原料供应商，便宜了三成，出货快了一倍',
  '为了赶工期跳过了几道抽检，反正前面几批都没出问题',
  '出厂记录只写了个日期，没写批号',
]
for (const text of lifeCases) {
  out.push('')
  out.push(`命令：/bushaoxin_rewrite preset=特辣 ${text}`)
  out.push('')
  out.push(rewrite(text, { preset: '特辣' }).script)
}

/* ------------------------------------------------ 镜头 8：四档火力 */

h('镜头 8 素材 · 同一句输入，四档火力（做快速剪辑用）')
out.push("输入固定：Error: Cannot find module 'lodash'")
for (const preset of ['微辣', '中辣', '特辣', '干辣']) {
  const script = rewrite("Error: Cannot find module 'lodash'", { preset, seed: 3 }).script
  const body = script.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('【') && !l.startsWith('📍'))
  out.push('')
  out.push(`── ${preset}（正文 ${body.length} 行）──`)
  out.push(script)
}

/* ------------------------------------------------ 镜头 9：文风层正文 */

h('镜头 9 素材 · 真正写进系统提示的文风层正文（截图/滚动用）')
out.push('这是插件注入给模型的原文，不是事后加工 —— 视频里可做缓慢滚动。')
out.push('')
out.push(styleDirective('中'))

/* ------------------------------------------------ 镜头 10：滑条 */

h('镜头 10 素材 · 滑条与强度档位（界面截图 + 参数）')
out.push('强度四档（关/轻/中/重）与改写五档（微辣/中辣/特辣/变态辣/干辣）是两套词，别混。')
out.push('')
out.push('强度（改对话语气，滑条控制）：')
for (const [name, config] of Object.entries({ 关: 0, 轻: 1, 中: 1, 重: 2 })) {
  out.push(`  ${name}  每轮最多 ${config} 次`)
}
out.push('')
out.push('改写档位（改成品口味，preset 控制）：')
for (const [name, k] of Object.entries(PRESETS)) {
  out.push(`  ${name.padEnd(4, '　')} 槽位 ${k.slots} · 密度 ${String(k.density).padStart(3)}% · 翻转 ${k.flip}`)
}
out.push('')
out.push('验收地址（镜头里可展示"真的写进去了"）：')
out.push('  http://127.0.0.1:19387/dsh-bushaoxin/style?session=<会话号>')
out.push('  返回 {"level":"重","slider":3,...}，与滑条位置一致即为写通。')

/* ------------------------------------------------ 演示页 */

h('镜头 11 素材 · 左右对比演示页（可直接录屏）')
out.push('  http://127.0.0.1:19387/dsh-bushaoxin/demo.html')
out.push('  页面左侧「标准助手怎么说」，右侧可按火力实时切换，含烧心指数刻度条。')
out.push('')
const demo = demoOutput()
out.push(`  内置样板 ${demo.samples.length} 条、火力 ${demo.flavors.length} 档：`)
for (const sample of demo.samples) {
  out.push(`    · ${sample.label}（${sample.level}）`)
}

/* ------------------------------------------------ 金句 */

h('金句备选（字幕 / 海报 / 片尾）')
const quotes = [
  '它不改代码，不改模型，不提效率。它改的只是你听警告时的注意力。',
  '技术信息一个字没少。少的是"你听完就忘"这件事。',
  '贵是贵了点，但吃了不烧心。',
  '段子可以让路，事实不行。',
  '它不会让你做错决定，它只会让你多想半秒。',
  '账面好看，不等于账算对了。',
  '便宜三成，赔一次就够。',
  '召回通知下来的时候，没人知道要召回哪一批。',
  '糖衣会化，药还在。',
  '下一次你看到 --force，脑子里响的是隔壁那家黑心店。',
]
for (const quote of quotes) out.push(`  · ${quote}`)

writeFileSync('test/video-assets.txt', out.join('\n'), 'utf8')
console.log(`素材包已生成：test/video-assets.txt（${out.join('\n').length} 字符）`)
