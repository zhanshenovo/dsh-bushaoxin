/**
 * 往 fork 里写入市场收录条目。
 *
 * 走 GitHub Contents API，不克隆仓库 —— 上游有 1000+ 条目文件，
 * 为了提交一个文件去克隆整棵树不划算（之前就是卡在那一步）。
 *
 * 刚 fork 出来的仓库 GitHub 侧要几十秒才初始化好，所以带重试。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const OWNER = 'zhanshenovo'
const REPO = 'awesome-dsh-plugin'
const PATH = 'data/plugins/zhanshenovo__dsh-bushaoxin.yml'
const MESSAGE = 'Add zhanshenovo/dsh-bushaoxin'

const content = readFileSync('tools/_b64.txt', 'utf8').trim()
console.log(`载荷长度: ${content.length}`)

const run = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/** 调用一次写入；返回 null 表示成功，否则是错误文本。 */
function attempt() {
  try {
    const out = run([
      'api', '-X', 'PUT', `repos/${OWNER}/${REPO}/contents/${PATH}`,
      '-f', `message=${MESSAGE}`,
      '-f', `content=${content}`,
      '-f', 'branch=main',
    ])
    const parsed = JSON.parse(out)
    return { ok: true, sha: parsed.commit?.sha, url: parsed.content?.html_url }
  } catch (error) {
    const stderr = String(error.stderr ?? error.message)
    return { ok: false, error: stderr.trim().split('\n')[0] }
  }
}

let last = null
for (let i = 1; i <= 8; i += 1) {
  const result = attempt()
  if (result.ok) {
    console.log(`\n✅ 写入成功（第 ${i} 次尝试）`)
    console.log(`   commit: ${result.sha}`)
    console.log(`   文件:   ${result.url}`)
    process.exit(0)
  }
  last = result.error
  console.log(`  第 ${i} 次失败: ${result.error}`)
  execFileSync('node', ['-e', 'setTimeout(()=>{},1)'], { stdio: 'ignore' })
  // gh 没有 sleep，用 PowerShell 等
  try { execFileSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 8'], { stdio: 'ignore' }) } catch { /* ignore */ }
}

console.log(`\n❌ 八次都没成功。最后一次错误：\n${last}`)
process.exit(1)
