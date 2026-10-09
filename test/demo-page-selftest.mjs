/**
 * 演示页自测：页面是给人看的，但它的正确性可以断言。
 *
 * 重点防的是两类事故：
 *   1. 模板拼错 —— 页面里出现 undefined / [object Object] / 未替换的占位符；
 *   2. 数据没进去 —— 观众点按钮时右边是空的。
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { DEMO_SAMPLES, PRESETS, demoOutput } from '../lib/drama.js'
import { renderDemoHtml } from '../lib/demo-html.js'

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

const data = demoOutput()
const html = renderDemoHtml(data)

test('演示数据覆盖所有样板与火力', () => {
  assert.equal(data.samples.length, DEMO_SAMPLES.length)
  assert.ok(data.samples.length >= 6, '样板太少，台上不够讲')
  const flavors = Object.keys(PRESETS)
  for (const sample of data.samples) {
    for (const flavor of flavors) {
      assert.ok(sample.results[flavor]?.length > 20, `${sample.id} 缺 ${flavor} 的产物`)
    }
  }
})

test('每段产物都带技术真话', () => {
  for (const sample of data.samples) {
    assert.ok(sample.plain.length > 10, `${sample.id} 缺标准助手说法`)
    for (const script of Object.values(sample.results)) {
      assert.match(script, /📍 \*\*技术真话\*\*/, `${sample.id} 的产物缺真话`)
    }
  }
})

test('HTML 无未替换占位符、无 undefined', () => {
  assert.ok(!html.includes('undefined'), 'HTML 里出现了 undefined')
  assert.ok(!html.includes('[object Object]'), 'HTML 里出现了 [object Object]')
  assert.ok(!/\$\{/.test(html), 'HTML 里残留了模板占位符')
})

test('HTML 内嵌的数据能在页面里被解析', () => {
  const match = html.match(/const DATA = (\{.*?\})\nconst HEAT/s)
  assert.ok(match, '页面里找不到 DATA 载荷')
  const parsed = JSON.parse(match[1].replace(/\\u003c/g, '<'))
  assert.equal(parsed.samples.length, DEMO_SAMPLES.length)
  assert.ok(parsed.styleSection.includes('不烧心文风'), 'styleSection 没进去')
})

test('HTML 关掉了 </script> 提前闭合的风险', () => {
  // 先确认样板里真的含 <，否则这条防线是空跑的。
  assert.ok(DEMO_SAMPLES.some((s) => s.text.includes('<')), '样板里没有 < ，转义逻辑没被验证过')
  const closes = html.split('</script>').length - 1
  assert.equal(closes, 1, `结束标签应只出现一次（页面收尾），实际 ${closes} 次`)
  assert.ok(html.includes('\\u003c'), 'jsonForScript 应该把 < 转义掉')
})

test('HTML 自带对比结构：左标准、右不烧心', () => {
  assert.ok(html.includes('标准助手会怎么说'), '缺少左半边')
  assert.ok(html.includes('装了不烧心'), '缺少右半边')
  assert.ok(html.includes('烧心指数'), '缺少辣度指示')
  assert.ok(html.includes('文风层'), '缺少文风层解释')
})

test('HTML 自包含，不依赖外部资源', () => {
  assert.ok(!/<link[^>]+href=/i.test(html), '不该有外部样式表')
  assert.ok(!/<script[^>]+src=/i.test(html), '不该有外部脚本')
  assert.ok(html.startsWith('<!doctype html>'))
})

test('页面能生成并落盘（供人工过目）', () => {
  assert.ok(html.length > 4000, `页面太小：${html.length}`)
  writeFileSync('test/demo-page.html', html, 'utf8')
})

console.log(checks.join('\n'))
console.log(`\n${passed}/${checks.length} 通过`)
if (process.exitCode === 1) console.log('有断言失败，别拿去演示。')
