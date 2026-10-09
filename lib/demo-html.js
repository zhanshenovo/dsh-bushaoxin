/**
 * 演示页：一个自包含的 HTML，给观众直观看「同一段输入，装上插件前后差在哪」。
 *
 * 设计取舍：
 *   - 左半边永远是「标准助手」会怎么讲，右半边是引擎的真实输出 —— 对比才是重点，功能列表不是。
 *   - 火力切换在客户端完成（数据一次性内嵌），所以现场点按钮是瞬时的，不依赖网络。
 *   - 页面上出现的每个字都来自 demoOutput()，也就是 rewrite() 的真产物，没有手写文案。
 */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 内嵌 JSON 时要挡住 </script> 这种提前闭合。 */
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, (m) => (m === '\u2028' ? '\\u2028' : '\\u2029'))
}

/** 火力 → 烧心指数：让观众一眼看出"辣度"是个连续量，不是四个标签。 */
const HEAT = { 微辣: 18, 中辣: 42, 特辣: 74, 变态辣: 92, 干辣: 6 }

const STYLE = `
:root{
  --bg:#fdf8f3; --card:#fff; --ink:#2b2016; --dim:#9c8875; --dim2:#7d6a58;
  --line:#efe3d6; --hot:#d94f2b; --hot2:#f08a3c; --cool:#2f7d5d; --warn:#9a6700;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.7 "Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif}
header{padding:26px 28px 18px;border-bottom:1px solid var(--line);background:#fff}
h1{margin:0 0 6px;font-size:22px;letter-spacing:.5px}
h1 .tag{font-size:13px;font-weight:400;color:var(--dim2);margin-left:8px}
.sub{color:var(--dim2);font-size:13.5px;max-width:880px}
.wrap{max-width:1180px;margin:0 auto;padding:22px 28px 60px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.label{font-size:12.5px;color:var(--dim2);margin:18px 0 8px;letter-spacing:.4px}
.pill{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;
  padding:7px 15px;font-size:13.5px;cursor:pointer;transition:.15s}
.pill:hover{border-color:var(--hot2)}
.pill[aria-pressed="true"]{background:var(--hot);border-color:var(--hot);color:#fff;font-weight:600}
.pill.sm{padding:5px 12px;font-size:12.5px}
.pill.sm[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:#fff}
.meter{margin:14px 0 2px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 16px}
.meter-top{display:flex;justify-content:space-between;font-size:12.5px;color:var(--dim2);margin-bottom:8px}
.bar{height:10px;border-radius:6px;background:linear-gradient(90deg,#e8f0e2,#f7e3b6,#f09a4a,#d94f2b);position:relative}
.bar i{position:absolute;top:-4px;width:4px;height:18px;border-radius:3px;background:var(--ink);
  transition:left .28s cubic-bezier(.4,1.4,.5,1);left:0}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}
@media(max-width:900px){.grid{grid-template-columns:1fr}}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;
  display:flex;flex-direction:column;min-height:260px}
.panel h2{margin:0;padding:11px 16px;font-size:13px;letter-spacing:.6px;
  border-bottom:1px solid var(--line);background:#fcf7f1;color:var(--dim2);font-weight:600}
.panel.plain h2{background:#f4f6f8;color:#5b6b7a}
.panel.hot h2{background:#fff3ec;color:var(--hot)}
.body{padding:16px 18px;white-space:pre-wrap;word-break:break-word;font-size:14px;flex:1}
.panel.plain .body{color:#4a5a68}
.panel.hot .body{color:var(--ink)}
.truth{margin-top:14px;padding:10px 13px;border-left:3px solid var(--cool);
  background:#f2f9f5;border-radius:0 8px 8px 0;color:#245a44;font-size:13.5px}
.quote{color:var(--hot);font-weight:600}
.sample-src{font-size:12.5px;color:var(--dim2);background:#fbf6f0;border:1px dashed var(--line);
  border-radius:8px;padding:9px 12px;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.stylebox{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-top:22px}
.stylebox h2{margin:0 0 8px;font-size:14px}
.stylebox pre{margin:0;white-space:pre-wrap;font:12.5px/1.65 ui-monospace,Consolas,monospace;
  color:#3c4a56;background:#fbf8f4;border-radius:10px;padding:13px 15px;max-height:340px;overflow:auto}
.knobs{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.knob{font-size:12px;color:var(--dim2);background:#fbf6f0;border:1px solid var(--line);
  border-radius:8px;padding:5px 10px}
.knob b{color:var(--ink)}
footer{margin-top:26px;color:var(--dim2);font-size:12.5px;border-top:1px solid var(--line);padding-top:14px}
code{background:#f4ece4;padding:1px 5px;border-radius:4px;font-size:12.5px}
`

