/**
 * 可录屏的演示幻灯片：把 A 版（技术向）做成一页 HTML。
 *
 * 为什么这么做：这台机器没有 ffmpeg、没有录屏软件，我无法合成视频。
 * 但可以用 Edge 打开这一页，按录制，然后按 → 翻页 —— 视觉部分就不用在剪辑软件里排了。
 *
 * 分镜数据来自 test/deck-data.mjs（与字幕同一个源），这里只负责渲染。
 *
 * 跑法：node test/video-deck.mjs  →  test/video-deck.html
 */
import { writeFileSync } from 'node:fs'
import { SLIDES, TOTAL_SECONDS, totalLabel } from './deck-data.mjs'
import { domainInfo } from '../lib/drama.js'

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 渲染用的数据：把三连切的招牌从领域表里取好（不要解析渲染文本）。 */
const RENDER_SLIDES = SLIDES.map((slide) => {
  if (slide.kind !== 'triple') return { ...slide, lines: slide.lines?.map(esc) }
  return {
    ...slide,
    items: slide.items.map((item) => {
      const info = domainInfo(item.domain)
      return { ...item, slogan: info?.slogans?.[0] ?? '', dear: info?.dear?.join('，') ?? '' }
    }),
  }
})

/** 内嵌 JSON 时要挡住 </script> 这种提前闭合。 */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028|\u2029/g, (m) => (m === '\u2028' ? '\\u2028' : '\\u2029'))
}

const HEAT = { 微辣: 18, 中辣: 42, 特辣: 74, 变态辣: 92, 干辣: 6 }

const STYLE = `
:root{
  --bg:#0d1117; --panel:#161b22; --line:#30363d; --ink:#e6edf3; --dim:#8b949e;
  --hot:#f0883e; --hot2:#ff7b72; --cool:#3fb950; --mono:ui-monospace,"Cascadia Mono",Consolas,monospace;
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);overflow:hidden;
  font:16px/1.7 "Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif}
#stage{position:absolute;inset:0;display:flex;flex-direction:column;padding:52px 64px 40px}
.tag{display:flex;justify-content:space-between;color:var(--dim);font-size:13px;letter-spacing:.5px}
.body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:18px;min-height:0}
h1{margin:0;font-size:44px;line-height:1.3;letter-spacing:.5px}
.big{color:var(--hot);font-weight:700}
.dim{color:var(--dim)}
pre{margin:0;font-family:var(--mono);font-size:17px;line-height:1.65;white-space:pre-wrap;
  background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:22px 24px;
  max-height:52vh;overflow:auto}
.cmd{font-family:var(--mono);font-size:19px;color:var(--cool);
  background:#0b2b16;border:1px solid #1f6f3d;border-radius:10px;padding:16px 20px}
.cmd::before{content:"$ ";color:var(--dim)}
.hl{background:#4a1d13;border-left:4px solid var(--hot2);border-radius:0 8px 8px 0;padding:12px 16px;
  font-family:var(--mono);font-size:17px;color:#ffd7cc}
.montage{font-family:var(--mono);font-size:15px;color:#6e7681;column-count:2;column-gap:36px;
  max-height:44vh;overflow:hidden}
.montage div{margin-bottom:9px;opacity:.75}
.triple{display:flex;gap:18px}
.triple > div{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}
.triple h3{margin:0 0 10px;font-size:15px;color:var(--dim);font-weight:600;letter-spacing:1px}
.triple p{margin:0;font-size:17px;color:var(--hot)}
.slider{display:flex;align-items:center;gap:22px;background:var(--panel);
  border:1px solid var(--line);border-radius:14px;padding:26px 30px}
.track{flex:1;height:10px;border-radius:6px;
  background:linear-gradient(90deg,#e8f0e2,#f7e3b6,#f09a4a,#d94f2b);position:relative}
.knob{position:absolute;top:-9px;width:28px;height:28px;border-radius:50%;background:#fff;
  border:3px solid #d94f2b;left:66%;transition:left .5s ease}
.stops{display:flex;justify-content:space-between;margin-top:34px;color:var(--dim);font-size:15px}
.stops b{color:var(--hot)}
footer{display:flex;justify-content:space-between;align-items:center;color:var(--dim);font-size:13px}
#notes{position:absolute;left:0;right:0;bottom:0;background:#1c2128;border-top:1px solid var(--line);
  padding:18px 64px 22px;font-size:17px;line-height:1.65;color:#c9d1d9}
#notes .lbl{color:var(--hot);font-size:12px;letter-spacing:1px;margin-bottom:6px}
body.hidenotes #notes{display:none}
.progress{position:absolute;top:0;left:0;height:3px;background:var(--hot);transition:width .25s}
`

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>不烧心 · 录屏幻灯片（A 版 技术向 ${totalLabel()}）</title>
<style>${STYLE}</style>
</head>
<body>
<div class="progress" id="bar"></div>
<div id="stage">
  <div class="tag"><span id="at"></span><span id="hint">← → 翻页 · N 显示/隐藏提词 · 录制时请隐藏提词</span></div>
  <div class="body" id="body"></div>
  <footer><span id="visual"></span><span id="dur"></span></footer>
