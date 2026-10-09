/**
 * 图文平台素材（小黑盒 / 小红书这类）：9 张 1080×1080 卡片 + 上屏文案。
 *
 * 为什么是卡片：图文社区靠"划过一屏就懂一屏"，纯长文没人看。
 * 每张卡一个意思，第 2 张给痛点，第 3 张给对比，第 4 张给结果。
 *
 * 跑法：node test/cards.mjs  →  test/cards.html（9 张卡竖排，逐张截图）
 *                              test/图文稿.md（帖子正文 + 每卡文案）
 */
import { writeFileSync } from 'node:fs'
import { rewrite } from '../lib/drama.js'

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* 卡片内容：每张 = 一个意思。文案是这一版的"上屏文本"。 */
const CARDS = [
  {
    kind: 'cover',
    eyebrow: 'DeepSeek Harness 插件',
    big: '不烧心',
    bigEn: 'BUSHAOXIN',
    sub: '把技术警告换成你记得住的说法',
    foot: '开源 · 本地安装 · 35 项测试',
  },
  {
    kind: 'pain',
    kicker: '01 · 痛点',
    title: '这句话是对的',
    title2: '但它没用',
    lines: ['「不建议使用 --force，它会导致 lockfile 与', 'package.json 不一致，可能引发构建失败。」'],
    foot: '它和我们每天看的几百条提示，长得一模一样',
  },
  {
    kind: 'compare',
    kicker: '02 · 换一种说法',
    title: '同一条建议，两种讲法',
    left: { label: '标准助手', lines: ['不建议使用 --force，', '会导致构建失败。'] },
    right: { label: '装了不烧心', lines: [] },
    foot: '技术信息一个字没少',
  },
  {
    kind: 'result',
    kicker: '03 · 结果长这样',
    title: '它开始用黑心店讲 --force',
    lines: rewrite('npm install --force 之后本地能跑，CI 挂了', { preset: '特辣' }).script.split('\n'),
    foot: '留在最后的，永远是真实技术结论',
  },
  {
    kind: 'grid',
    kicker: '04 · 不复读同一句',
    title: '每个领域，换一套行话',
    items: [
      { label: '依赖', text: '锁要对得上版，版要对得上货' },
      { label: '异常', text: '账要记' },
      { label: '时区', text: '钟要对得上灶' },
      { label: '密钥', text: '钥匙不进仓库' },
      { label: '测试', text: '秤先校，再谈肉价' },
      { label: '成本', text: '钱要花在明细上' },
    ],
    foot: '骨架不变，说法每次都新',
  },
  {
    kind: 'dial',
    kicker: '05 · 辣度你说了算',
    title: '点一下，拉出滑条',
    stops: ['关', '轻', '中', '重'],
    notes: ['完全不用梗', '一段最多一次', '每两三轮一次', '基本每轮都带'],
    foot: '拖错了再拖回去，不用重启',
  },
  {
    kind: 'honest',
    kicker: '06 · 说点实话',
    title: '它不提升效率',
    lines: ['它不改代码，不改模型，不加功能。', '它改的只是你听警告时的注意力。'],
    foot: '往"提升效率"上写就是骗人，装上发现啥也没多，信任就没了',
  },
  {
    kind: 'bottom',
    kicker: '07 · 两条底线',
    title: '段子可以让路，事实不行',
    items: [
      '每篇末尾永远附一行真实技术结论，代码层面不可关闭',
      '绝不为配合段子编造技术事实',
      '排查线上事故时自动切回正常表达',
    ],
    foot: '糖衣会化，药还在',
  },
  {
    kind: 'end',
    big: '不烧心',
    sub: 'dsh-bushaoxin',
    lines: ['贵是贵了点，但吃了不烧心'],
    foot: '装完在输入框上方点「不烧心」即可调档',
  },
]

/* ---------------------------------------------------------------- 视觉 */

