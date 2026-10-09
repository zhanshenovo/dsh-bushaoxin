/**
 * 生成 SRT 字幕 + 剪映装配清单（A 版 技术向）。
 *
 * 时间轴来自 test/deck-data.mjs —— 与录屏幻灯片同一份数据。
 * 画面和字幕同源，不会出现"字幕比画面快半秒"这种只能靠肉眼发现的错位。
 *
 * 跑法：node test/video-subtitles.mjs
 * 产物：test/video-subtitles.srt（导入剪映）
 *       test/装配清单.md
 */
import { writeFileSync } from 'node:fs'
import { SLIDES, TOTAL_SECONDS, totalLabel, windowOf } from './deck-data.mjs'
import { domainInfo } from '../lib/drama.js'

/* ---------------------------------------------------------------- 时间工具 */

const stamp = (total) => {
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  const ms = Math.round((total % 1) * 1000)
  const whole = Math.floor(total)
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)},${pad(ms, 3)}`
}

/**
 * 一条字幕该显示多久：按字数估。
 * 真人阅读中文约每秒 5–6 字，这里给宽一点，并夹在 0.9–7 秒之间 ——
 * 太短读不完，太长会一直挡着画面。
 */
function readingTime(text) {
  const chars = [...String(text)].length
  return Math.min(7, Math.max(0.9, 1.0 + chars / 5.5))
}

/** 一屏可能出两条字幕：先讲画面（旁白），再放大字（金句）。 */
function captionsFor(slide) {
  const out = []
  const narration = String(slide.narration ?? '').trim()
  if (narration !== '') {
    const parts = narration.split(/[。？！——]/).map((p) => p.trim()).filter((p) => p.length > 1)
    if (parts.length <= 1) out.push(narration)
    else {
      out.push(parts[0] + '。')
      const rest = parts.slice(1).join('。')
      if (rest.length > 2) out.push(rest + '。')
    }
  }
  // 金句单独出，剪辑时更容易做打字机效果。
  if (slide.kind === 'statement' || slide.kind === 'outro' || slide.kind === 'truth') {
    if (slide.big) out.push(slide.big)
    if (slide.big2) out.push(slide.big2)
  }
  return out.filter((text, i, arr) => text !== '' && arr.indexOf(text) === i)
}

/** 把一屏的字幕铺开；放不下就压缩，但绝不低于 0.9 秒。 */
function layout(texts, span) {
  const wanted = texts.map(readingTime)
  const padOf = (durations) => durations.length > 1
    ? Math.min(0.35, Math.max(0, (span - durations.reduce((a, b) => a + b, 0)) / (durations.length - 1)))
    : 0
  const total = wanted.reduce((a, b) => a + b, 0)
  const budget = span - 0.3
  if (total <= budget) return { durations: wanted, pad: padOf(wanted) }

  const floor = Math.max(0, Math.min(0.9, budget / texts.length))
  const rest = Math.max(0, budget - floor * texts.length)
  const scale = total > 0 ? rest / total : 0
  const durations = wanted.map((d) => floor + d * scale)
  return { durations, pad: padOf(durations) }
}

/* ---------------------------------------------------------------- 生成 SRT */

const lines = []
const plan = []
let cue = 1

SLIDES.forEach((slide, index) => {
  const win = windowOf(index)
  const texts = captionsFor(slide)
  const { durations, pad } = layout(texts, win.span)

  let cursor = win.start
  texts.forEach((text, i) => {
    const from = cursor
    const to = Math.min(win.end - 0.05, from + durations[i])
    lines.push(`${cue}`)
    lines.push(`${stamp(from)} --> ${stamp(to)}`)
    lines.push(text)
    lines.push('')
    cue += 1
    cursor = to + 0.1 + pad
  })

  plan.push({ index: index + 1, slide, win, texts })
})

writeFileSync('test/video-subtitles.srt', lines.join('\n'), 'utf8')

/* ---------------------------------------------------------------- 装配清单 */

const KIND_LABEL = {
  command: '终端命令（定格）',
  quote: '标准版助手回复',
  montage: '满屏提示滚动',
  statement: '黑屏大字',
  rewrite: '改写录屏',
  truth: '推到技术真话',
  triple: '三连快切',
  slider: '滑条交互（需真机录屏）',
  outro: '片尾大字',
}

const md = []
md.push(`# 不烧心 · 剪映装配清单（A 版 技术向 ${totalLabel()}）`)
md.push('')
md.push('> 目标：把手动工作压到 4 步。会出错的地方我都替你算好了。')
md.push('')
md.push('## 四步装完')
md.push('')
md.push('1. **录画面**：用任意录屏工具把 `test/video-deck.html` 从头翻到尾（Edge 打开，`→` 翻页，`N` 隐藏提词）。别管节奏，快速翻完也行，后面按表裁。')
md.push('2. **导入剪映**：新建工程 → 导入录屏 → 拖进主轨。')
md.push('3. **导入字幕**：剪映 → 文本 → 导入字幕 → 选 `test/video-subtitles.srt`。字幕自带时间轴。')
md.push('4. **配音**：文本 → 朗读 → 选音色（推荐云希）→ 按 `test/配音稿.md` 逐段生成 → 拖到音频轨。')
md.push('')
md.push('## 对齐时间轴')
md.push('')
md.push('| 镜头 | 起 | 时长 | 该停多久 | 画面 | 首条字幕 |')
md.push('|---|---|---|---|---|---|')
for (const item of plan) {
  const first = item.texts[0] ?? '（无）'
  md.push(`| ${item.index} | ${item.slide.at} | ${item.win.span}s | ${item.slide.dur}s | ${KIND_LABEL[item.slide.kind] ?? item.slide.kind} | ${first} |`)
}
md.push('')
md.push(`**整支片长 ${totalLabel()}（${TOTAL_SECONDS} 秒）。** 录屏里的每一屏，按"该停多久"那一列裁。`)
md.push('')
md.push('## 三条容易翻车的地方')
md.push('')
md.push('1. **字幕比画面快半秒**：SRT 按"旁白先出、金句后出"排。如果第 4、6、9 镜的大字比画面早，把那条字幕往后拖 0.3 秒。')
md.push('2. **录屏里有提词**：录之前**按一下 `N`** 把底部提词藏掉；来不及的话，在剪映里把画面裁掉底部那一块。')
md.push('3. **配音比画面长**：第 5 镜（22 秒）和第 7 镜（14 秒）最容易超。超了就把该镜画面放慢到 0.95×，或把旁白语速调快一档。')
md.push('')
md.push('## 音乐与音效')
md.push('')
md.push('| 位置 | 建议 |')
md.push('|---|---|')
md.push('| 0:00–0:26 | 轻鼓点，−18 dB，别抢旁白 |')
md.push('| 0:26–0:34 | 鼓点停一下（留白），大字更有力 |')
md.push('| 0:34–1:18 | 加一层暖色旋律，−22 dB |')
md.push(`| ${SLIDES[SLIDES.length - 1].at}–结尾 | 全部淡出，只留旁白最后一句 |`)
md.push('| 音效 | 只在第 5 镜"翻车"处加一记低频闷响 |')
md.push('')
md.push('## 素材索引')
md.push('')
md.push('| 要什么 | 在哪 |')
md.push('|---|---|')
md.push('| 字幕文件（导入剪映） | `test/video-subtitles.srt` |')
md.push('| 可录屏幻灯片（画面源） | `test/video-deck.html` |')
md.push('| 分镜数据（唯一真相） | `test/deck-data.mjs` |')
md.push('| 配音稿（九段） | `test/配音稿.md` |')
md.push('| 全部投屏文本 | `test/video-assets.txt` |')
md.push('| 分镜与逐字稿 | `test/视频制作包.md` |')

writeFileSync('test/装配清单.md', md.join('\n'), 'utf8')

console.log(`SRT：test/video-subtitles.srt（${cue - 1} 条字幕）`)
console.log(`装配清单：test/装配清单.md`)
console.log(`片长：${totalLabel()}（${TOTAL_SECONDS} 秒）`)
