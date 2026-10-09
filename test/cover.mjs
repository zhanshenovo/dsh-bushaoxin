/**
 * B站风格视频封面（可选样式）——生成可直接截图的 HTML。
 *
 * 风格来源：分析了你给的两张参考封面的配色与版式。
 *   · A 深色标题式：深海军蓝底 + 白粗字 + 电光蓝/亮黄强调 + 动漫角色压右下
 *   · B 浅色信息式：白底 + 深蓝标题 + 灰色圆角标签
 *
 * 关于角色插画：我画不了动漫人物。深色版给角色留了精确的占位区和羽化遮罩，
 * 你把 PNG（透明底）放进去即可；不放也不会难看，背景有渐变可看。
 *
 * 跑法：node test/cover.mjs  →  test/cover-dark.html / cover-light.html
 */
import { writeFileSync } from 'node:fs'

/* ---------------------------------------------------------------- 可改的文案 */

export const COVER = {
  title: '不烧心',
  titleEn: 'BUSHAOXIN',
  subtitle: '把技术警告换成你记得住的说法',
  tags: ['对话文风', '短剧改写', '滑条调辣度', '35 项测试'],
  hook: '它不改代码，只改你会不会记住',
  badge: '开源插件',
}

/* ---------------------------------------------------------------- 深色版 */