const STYLE = `
:root{--bg:#040913;--panel:#0b1730;--ink:#e8eefb;--dim:#8fa6c8;--cyan:#22d3ee;--yel:#ecf548;--line:#1c2c4a}
*{box-sizing:border-box}
body{margin:0;background:#141414;font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif}
.wrap{display:flex;flex-direction:column;align-items:center;gap:28px;padding:28px}
.card{position:relative;width:1080px;height:1080px;overflow:hidden;
  background:radial-gradient(110% 80% at 78% 30%, #16305c 0%, #0a1730 40%, #040913 74%), #040913;
  color:var(--ink);padding:88px 84px;display:flex;flex-direction:column}
.grid{position:absolute;inset:0;opacity:.05;
  background-image:linear-gradient(#8fb6ff 1px,transparent 1px),linear-gradient(90deg,#8fb6ff 1px,transparent 1px);
  background-size:64px 64px}
.blob{position:absolute;right:-160px;top:-160px;width:620px;height:620px;border-radius:50%;
  background:radial-gradient(closest-side, rgba(34,211,238,.12), transparent 70%)}
.kicker{font-size:30px;font-weight:700;letter-spacing:3px;color:var(--cyan)}
.title{font-size:74px;font-weight:900;line-height:1.18;letter-spacing:2px;margin-top:20px}
.title .y{color:var(--yel)}
.body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:30px;min-height:0}
/* 内容比一屏少时，别让它撑满：留白集中在底部，构图更稳。 */
.body.tight{flex:0 1 auto;justify-content:flex-start;margin-top:26px}
.foot{margin-top:auto;font-size:30px;line-height:1.6;color:var(--dim);font-weight:600}

/* 封面卡 */
.cover{padding:0;display:flex;flex-direction:column;justify-content:center;padding:96px 88px}
.eyebrow{font-size:32px;font-weight:700;letter-spacing:2px;color:var(--cyan)}
.bigEn{font-size:112px;font-weight:800;letter-spacing:3px;line-height:1;margin-top:18px}
.bigEn .c{color:var(--cyan)}
.bigZh{font-size:206px;font-weight:900;line-height:1.02;letter-spacing:12px;color:var(--yel);
  -webkit-text-stroke:9px #05070f;paint-order:stroke fill;margin-top:6px}
.coversub{font-size:40px;font-weight:700;color:#dbe8ff;margin-top:26px}
.coverfoot{position:absolute;left:88px;bottom:78px;font-size:29px;color:var(--dim);font-weight:600}

.quote{background:rgba(255,255,255,.045);border-left:8px solid var(--line);border-radius:0 16px 16px 0;
  padding:30px 34px;font-family:ui-monospace,Consolas,monospace;font-size:34px;line-height:1.6;color:#c9d8f0}
pre{margin:0;white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;font-size:27px;line-height:1.62;
  background:rgba(255,255,255,.05);border:2px solid var(--line);border-radius:18px;padding:34px 36px;color:#dbe8ff}
.hl{margin-top:8px;background:rgba(255,123,114,.14);border-left:8px solid #ff7b72;border-radius:0 14px 14px 0;
  padding:22px 28px;font-family:ui-monospace,Consolas,monospace;font-size:32px;color:#ffd7cc}

/* 对比卡 */
.vs{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}
.side{background:rgba(255,255,255,.04);border:2px solid var(--line);border-radius:20px;padding:28px 26px}
.side.now{border-color:var(--yel);background:rgba(236,245,72,.07)}
.side h4{margin:0 0 16px;font-size:27px;font-weight:800;color:var(--dim);letter-spacing:1px}
.side.now h4{color:var(--yel)}
.side p{margin:0 0 14px;font-size:26px;line-height:1.55}
.side p:last-child{margin-bottom:0}
.side.now p{color:#fff;font-weight:600}

/* 六宫格 */
.grid6{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.cell{background:rgba(255,255,255,.04);border:2px solid var(--line);border-radius:18px;padding:26px 28px}
.cell b{display:block;font-size:27px;color:var(--cyan);letter-spacing:2px;margin-bottom:12px}
.cell span{font-size:33px;font-weight:700;color:#fff}

/* 滑条卡 */
.dial{background:rgba(255,255,255,.05);border:2px solid var(--line);border-radius:24px;padding:44px 40px}
.track{height:22px;border-radius:12px;position:relative;
  background:linear-gradient(90deg,#e8f0e2,#f7e3b6,#f09a4a,#d94f2b)}
.knob{position:absolute;top:-19px;left:66%;width:60px;height:60px;border-radius:50%;background:#fff;
  border:8px solid #d94f2b;box-shadow:0 8px 26px rgba(0,0,0,.5)}
.stops{display:flex;justify-content:space-between;margin-top:34px;font-size:36px;font-weight:800}
.stops span{color:var(--dim)}
.stops span.on{color:var(--yel)}
.notes{display:flex;justify-content:space-between;margin-top:14px;font-size:22px;color:var(--dim)}

/* 底线卡 */
.checks{display:flex;flex-direction:column;gap:24px}
.check{display:flex;gap:20px;align-items:flex-start;font-size:34px;line-height:1.55}
.check i{flex:0 0 auto;width:44px;height:44px;border-radius:12px;background:var(--yel);color:#05070f;
  font-style:normal;font-weight:900;display:flex;align-items:center;justify-content:center;font-size:28px}

/* 结尾卡 */
.end{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;height:100%}
.end .zh{font-size:180px;font-weight:900;color:var(--yel);letter-spacing:14px;
  -webkit-text-stroke:8px #05070f;paint-order:stroke fill}
.end .en{font-size:40px;color:var(--cyan);letter-spacing:6px;font-weight:700;margin-top:18px}
.end .line{font-size:38px;color:#dbe8ff;font-weight:600;margin-top:44px}
.end .hint{margin-top:auto;font-size:28px;color:var(--dim)}
`

