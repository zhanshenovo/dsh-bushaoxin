/**
 * The standalone report page: one self-contained HTML document so the report
 * is readable even when the client bundle never loads (older host, broken
 * module table, disabled section). No build step, no external assets.
 */

const STATUS_GLYPH = { ok: '✓', note: '!', warn: '✗' }
const STATUS_COLOR = { ok: '#1a7f37', note: '#9a6700', warn: '#cf222e' }
const TIER_BG = {
  clean: '#e6f4ea',
  check: '#fff8e1',
  caution: '#fff1e5',
  risky: '#fdecea',
  error: '#f0f0f0',
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderItems(plugin) {
  return plugin.items.map((item) => {
    const color = STATUS_COLOR[item.status] ?? '#57606a'
    const glyph = STATUS_GLYPH[item.status] ?? '?'
    const evidence = item.evidence?.length
      ? `<div class="evidence">${item.evidence.map(esc).join(' · ')}</div>`
      : ''
    return `<div class="item">
      <div class="item-head">
        <span class="glyph" style="color:${color}">${glyph}</span>
        <span class="item-label">${esc(item.label)}</span>
      </div>
      <div class="item-body">
        <div class="detail">${esc(item.detail)}</div>
        ${evidence}
      </div>
    </div>`
  }).join('')
}

function renderPlugin(plugin) {
  const score = plugin.score === null ? '—' : String(plugin.score)
  const tier = plugin.verdict?.tier ?? 'error'
  return `<article class="plugin">
    <header>
      <div class="title">
        <span class="name">${esc(plugin.package)}</span>
        <span class="version">${esc(plugin.version) || '—'}</span>
      </div>
      <div class="badge" style="background:${TIER_BG[tier] ?? '#f0f0f0'}">
        <strong>${score}</strong><span class="outof">/100</span>
        <span class="verdict">${esc(plugin.verdict?.text ?? '')}</span>
      </div>
    </header>
    ${plugin.description ? `<p class="desc">${esc(plugin.description)}</p>` : ''}
    ${renderItems(plugin)}
  </article>`
}

function renderProfile(profile) {
  const plugins = profile.plugins.length
    ? profile.plugins.map(renderPlugin).join('')
    : '<p class="empty">这个 profile 没有安装任何插件。</p>'
  return `<section class="profile">
    <h2>${esc(profile.name)} <span class="count">${profile.plugins.length} 个插件</span></h2>
    ${plugins}
  </section>`
}

export function renderReportHtml(report) {
  const profiles = report.profiles.map(renderProfile).join('')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>不烧心 · 插件配料表</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px 64px;
    font: 14px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    background: #f6f8fa; color: #1f2328;
  }
  .wrap { max-width: 880px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .tagline { color: #57606a; margin: 0 0 4px; }
  .meta { color: #8c959f; font-size: 12px; margin: 0 0 24px; }
  h2 { font-size: 15px; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #d0d7de; }
  .count { color: #8c959f; font-weight: 400; font-size: 12px; }
  .plugin { background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; }
  .plugin header { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
  .name { font-weight: 600; }
  .version { color: #8c959f; margin-left: 6px; font-size: 12px; }
  .badge { border-radius: 6px; padding: 4px 10px; font-size: 12px; white-space: nowrap; }
  .badge strong { font-size: 16px; }
  .outof { color: #8c959f; }
  .verdict { display: block; margin-top: 2px; }
  .desc { color: #57606a; margin: 8px 0 0; font-size: 13px; }
  .item { display: flex; gap: 10px; margin-top: 10px; align-items: baseline; }
  .glyph { font-weight: 700; width: 12px; flex: 0 0 12px; }
  .item-label { flex: 0 0 130px; color: #1f2328; }
  .item-body { flex: 1 1 auto; min-width: 0; }
  .detail { color: #57606a; }
  .evidence { color: #8c959f; font-size: 12px; margin-top: 2px; word-break: break-all; }
  .empty, .disclaimer { color: #57606a; }
  .disclaimer { margin-top: 32px; padding: 10px 12px; background: #fff8e1; border: 1px solid #eed888; border-radius: 6px; font-size: 12px; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1117; color: #e6edf3; }
    .plugin { background: #161b22; border-color: #30363d; }
    h2 { border-color: #30363d; }
    .detail, .tagline, .empty, .disclaimer { color: #9198a1; }
    .disclaimer { background: #2b2416; border-color: #57431a; }
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>不烧心 · 插件配料表</h1>
  <p class="tagline">贵是贵了点，但吃了不烧心。</p>
  <p class="meta">生成于 ${esc(report.generatedAt)} · DSH_HOME ${esc(report.dshHome)}</p>
  ${profiles}
  <p class="disclaimer">${esc(report.disclaimer)}</p>
</div>
</body>
</html>`
}
