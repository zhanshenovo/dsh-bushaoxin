// 人工验货：把几个真实输入的成品打出来看看观感。
import { rewrite, drama } from '../lib/drama.js'

const samples = [
  ['依赖 · 特辣', "Error: Cannot find module 'lodash'", { preset: '特辣' }],
  ['测试 · 中辣', 'FAIL test/parser.test.ts ✕ 解析器 应忽略行尾注释', { preset: '中辣' }],
  ['异常 · 干辣', '这行 try/catch 是空的，建议处理异常或至少记录日志。', { preset: '干辣' }],
  ['提交 · 微辣', 'fix: 修复登录偶发失败', { preset: '微辣' }],
  ['成本 · 变态辣', '本会话 token 消耗过高，账单吓人', { preset: '变态辣' }],
]

for (const [title, text, knobs] of samples) {
  const result = rewrite(text, knobs)
  console.log(`\n${'='.repeat(72)}\n${title}   [领域=${result.domain}]\n${'='.repeat(72)}`)
  console.log(result.script)
}

console.log(`\n${'='.repeat(72)}\n剧本 · 升级依赖\n${'='.repeat(72)}`)
console.log(drama('升级依赖', { preset: '特辣' }).script)
