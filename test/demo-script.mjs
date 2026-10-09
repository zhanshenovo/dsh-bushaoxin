/**
 * 演示台本生成器：只调用真实的 lib/drama.js，输出即所见。
 *
 * 之所以做成脚本而不是手写文案：演示里每一个字都必须是引擎真能产出的，
 * 否则台上说得到、台下复现不了 —— 那叫表演，不叫演示。
 *
 * 跑法：node test/demo-script.mjs
 */
import { PRESETS, rewrite, styleDirective } from '../lib/drama.js'
import { writeFileSync } from 'node:fs'

/** 同时把台本写成 UTF-8 文件，方便直接投屏或粘进演示文档。 */
const collected = []
const emit = (text) => {
  collected.push(text)
  console.log(text)
}

const hr = (char = '─', width = 74) => char.repeat(width)
const title = (text) => `\n${hr('━')}\n${text}\n${hr('━')}`

/* ---------------------------------------------------------------- 开场 */

emit(title('不烧心 · 演示台本'))
emit('引擎版本输出的每一段都是真实产物，可以直接投屏。')

/* ------------------------------------------------- 第一幕：同一条建议 */

emit(title('第一幕 · 同一条技术建议，两种说法'))

const advice = {
  plain: '不建议使用 --force，它会导致 lockfile 与 package.json 不一致，可能引发构建失败。',
  soured: "npm install --force 之后本地能跑，CI 挂了",
}

emit('\n【标准助手】\n')
emit('  ' + advice.plain)
emit('\n【装了不烧心】\n')
emit(
  rewrite(advice.soured, { preset: '特辣' }).script
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n'),
)

/* ------------------------------------------------- 第二幕：文风层 */

emit(title('第二幕 · 文风层（主体，写进系统提示，默认开）'))
emit('\n这一段是真正注入系统提示的正文，不是我事后贴的：\n')
emit(styleDirective('中').split('\n').map((l) => '  │ ' + l).join('\n'))

/* ------------------------------------------------- 第三幕：领域换词 */

emit(title('第三幕 · 不是复读一句台词，是每个领域换一套行话'))
emit('\n同一个梗，六种技术话题，六种说法：\n')

const topics = [
  ['依赖', "Error: Cannot find module 'lodash'", { preset: '特辣' }],
  ['测试', 'FAIL test/parser.test.ts ✕ 解析器 应忽略行尾注释', { preset: '中辣' }],
  ['异常', 'catch {} 是空的，建议处理异常', { preset: '干辣' }],
  ['提交', 'fix: 修复登录偶发失败', { preset: '微辣' }],
  ['密钥', 'WARNING: .env 已被 git 跟踪', { preset: '中辣' }],
  ['时区', '报告日期比实际早一天', { preset: '特辣', seed: 7 }],
]

for (const [label, text, knobs] of topics) {
  const result = rewrite(text, knobs)
  emit(`\n${hr('·')} ${label} ｜ 输入：${text}`)
  emit(result.script.split('\n').map((l) => '  ' + l).join('\n'))
}

/* ------------------------------------------------- 第四幕：旋钮对照 */

emit(title('第四幕 · 同一段输入，四档火力（形状真的不一样）'))
emit('\n输入固定为：Error: Cannot find module \'lodash\'\n')

for (const preset of ['微辣', '中辣', '特辣', '变态辣']) {
  const result = rewrite("Error: Cannot find module 'lodash'", { preset, seed: 3 })
  const lines = result.script.split('\n').length
  emit(`\n${hr('·')} ${preset}（${lines} 行）`)
  emit(result.script.split('\n').map((l) => '  ' + l).join('\n'))
}

/* ------------------------------------------------- 第五幕：密度=0 */

emit(title('第五幕 · 干辣：一次招牌台词都不说，照样认得出是这个梗'))
emit(
  rewrite("Error: Cannot find module 'lodash'", { preset: '干辣', seed: 5 }).script
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n'),
)

/* ------------------------------------------------- 收尾 */

emit(title('附：五个预设档的旋钮取值'))
for (const [name, knobs] of Object.entries(PRESETS)) {
  emit(`  ${name.padEnd(4, '　')}  槽位 ${knobs.slots}  密度 ${String(knobs.density).padStart(3)}%  翻转 ${knobs.flip}`)
}
emit('\n每个领域都有自己的剧本候选，seed 换台词不换骨架；同一输入永远同一输出。\n')
writeFileSync('test/demo-output.txt', collected.join('\n'), 'utf8')
