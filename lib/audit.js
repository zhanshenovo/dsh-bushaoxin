/**
 * Static, offline audit of an installed DSH plugin package.
 *
 * Everything here is a HEURISTIC computed from files on disk. It surfaces what
 * a package declares and what its source text mentions so a human can read an
 * "ingredient label". It is NOT a security certification: a low score is not
 * an endorsement, and a high one is not proof of malice. Every finding carries
 * the evidence it came from so the reader can disagree with the tool.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const SCAN_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'])
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.github', 'test', 'tests', '__tests__', 'docs', 'examples',
])
const MAX_FILES = 150
const MAX_BYTES_PER_FILE = 256 * 1024
const TOTAL_BYTE_BUDGET = 4 * 1024 * 1024

/**
 * Runs when the package is installed: arbitrary code at install time. This is
 * the one finding that deserves to move the score on its own.
 */
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall']
/**
 * Runs at publish/pack time. A registry tarball arrives already built, so
 * these do NOT execute during an install — worth showing, not worth scoring.
 */
const PACK_SCRIPTS = ['prepare', 'prepublishOnly', 'prepack']

const RE_URL = /\bhttps?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g
const RE_NET = /\b(?:fetch\s*\(|undici|axios|got\s*\(|https?\.request|https?\.get|WebSocket|net\.connect|dns\.)/
const RE_TERMINAL = /\b(?:child_process|execFile|execSync|spawnSync|spawn\s*\(|node-pty)/
/**
 * The credential FILE, not the word. An earlier draft matched `api_key`,
 * `password` and `secret` too, and immediately scored the plugin market 100
 * for a comment warning users that backups can contain credentials — a text
 * match is not an access. Only a literal reference to the credentials file
 * counts as a finding here.
 */
const RE_CREDENTIAL = /(?:\.credentials|credentials\.ya?ml)/
const RE_COMPOSE = /(?:cordis\.patch\.ya?ml|cordis\.ya?ml|pnpm-lock\.ya?ml|\.dsh-market)/
const RE_WRITE = /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|mkdirSync|rmSync|unlinkSync|renameSync|cpSync)\b/
const RE_WEB_ROUTE = /webServer\s*\.\s*register|\.webServer\b/

const WEIGHTS = {
  installScripts: 25,
  terminal: 12,
  credential: 20,
  composeWrite: 12,
  network: 12,
  deps: 8,
  repoMismatch: 25,
}

/** Collect the text of a package's own source files, with hard budgets. */
function collectSource(packageDir) {
  const files = []
  let bytes = 0

  const walk = (dir, depth) => {
    if (depth > 6 || files.length >= MAX_FILES || bytes >= TOTAL_BYTE_BUDGET) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES || bytes >= TOTAL_BYTE_BUDGET) return
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        // A nested node_modules or a test folder is not what gets loaded.
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        walk(full, depth + 1)
        continue
      }
      if (!entry.isFile() || !SCAN_EXT.has(extname(entry.name))) continue
      let size = 0
      try {
        size = statSync(full).size
      } catch {
        continue
      }
      if (size > MAX_BYTES_PER_FILE) continue
      let text = ''
      try {
        text = readFileSync(full, 'utf8')
      } catch {
        continue
      }
      files.push({ path: full.slice(packageDir.length + 1), text })
      bytes += size
    }
  }

  walk(packageDir, 0)
  return { files, bytes }
}

/** Distinct http(s) hostnames mentioned anywhere in the scanned text. */
function hostsIn(text) {
  const hosts = new Set()
  for (const raw of text.match(RE_URL) ?? []) {
    try {
      hosts.add(new URL(raw).host)
    } catch {
      // A URL-shaped string that does not parse is not a host; skip it.
    }
  }
  return [...hosts].sort()
}

function firstMatchPath(files, re) {
  for (const file of files) if (re.test(file.text)) return file.path
  return null
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The integrity hash the profile's own lockfile recorded for this exact
 * version. A tolerant regex rather than a YAML parse: the plugin ships zero
 * runtime dependencies on purpose, and "was this pinned to bytes" is the only
 * question asked of the file.
 */
function lockIntegrity(lockText, name, version) {
  if (!lockText || !version) return null
  const re = new RegExp(
    `\\n\\s+'?${escapeRe(name)}@${escapeRe(version)}'?:\\s*\\n\\s+resolution:\\s*\\{[^}]*integrity:\\s*([^,}\\s]+)`,
  )
  const match = lockText.match(re)
  return match ? match[1] : null
}

function repoNameOf(pkg) {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  if (typeof raw !== 'string' || raw === '') return null
  const cleaned = raw.replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, '')
  const last = cleaned.split('/').filter(Boolean).pop()
  return last ? last.toLowerCase() : null
}