const KICKER = (text) => `<div class="kicker">${esc(text)}</div>`
const TITLE = (text) => `<div class="title">${text}</div>`

function renderCard(card, index) {
  const shell = (inner, extraClass = '') =>
    `<div class="card ${extraClass}" data-card="${index + 1}"><div class="grid"></div><div class="blob"></div>${inner}</div>`

  if (card.kind === 'cover') {
    return shell(`
      <div class="cover">
        <div class="eyebrow">${esc(card.eyebrow)}</div>
        <div class="bigEn">${esc(card.bigEn.slice(0, 2))}<span class="c">${esc(card.bigEn.slice(2))}</span></div>
        <div class="bigZh">${esc(card.big)}</div>
        <div class="coversub">${esc(card.sub)}</div>
      </div>
      <div class="coverfoot">${esc(card.foot)}</div>`)
  }

  if (card.kind === 'pain') {
    return shell(`
      ${KICKER(card.kicker)}
      ${TITLE(`${esc(card.title)}<br><span class="y">${esc(card.title2)}</span>`)}
      <div class="body"><div class="quote">${card.lines.map(esc).join('<br>')}</div></div>
      <div class="foot">${esc(card.foot)}</div>`)
  }

  if (card.kind === 'compare') {
    const sample = rewrite('npm install --force 之后本地能跑，CI 挂了', { preset: '特辣' }).script
    // 只取黑心店那两句，并清掉 Markdown 标记 —— 卡片是给人看的图，不该出现 **。
    const right = sample
      .split('\n')
      .filter((l) => l.includes('挂出招牌') || l.includes('它没说它改了什么'))
      .map((l) => l.replace(/^> /, '').replace(/\*\*/g, ''))
      .slice(0, 2)
    return shell(`
      ${KICKER(card.kicker)}
      ${TITLE(esc(card.title))}
      <div class="body tight"><div class="vs">
        <div class="side"><h4>${esc(card.left.label)}</h4>${card.left.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
        <div class="side now"><h4>${esc(card.right.label)}</h4>${right.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
      </div></div>
      <div class="foot">${esc(card.foot)}</div>`)
  }

  if (card.kind === 'result') {
    // 只留四行：黑心店怎么卖 → 结果 → 物证 → 真话。
    // 整段脚本塞进一屏必然溢出，卡片要的是"一眼看懂"，不是全文。
    const pick = (test) => {
      const line = card.lines.find(test)
      return line === undefined ? null : line.replace(/^> /, '').replace(/\*\*/g, '')
    }
    const rows = [
      pick((l) => l.includes('挂出招牌')),
      pick((l) => l.includes('翻车') || l.includes('CI')),
      pick((l) => l.startsWith('📍')),
    ].filter((l) => l !== null)
    // 不再另外加高亮框：黑心店那句已经在第一行里了，重复出现反而像凑数。
    return shell(`
      ${KICKER(card.kicker)}
      ${TITLE(esc(card.title))}
      <div class="body tight">
        <div class="quote">${rows.map(esc).join('<br>')}</div>
      </div>
      <div class="foot">${esc(card.foot)}</div>`)
  }

  if (card.kind === 'grid') {
    return shell(`
      ${KICKER(card.kicker)}
      ${TITLE(esc(card.title))}
      <div class="body"><div class="grid6">
        ${card.items.map((item) => `<div class="cell"><b>${esc(item.label)}</b><span>${esc(item.text)}</span></div>`).join('')}
      </div></div>
      <div class="foot">${esc(card.foot)}</div>`)
  }

  if (card.kind === 'dial') {
    return shell(`
      ${KICKER(card.kicker)}
      ${TITLE(esc(card.title))}
      <div class="body"><div class="dial">
        <div class="track"><div class="knob"></div></div>
        <div class="stops">${card.stops.map((s, i) => `<span class="${i === 2 ? 'on' : ''}">${esc(s)}</span>`).join('')}</div>
        <div class="notes">${card.notes.map(esc).join('')}</div>
      </div></div>
      <div class="foot">${esc(card.foot)}</div>`)
  }

  if (card.kind === 'honest') {
    return shell(`
      ${KICKER(card.kicker)}
      ${TITLE(`<span class="y">${esc(card.title)}</span>`)}
      <div class="body">${card.lines.map((l) => `<div class="quote">${esc(l)}</div>`).join('')}</div>
      <div class="foot">${esc(card.foot)}</div>`)
  }

  if (card.kind === 'bottom') {
    return shell(`
      ${KICKER(card.kicker)}
      ${TITLE(esc(card.title).replace('事实不行', '<span class="y">事实不行</span>'))}
      <div class="body"><div class="checks">
        ${card.items.map((item, i) => `<div class="check"><i>${i + 1}</i><div>${esc(item)}</div></div>`).join('')}
      </div></div>
      <div class="foot">${esc(card.foot)}</div>`)
  }

  return shell(`
    <div class="end">
      <div class="zh">${esc(card.big)}</div>
      <div class="en">${esc(card.sub)}</div>
      <div class="line">${esc(card.lines[0])}</div>
      <div class="hint">${esc(card.foot)}</div>
    </div>`)
}

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>不烧心 · 图文卡片（${CARDS.length} 张）</title>
<style>${STYLE}</style></head>
<body><div class="wrap">
${CARDS.map(renderCard).join('\n')}
</div>
<script>
/* ?card=3 只显示第 3 张 —— 供逐张截图（渲染 PNG / 手动截图都用这个）。
   带这个参数时同时把页面尺寸收成一张卡，截图出来就是干净的 1080×1080。 */