</div>
<div id="notes"><div class="lbl">旁白提词</div><div id="narration"></div></div>

<script>
const SLIDES = ${jsonForScript(RENDER_SLIDES)}
let i = 0

function el(tag, cls, text){
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

function render(){
  const s = SLIDES[i]
  document.getElementById('at').textContent = '镜头 ' + (i + 1) + '/' + SLIDES.length + ' · ' + s.at
  document.getElementById('visual').textContent = '画面：' + s.visual
  document.getElementById('dur').textContent = '停留约 ' + s.dur + ' 秒'
  document.getElementById('narration').textContent = s.narration
  document.getElementById('bar').style.width = ((i + 1) / SLIDES.length * 100) + '%'

  const body = document.getElementById('body')
  body.innerHTML = ''
  const add = (node) => body.appendChild(node)

  if (s.command) add(el('div', 'cmd', s.command))

  if (s.kind === 'montage'){
    const box = el('div', 'montage')
    for (const line of s.lines) box.appendChild(el('div', null, line))
    add(box)
  } else if (s.lines){
    const pre = el('pre')
    pre.textContent = s.lines.join('\\n')
    add(pre)
  }

  if (s.highlight) add(el('div', 'hl', s.highlight))

  if (s.kind === 'triple'){
    const row = el('div', 'triple')
    for (const item of s.items){
      const card = el('div')
      card.appendChild(el('h3', null, item.label + ' · ' + item.preset))
      card.appendChild(el('p', null, '「' + item.slogan + '」'))
      row.appendChild(card)
    }
    add(row)
  }

  if (s.kind === 'slider'){
    const wrap = el('div')
    const box = el('div', 'slider')
    box.appendChild(el('span', 'dim', '强度'))
    const track = el('div', 'track')
    track.appendChild(el('div', 'knob'))
    box.appendChild(track)
    wrap.appendChild(box)
    const stops = el('div', 'stops')
    for (const stop of s.stops) stops.appendChild(el('b', null, stop))
    wrap.appendChild(stops)
    add(wrap)
    // 让滑块慢慢左右动，录制时有动态感。
    setTimeout(() => {
      const knob = document.querySelector('.knob')
      if (!knob) return
      let step = 0
      const timer = setInterval(() => {
        if (!document.body.contains(knob)){ clearInterval(timer); return }
        step = (step + 1) % 4
        knob.style.left = (step * 30 + 2) + '%'
      }, 900)
    }, 300)
  }

  if (s.big) add(el('h1', 'big', s.big))
  if (s.big2) add(el('h1', null, s.big2))
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown'){
    i = Math.min(SLIDES.length - 1, i + 1); render()
  } else if (event.key === 'ArrowLeft' || event.key === 'PageUp'){
    i = Math.max(0, i - 1); render()
  } else if (event.key === 'n' || event.key === 'N'){
    document.body.classList.toggle('hidenotes')
  }
})

render()
</script>
</body>
</html>`

writeFileSync('test/video-deck.html', html, 'utf8')
console.log(`录屏幻灯片：test/video-deck.html（${SLIDES.length} 屏，共 ${TOTAL_SECONDS} 秒 = ${totalLabel()}）`)
