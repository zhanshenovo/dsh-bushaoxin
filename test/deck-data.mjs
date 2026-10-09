/**
 * 视频分镜数据（A 版 · 技术向）—— **唯一真相**。
 *
 * 之前这份数据在 video-deck.mjs 和 video-subtitles.mjs 里各抄了一份，
 * 结果改了一处忘了另一处，幻灯片说 90 秒、字幕算出 94 秒。
 * 现在两边都从这里读，不存在"对不上"的可能。
 */
import { rewrite } from '../lib/drama.js'

/** 把 mm:ss 换算成秒。 */
export function secondsOf(at) {
  const [m, s] = String(at).split(':').map(Number)
  return m * 60 + s
}

export const SLIDES = [
  {
    at: '0:00', kind: 'command', dur: 6, big: null,
    visual: '终端特写：手正在敲 npm install --force（画面定格）',
    command: '$ npm install --force',
    narration: '等一下。',
  },
  {
    at: '0:06', kind: 'quote', dur: 9,
    visual: '切助手回复（标准版）',
    big: '正确的废话',
    lines: ['不建议使用 --force，它会导致 lockfile 与 package.json 不一致，', '可能引发构建失败。'],
    narration: '这句话是对的。但它没用。',
  },
  {
    at: '0:15', kind: 'montage', dur: 11,
    visual: '快速蒙太奇：满屏技术提示滚动',
    big: '每天看几百条',
    lines: [
      '不建议直接修改生成文件',
      '注意这里存在潜在的竞态条件',
      '该接口不建议在生产环境使用',
      '建议补充边界用例的单元测试',
      '请确认时区处理是否符合预期',
      '考虑将这段逻辑抽取为独立函数',
      '注意内存泄漏风险，建议手动释放',
      '此处存在 SQL 注入风险，请使用参数化查询',
    ],
    narration: '因为它跟我们每天看的几百条提示，长得一模一样。',
  },
  {
    at: '0:26', kind: 'statement', dur: 8,
    visual: '黑屏 + 大字',
    big: '它不改代码，不改模型，不提效率。',
    big2: '它改的只是你听警告时的注意力。',
    narration: '不烧心想干的事只有一件：它不改代码，不改模型，不提效率。它改的只是你听警告时的注意力。',
  },
  {
    at: '0:34', kind: 'rewrite', dur: 22,
    visual: '录屏：敲命令，输出滚动',
    command: '/bushaoxin_rewrite preset=特辣 npm install --force 之后本地能跑，CI 挂了',
    lines: rewrite('npm install --force 之后本地能跑，CI 挂了', { preset: '特辣' }).script.split('\n'),
    highlight: '充值即送 --force，三秒解决，包过。',
    narration: '同一条建议，换一种说法——隔壁那家「一键装依赖」的店挂出招牌：「充值即送 --force，三秒解决，包过。」三分钟后，构建在 CI 上翻车。',
  },
  {
    at: '0:56', kind: 'truth', dur: 8,
    visual: '镜头推到输出最后一行',
    big: '技术信息一个字没少',
    lines: ['📍 技术真话：--force 会让 lockfile 与 package.json 脱节，', '本地能跑、CI 挂掉。先 git diff package-lock.json 再决定要不要留。'],
    narration: '技术信息一个字没少。少的是「你听完就忘」这件事。',
  },
  {
    at: '1:04', kind: 'triple', dur: 14,
    visual: '三连快切：异常 / 时区 / 密钥，各 4 秒',
    big: '每个领域，换一套行话',
    items: [
      { label: '异常', domain: '异常', preset: '干辣', text: 'catch {} 是空的，建议处理异常或至少记录日志' },
      { label: '时区', domain: '时区', preset: '中辣', text: '报告日期比实际早一天，跨时区的活动都归错了' },
      { label: '密钥', domain: '密钥', preset: '特辣', text: '本地 .env 能跑，数据不对查了一下午' },
    ],
    narration: '它也不是复读一句台词。换个话题——异常它说「账要记」，时区它说「钟要对得上灶」，密钥它说「钥匙不进仓库」。同一个骨架，每个领域换一套行话。',
  },
  {
    at: '1:18', kind: 'slider', dur: 8,
    visual: '滑条 UI：点开 → 拖动 → 数值变化（这段需要真实 GUI 录屏）',
    big: '辣度你说了算',
    stops: ['关', '轻', '中', '重'],
    narration: '辣度你说了算。点开滑条，四档：关、轻、中、重。拖一下就行。',
  },
  {
    at: '1:26', kind: 'outro', dur: 8,
    visual: '黑屏 + 两行字',
    big: '段子可以让路，事实不行。',
    big2: 'dsh-bushaoxin · 不烧心',
    narration: '但有一条是写死的：每篇末尾永远附一行真实技术结论。段子可以让路，事实不行。不烧心。',
  },
]

/** 整支片的真实长度：最后一屏的起点 + 它的时长。 */
export const TOTAL_SECONDS = secondsOf(SLIDES[SLIDES.length - 1].at) + SLIDES[SLIDES.length - 1].dur

/** 每屏占用的时间窗（到下一屏开始为止）。 */
export function windowOf(index) {
  const start = secondsOf(SLIDES[index].at)
  const end = index + 1 < SLIDES.length ? secondsOf(SLIDES[index + 1].at) : start + SLIDES[index].dur
  return { start, end, span: end - start }
}

/** mm:ss 形式的总长，给文案用。 */
export function totalLabel() {
  const m = Math.floor(TOTAL_SECONDS / 60)
  const s = TOTAL_SECONDS % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