/**
 * Compare a repository name with a package name the way they are actually
 * related: `dsh-market` and `dshmarket` are the same project, and calling that
 * a mismatched signboard was the first thing this audit got wrong.
 */
function normalizeName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function verdictFor(score) {
  if (score <= 25) return { tier: 'clean', text: '吃了不烧心' }
  if (score <= 55) return { tier: 'check', text: '还成，配料表值得看一眼' }
  if (score <= 75) return { tier: 'caution', text: '便宜，但有两样你得知道' }
  return { tier: 'risky', text: '这个真烧心' }
}

/**
 * Audit one installed plugin package.
 *
 * @param options.profile - profile name the package is installed into
 * @param options.dir - absolute path of the installed package directory
 * @param options.lockText - the profile's pnpm-lock.yaml text, if readable
 */
export function auditPackage({ profile, dir, lockText }) {
  const pkgPath = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const scripts = pkg.scripts ?? {}
  const installScripts = INSTALL_SCRIPTS.filter((key) => typeof scripts[key] === 'string')
  const packScripts = PACK_SCRIPTS.filter((key) => typeof scripts[key] === 'string')
  const { files, bytes } = collectSource(dir)
  const text = files.map((file) => file.text).join('\n')

  const hosts = hostsIn(text)
  const hasNetCall = RE_NET.test(text)
  const terminalPath = firstMatchPath(files, RE_TERMINAL)
  const credentialPath = firstMatchPath(files, RE_CREDENTIAL)
  const composePath = firstMatchPath(files, RE_COMPOSE)
  const writesFiles = RE_WRITE.test(text)
  const deps = Object.keys(pkg.dependencies ?? {})
  const optionalDeps = Object.keys(pkg.optionalDependencies ?? {})
  const repoName = repoNameOf(pkg)
  const packageName = String(pkg.name ?? '')
  const bareName = packageName.includes('/') ? packageName.split('/').pop() : packageName
  const repoMatches = repoName === null ? null : normalizeName(repoName) === normalizeName(bareName)
  const integrity = lockIntegrity(lockText, packageName, String(pkg.version ?? ''))

  const surfaces = []
  if (pkg.dsh?.client) surfaces.push('客户端 UI')
  if (RE_WEB_ROUTE.test(text)) surfaces.push('HTTP 路由')
  if (terminalPath) surfaces.push('子进程')

  const score = { value: 0 }
  const add = (key) => {
    score.value += WEIGHTS[key] ?? 0
    score.reasons = [...(score.reasons ?? []), key]
  }

  if (installScripts.length > 0) add('installScripts')
  if (terminalPath) add('terminal')
  if (credentialPath) add('credential')
  if (composePath && writesFiles) add('composeWrite')
  if (hasNetCall || hosts.length > 0) add('network')
  if (deps.length + optionalDeps.length > 12) add('deps')
  if (repoMatches === false) add('repoMismatch')

  const value = Math.min(100, score.value)

  const items = [
    {
      key: 'ingredients',
      label: '配料',
      status: deps.length + optionalDeps.length > 12 ? 'note' : 'ok',
      detail: `${deps.length} 个运行时依赖${optionalDeps.length ? ` + ${optionalDeps.length} 个可选依赖` : ''}，扫描 ${files.length} 个源文件（${Math.round(bytes / 1024)} KB）`,
      evidence: deps.length > 0 ? deps.slice(0, 30) : [],
    },
    {
      key: 'scripts',
      label: '火候（安装脚本）',
      status: installScripts.length > 0 ? 'warn' : packScripts.length > 0 ? 'note' : 'ok',
      detail: installScripts.length > 0
        ? `声明了安装期脚本：${installScripts.join('、')} —— 安装时会执行代码（pnpm 默认拦截构建脚本，除非单独放行）`
        : packScripts.length > 0
          ? `只有打包期脚本：${packScripts.join('、')} —— 发布时已构建，安装不会执行它们`
          : '没有任何安装期脚本，装的时候不会跑它的代码',
      evidence: [...installScripts, ...packScripts].map((key) => `${key}: ${scripts[key]}`),
    },
    {
      key: 'network',
      label: '添加剂（外联）',
      status: hosts.length > 3 ? 'warn' : hosts.length > 0 || hasNetCall ? 'note' : 'ok',
      detail: hosts.length > 0
        ? `源码里出现 ${hosts.length} 个域名，并${hasNetCall ? '有' : '没有'}网络调用 API`
        : hasNetCall
          ? '有网络调用 API，但没有硬编码域名'
          : '没发现外联域名或网络调用',
      evidence: hosts.slice(0, 12),
    },
    {
      key: 'writes',
      label: '动你的锅（写权限）',
      status: composePath && writesFiles ? 'warn' : writesFiles ? 'note' : 'ok',
      detail: composePath && writesFiles
        ? `会写文件，且源码提到 profile 组合文件（证据：${composePath}）`
        : writesFiles
          ? '会写文件，但没提到 profile 组合文件'
          : '没发现文件写入调用',
      evidence: [composePath, credentialPath].filter(Boolean),
    },
    {
      key: 'surfaces',
      label: '灶台（注册面）',
      status: terminalPath ? 'note' : 'ok',
      detail: surfaces.length > 0
        ? `注册面：${surfaces.join('、')}`
        : '没发现注册面，可能是个纯数据包',
      evidence: surfaces,
    },
    {
      key: 'signboard',
      label: '招牌（溯源）',
      status: repoMatches === false ? 'warn' : repoName === null ? 'note' : 'ok',
      detail: repoMatches === false
        ? `包名是 ${packageName}，仓库却是 ${repoName} —— 招牌对不上`
        : `仓库${repoName ? `（${repoName}）` : '字段缺失'}${repoMatches ? '，与包名一致' : ''}；lockfile ${integrity ? '记录了该版本的完整性哈希' : '没有该版本的完整性哈希（本地 link 安装属正常）'}`,
      evidence: [repoName, integrity ? `integrity: ${integrity.slice(0, 20)}…` : null].filter(Boolean),
    },
  ]

  return {
    profile,
    package: packageName,
    version: String(pkg.version ?? ''),
    description: typeof pkg.description === 'string' ? pkg.description : '',
    score: value,
    verdict: verdictFor(value),
    reasons: score.reasons ?? [],
    scanned: { files: files.length, bytes },
    items,
  }
}