const DARK = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>封面 · 深色标题式</title>
<style>
  /* 配色取自参考封面采样：#040913 底 / #22d3ee 冷强调 / #ecf548 暖强调 / #13223b 渐变 */
  html,body{margin:0;height:100%;background:#222}
  body{display:flex;align-items:center;justify-content:center}
  .cover{
    position:relative;width:1146px;height:717px;overflow:hidden;
    background:
      radial-gradient(120% 90% at 78% 42%, #16305c 0%, #0a1730 38%, #040913 72%),
      #040913;
    font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
    color:#fff;
  }
  /* 背景装饰：左下花瓣状暗纹，模拟参考图的花卉虚影 */
  .petals{position:absolute;left:-90px;bottom:-120px;width:520px;height:520px;opacity:.20;
    background:
      radial-gradient(closest-side, #4a7fd4 0%, transparent 70%) 0 0/46% 46% no-repeat,
      radial-gradient(closest-side, #6f5ad6 0%, transparent 70%) 54% 10%/40% 40% no-repeat,
      radial-gradient(closest-side, #2e6fd0 0%, transparent 70%) 20% 60%/44% 44% no-repeat,
      radial-gradient(closest-side, #7a4fd0 0%, transparent 70%) 66% 62%/38% 38% no-repeat;
    filter:blur(6px);
  }
  .grid{position:absolute;inset:0;opacity:.06;
    background-image:linear-gradient(#8fb6ff 1px, transparent 1px),linear-gradient(90deg,#8fb6ff 1px, transparent 1px);
    background-size:52px 52px;
  }

  /* 角色占位：把透明底 PNG 放到 .art 里即可。left 让出文字区，底部贴边。 */
  .art{position:absolute;right:-10px;bottom:-14px;width:520px;height:660px;
    display:flex;align-items:flex-end;justify-content:center;pointer-events:none}
  .art img{max-width:100%;max-height:100%;object-fit:contain;
    /* 左缘羽化，让角色自然融进背景 */
    -webkit-mask-image:linear-gradient(90deg, transparent 0%, #000 16%, #000 100%);
    mask-image:linear-gradient(90deg, transparent 0%, #000 16%, #000 100%);
    filter:drop-shadow(-18px 8px 34px rgba(0,0,0,.55))}
  /* 没有插画时的默认剪影：低调到几乎只是光影，不抢文字。 */
  .ghost{position:relative;width:340px;height:560px;opacity:.5}
  .ghost::before{content:"";position:absolute;left:50%;top:0;width:190px;height:190px;
    margin-left:-95px;border-radius:50%;
    background:linear-gradient(180deg, rgba(150,200,255,.30), rgba(120,170,235,.10));
    box-shadow:0 20px 60px rgba(120,180,255,.18)}
  .ghost::after{content:"";position:absolute;left:50%;bottom:0;width:300px;height:400px;
    margin-left:-150px;border-radius:46% 46% 0 0;
    background:linear-gradient(180deg, rgba(140,190,255,.22), rgba(90,140,210,.04));
    box-shadow:0 -10px 50px rgba(120,180,255,.12)}
  .art .hint{position:absolute;left:50%;top:46%;transform:translateX(-50%);
    font-size:13px;line-height:1.8;text-align:center;color:rgba(180,210,255,.30);white-space:nowrap}

  .copy{position:absolute;left:64px;top:96px;max-width:620px;z-index:3}
  .en{font-size:92px;font-weight:800;letter-spacing:2px;line-height:1.02;
    text-shadow:0 6px 26px rgba(0,0,0,.55)}
  .en .accent{color:#22d3ee}
  .zh{font-size:150px;font-weight:900;line-height:1.02;margin-top:4px;color:#ecf548;
    letter-spacing:6px;
    -webkit-text-stroke:8px #05070f;
    paint-order:stroke fill;
    text-shadow:0 10px 30px rgba(0,0,0,.5)}
  .sub{margin-top:26px;font-size:31px;font-weight:600;color:#dbe8ff;
    text-shadow:0 3px 14px rgba(0,0,0,.6)}
  .hook{position:absolute;left:66px;bottom:132px;z-index:3;
    font-size:27px;font-weight:600;color:#a9c7ee;letter-spacing:.5px}
  .hook b{color:#22d3ee}
  .badge{position:absolute;right:52px;top:52px;z-index:3;
    font-size:19px;font-weight:700;letter-spacing:1px;color:#05070f;background:#ecf548;
    padding:8px 18px;border-radius:999px;transform:rotate(3deg);
    box-shadow:0 6px 18px rgba(236,245,72,.25)}

  /* 角标：B站封面惯例，左下播放量、右下时长 */
  .meta{position:absolute;left:0;right:0;bottom:0;height:52px;z-index:4;
    display:flex;align-items:center;justify-content:space-between;padding:0 16px;
    background:linear-gradient(0deg, rgba(0,0,0,.72), transparent);
    font-size:20px;color:#e8eefb;font-variant-numeric:tabular-nums}
  .meta span{display:inline-flex;align-items:center;gap:7px}
</style></head>
<body>
<div class="cover">
  <div class="grid"></div>
  <div class="petals"></div>

  <!-- 角色位：有图就把整个 <div class="ghost">…</div> 换成 <img src="你的角色.png"> -->
  <div class="art">
    <div class="ghost"></div>
  </div>

  <div class="badge">${COVER.badge}</div>

  <div class="copy">
    <div class="en">${COVER.titleEn.slice(0, 2)}<span class="accent">${COVER.titleEn.slice(2)}</span></div>
    <div class="zh">${COVER.title}</div>
    <div class="sub">${COVER.subtitle}</div>
  </div>

  <div class="hook">它不改代码，只改你<b>会不会记住</b></div>

  <div class="meta">
    <span>▶ 1.2万　💬 86</span>
    <span>02:14</span>
  </div>
</div>
</body></html>`

/* ---------------------------------------------------------------- 浅色版 */

const LIGHT = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>封面 · 浅色信息式</title>
<style>
  /* 配色取自参考封面采样：#ffffff 底 / #0f1e43 标题 / #92a4be 次级 */
  html,body{margin:0;height:100%;background:#222}
  body{display:flex;align-items:center;justify-content:center}
  .cover{position:relative;width:1146px;height:717px;overflow:hidden;background:#fff;
    font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
    padding:0 62px;display:flex;flex-direction:column;justify-content:center;gap:26px}
  /* 右上角极淡的色块，避免纯白太空。压得很低，不参与构图。 */
  .glow{position:absolute;right:-200px;top:-220px;width:520px;height:520px;border-radius:50%;
    background:radial-gradient(closest-side, rgba(34,211,238,.07), transparent 70%)}

  .row{display:flex;align-items:center;gap:34px;position:relative;z-index:2}
  .icon{width:150px;height:150px;border-radius:34px;flex:0 0 auto;
    background:linear-gradient(150deg,#0f1e43,#26518f 60%,#22d3ee);
    display:flex;align-items:center;justify-content:center;
    font-size:60px;font-weight:900;color:#ecf548;
    box-shadow:0 12px 30px rgba(15,30,67,.22)}
  .head{display:flex;flex-direction:column;gap:12px;min-width:0}
  .title{font-size:78px;font-weight:900;color:#0f1e43;letter-spacing:3px;line-height:1.05}
  .sub{font-size:30px;font-weight:600;color:#92a4be;letter-spacing:.5px}

  .tags{display:flex;flex-wrap:wrap;gap:16px;position:relative;z-index:2}
  .tag{font-size:25px;font-weight:600;color:#0f1e43;
    border:2px solid #e6ebf2;border-radius:999px;padding:12px 30px;background:#fff;
    box-shadow:0 2px 8px rgba(15,30,67,.04)}
  .tag.hot{border-color:#0f1e43;background:#0f1e43;color:#fff}

  .hook{position:relative;z-index:2;font-size:30px;font-weight:700;color:#0f1e43;
    border-left:8px solid #ecf548;padding-left:20px}
  .hook b{color:#1f6fd0}

  .meta{position:absolute;left:0;right:0;bottom:0;height:50px;
    display:flex;align-items:center;justify-content:space-between;padding:0 20px;
    background:linear-gradient(0deg, rgba(120,130,145,.85), rgba(120,130,145,0));
    font-size:20px;color:#fff;font-variant-numeric:tabular-nums}
</style></head>
<body>
<div class="cover">
  <div class="glow"></div>

  <div class="row">
    <div class="icon">不</div>
    <div class="head">
      <div class="title">${COVER.title} · 文风层</div>
      <div class="sub">${COVER.subtitle}</div>
    </div>
  </div>

  <div class="tags">
    ${COVER.tags.map((tag, i) => `<div class="tag${i === 0 ? ' hot' : ''}">${tag}</div>`).join('\n    ')}
  </div>

  <div class="hook">它不改代码，只改你<b>会不会记住</b></div>

  <div class="meta"><span>▶ 1.2万　💬 86</span><span>02:14</span></div>
</div>
</body></html>`

writeFileSync('test/cover-dark.html', DARK, 'utf8')
writeFileSync('test/cover-light.html', LIGHT, 'utf8')
console.log('封面已生成：test/cover-dark.html（深色·标题式）、test/cover-light.html（浅色·信息式）')