const want = new URLSearchParams(location.search).get('card')
if (want !== null && want !== ''){
  const n = Number(want)
  const cards = [...document.querySelectorAll('.card')]
  cards.forEach((el, i) => { if (i + 1 !== n) el.remove() })
  document.querySelector('.wrap').style.cssText = 'padding:0;gap:0'
  document.body.style.background = '#040913'
  document.title = 'card-' + n
}
</script>
</body></html>`

writeFileSync('test/cards.html', html, 'utf8')

/* ---------------------------------------------------------------- 图文稿 */

const post = []
post.push('# 不烧心 · 图文稿（小黑盒 / 小红书）')
post.push('')
post.push(`> 共 ${CARDS.length} 张卡片，在 \`test/cards.html\` 里逐张截图。下面每张卡的文案与图对应。`)
post.push('')
post.push('## 帖子正文（直接复制）')
post.push('')
post.push('**标题**：我给 DeepSeek 装了个「不烧心」文风层，它开始用黑心店讲 `--force`')
post.push('')
post.push('---')
post.push('')
post.push('事情是这样的。')
post.push('')
post.push('助手每天都在跟我说「不建议使用 `--force`」「这个测试先别 skip」。')
post.push('')
post.push('这些话都对。但我记不住。因为它们跟我每天看的几百条提示长得一模一样——一句正确的、冷漠的、没有代价感的陈述。')
post.push('')
post.push('所以我做了个小插件，赌一件事：**如果把这句警告换成一个有角色、有代价、有翻车的故事，我下次会想起来。**')
post.push('')
post.push('它做的事就这一件：**不改代码，不改模型，不提效率。只改我听到警告时的注意力。**')
post.push('')
post.push('具体长这样——同一条建议，左边是标准说法，右边是装了之后：')
post.push('')
post.push('> 隔壁那家「一键装依赖」的店挂出招牌：「充值即送 `--force`，三秒解决，包过。」')
post.push('>')
post.push('> 三分钟后构建在 CI 上翻车。那锅料端出来的时候谁都看懂了——它压根没看你的 Node 版本。')
post.push('')
post.push('**技术信息一个字没少。** 少的是"我听完就忘"这件事。')
post.push('')
post.push('它也不是复读一句台词（原梗就是被 AI 批量复读搞腻的）。换个话题，它换一套行话：依赖说「锁要对得上版」，异常说「账要记」，时区说「钟要对得上灶」，密钥说「钥匙不进仓库」。')
post.push('')
post.push('辣度还能自己调。输入框上方点一下「不烧心」，拉出滑条：关 / 轻 / 中 / 重。拖错了再拖回去，不用重启。')
post.push('')
post.push('说点实话：**它不提升效率。** 一个功能都没多。往"提升效率"上写就是骗人，装上发现啥也没多，信任就没了。')
post.push('')
post.push('但有两条例外是写死的：**每篇末尾永远附一行真实技术结论，不可关闭**；**绝不为配合段子编造技术事实**。段子可以让路，事实不行。')
post.push('')
post.push('顺带说个技术边界，免得有人问：宿主**没有**提供改写助手回复的钩子（消息是先写进会话、再发事件的，客户端跟着流式输出实时渲染）。所以只能走生成前注入——把文风写进系统提示，让回复从一开始就是那个风格。')
post.push('')
post.push('贵是贵了点，但吃了不烧心。')
post.push('')
post.push('---')
post.push('')
post.push('## 卡片与配文对照')
post.push('')