/** Every profile under `$DSH_HOME/profiles`, newest-looking first. */
export function listProfiles(dshHome) {
  const dir = join(dshHome, 'profiles')
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({ name: entry.name, dir: join(dir, entry.name) }))
  } catch {
    return []
  }
}

/** The plugin packages a profile has actually installed (its dependencies). */
export function installedPlugins(profile) {
  const pkgPath = join(profile.dir, 'package.json')
  if (!existsSync(pkgPath)) return []
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch {
    return []
  }
  let lockText = null
  const lockPath = join(profile.dir, 'pnpm-lock.yaml')
  try {
    lockText = readFileSync(lockPath, 'utf8')
  } catch {
    // No lockfile: the integrity check degrades to "unknown" rather than failing.
  }
  return Object.keys(pkg.dependencies ?? {})
    .map((name) => ({ name, dir: join(profile.dir, 'node_modules', name), lockText }))
    .filter((entry) => existsSync(join(entry.dir, 'package.json')))
}

/** The whole report: every profile, every installed plugin. */
export function auditAll(dshHome) {
  const profiles = listProfiles(dshHome).map((profile) => ({
    name: profile.name,
    plugins: installedPlugins(profile).map((entry) => {
      try {
        return auditPackage({ profile: profile.name, dir: entry.dir, lockText: entry.lockText })
      } catch (error) {
        return {
          profile: profile.name,
          package: entry.name,
          version: '',
          score: null,
          verdict: { tier: 'error', text: '体检失败' },
          reasons: ['error'],
          scanned: { files: 0, bytes: 0 },
          items: [{
            key: 'error',
            label: '体检',
            status: 'warn',
            detail: error instanceof Error ? error.message : String(error),
            evidence: [],
          }],
        }
      }
    }),
  }))
  return {
    generatedAt: new Date().toISOString(),
    dshHome,
    profiles,
    disclaimer:
      '静态启发式体检：结论来自包内文件文本，不是安全认证。低分不代表安全，高分不代表恶意。',
  }
}