export function renderDemoHtml(data) {
  const payload = jsonForScript(data)

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>不烧心 · 演示</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>不烧心 <span class="tag">dsh-bushaoxin · 现场演示</span></h1>
  <p class="sub">
    助手每天都在说「别用 <code>--force</code>」「这个测试先别 skip」。这些话都对，但你记不住 ——
    因为它们形式和内容都太像背景音。<b>不烧心只做一件事：给这些警告换一个归因框架。</b>
    左半边是标准助手的说法，右半边是装了插件之后的说法，技术信息完全一致。
  </p>
</header>

<div class="wrap">
  <div class="label">① 选一个技术话题</div>
  <div class="row" id="samples"></div>

  <div class="label">② 选火力（辣度是旋钮的组合，不是音量）</div>
  <div class="row" id="flavors"></div>

  <div class="meter">
    <div class="meter-top"><span>烧心指数（越大越"辣"）</span><span id="heatLabel">—</span></div>
    <div class="bar"><i id="heatPin"></i></div>
  </div>

  <div class="sample-src" id="srcLine"></div>

  <div class="grid">
    <section class="panel plain">
      <h2>标准助手会怎么说</h2>
      <div class="body" id="plainBody"></div>
    </section>
    <section class="panel hot">
      <h2 id="hotTitle">装了不烧心 · 特辣</h2>
      <div class="body" id="hotBody"></div>
    </section>
  </div>

  <div class="stylebox">
    <h2>③ 文风层：这段正文是真的写进了系统提示</h2>
    <p class="sub" style="margin:0 0 10px">
      它不是事后贴上去的。回复在<b>生成前</b>就收到了它，所以从一开始就是那个风格。
      （宿主没有提供改写助手回复的钩子，这条路是唯一有效的。）
    </p>
    <pre>${esc(data.styleSection)}</pre>
  </div>

  <footer>
    页面上每一个字都来自 <code>rewrite()</code> 的真实输出，没有手写文案。同一输入永远同一输出。<br>
    两条底线：每篇末尾<b>永远</b>附一行真实技术结论，不可关闭；梗后面绝不编造技术事实。段子可以让路，事实不行。
  </footer>
</div>

<script>
const DATA = ${payload}
const HEAT = ${jsonForScript(HEAT)}
let sampleId = DATA.samples[0].id
let flavor = '特辣'

function render(){
  const s = DATA.samples.find(x => x.id === sampleId)
  document.getElementById('srcLine').textContent = '输入：' + s.text
  document.getElementById('plainBody').textContent = s.plain

  const script = s.results[flavor] || ''
  const marked = script
    .replace(/^📍 \\*\\*技术真话\\*\\*：.*$/m, '')
    .replace(/贵是贵了点，但吃了不烧心/g, '<span class="quote">贵是贵了点，但吃了不烧心</span>')
    .trimEnd()
  const truthMatch = script.match(/^📍 \\*\\*技术真话\\*\\*：(.*)$/m)
  const truth = truthMatch ? truthMatch[1] : ''
  document.getElementById('hotTitle').textContent = '装了不烧心 · ' + flavor + '（' + s.level + '）'
  document.getElementById('hotBody').innerHTML =
    marked + (truth ? '<div class="truth">📍 ' + truth + '</div>' : '')

  const heat = HEAT[flavor] ?? 0
  document.getElementById('heatPin').style.left = 'calc(' + heat + '% - 2px)'
  document.getElementById('heatLabel').textContent = heat + ' / 100 · ' + flavor
}

function pills(host, items, isOn, onPick){
  host.innerHTML = ''
  for (const item of items){
    const b = document.createElement('button')
    b.className = 'pill' + (item.small ? ' sm' : '')
    b.type = 'button'
    b.textContent = item.label
    b.setAttribute('aria-pressed', String(isOn(item.value)))
    b.onclick = () => onPick(item.value)
    host.appendChild(b)
  }
}

function paint(){
  pills(document.getElementById('samples'),
    DATA.samples.map(s => ({ label: s.label, value: s.id })),
    v => v === sampleId,
    v => { sampleId = v; paint() })
  pills(document.getElementById('flavors'),
    DATA.flavors.map(f => ({ label: f, value: f, small: true })),
    v => v === flavor,
    v => { flavor = v; paint() })
  render()
}

paint()
</script>
</body>
</html>`
}