const kindLabel = {
  cover: '封面卡', pain: '痛点卡', compare: '对比卡', result: '结果卡',
  grid: '六宫格', dial: '滑条卡', honest: '实话卡', bottom: '底线卡', end: '结尾卡',
}
CARDS.forEach((card, i) => {
  post.push(`### 第 ${i + 1} 张 · ${kindLabel[card.kind] ?? card.kind}`)
  post.push('')
  if (card.big) post.push(`- 主字：**${card.big}**`)
  if (card.title) post.push(`- 标题：${card.title}${card.title2 ? ' / ' + card.title2 : ''}`)
  if (card.kicker) post.push(`- 角标：${card.kicker}`)
  if (card.foot) post.push(`- 底部：${card.foot}`)
  post.push('')
})

post.push('## 截图方法')
post.push('')
post.push('1. 用浏览器打开 `test/cards.html`（Chrome / Edge 均可）')
post.push('2. 每张卡是 1080×1080，逐张截图；或用开发者工具的设备模拟锁 1080×1080')
post.push('3. 小黑盒竖图建议按 1:1 或 4:3 裁，第 1 张当封面')
post.push('')
post.push('## 发布注意')
post.push('')
post.push('- 小黑盒偏社区闲聊口气，正文里**不要出现"训练""模型能力提升"这类词**，会显得像广告')
post.push('- 主动承认"它不提升效率"反而是最加分的一句——坦诚在小黑盒比吹功能管用')
post.push('- 首图放第 1 张（大字封面），第 2、3 张放痛点和对比，钩子留住人再放长文')
post.push('- 有人问"是不是玩具"：**是**。但它是个有原则的玩具——每条都跟真话，且排查故障时自动切回正常表达')

writeFileSync('test/图文稿.md', post.join('\n'), 'utf8')

console.log(`卡片已生成：test/cards.html（${CARDS.length} 张，每张 1080×1080）`)
console.log('图文稿已生成：test/图文稿.md')
