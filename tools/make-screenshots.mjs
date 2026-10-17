/**
 * 生成 screenshots.json 用的截图资产。
 *
 * 市场条目支持在插件仓库里放一组截图（`screenshots.json` 列路径），
 * 列表页/详情页会展示 —— 这是别人判断"要不要装"时唯一会看的东西。
 *
 * 源图是 test/cards/ 下那 9 张 1080×1080 卡片（由 npm run cards 生成）。
 * 这里转成 JPEG 并压到合理体积：PNG 一张 500KB，JPEG 只要 100KB 上下。
 *
 * 跑法：node tools/make-screenshots.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, statSync } from 'node:fs'

const SRC = 'test/cards'
const OUT = 'screenshots'
const PY = 'C:\\Users\\li123\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe'

mkdirSync(OUT, { recursive: true })

const cards = readdirSync(SRC)
  .filter((f) => /^card\d+\.png$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))

if (cards.length === 0) {
  console.error('没找到 test/cards/card*.png —— 先跑 npm run cards')
  process.exit(1)
}

const script = `
from PIL import Image
import os
cards = ${JSON.stringify(cards)}
for name in cards:
    src = os.path.join(${JSON.stringify(SRC)}, name)
    dst = os.path.join(${JSON.stringify(OUT)}, name.replace('.png', '.jpg'))
    im = Image.open(src).convert('RGB')
    # 列表页用不到 1080 宽，900 足够，体积再降一档
    im = im.resize((900, 900), Image.LANCZOS)
    im.save(dst, quality=86, optimize=True, progressive=True)
    print(dst, str(os.path.getsize(dst) // 1024) + ' KB')
`
execFileSync(PY, ['-c', script], { stdio: 'inherit' })

const made = readdirSync(OUT).filter((f) => f.endsWith('.jpg')).sort()
const total = made.reduce((n, f) => n + statSync(`${OUT}/${f}`).size, 0)
console.log(`\n共产出 ${made.length} 张，合计 ${(total / 1024 / 1024).toFixed(2)} MB`)
