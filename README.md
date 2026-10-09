# dsh-bushaoxin · 不烧心

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-22d3ee.svg)](https://github.com/zhanshenovo/dsh-bushaoxin)
[![Tests](https://img.shields.io/badge/tests-35%20passing-3fb950.svg)](#五开发)
[![No deps](https://img.shields.io/badge/dependencies-0-ecf548.svg)](#五开发)

把「不烧心」这个网络梗做进 DSH。**插件的初衷是改对话风格**，其余是它顺带能产出的东西。

> 梗的出处：大批量模板化 AI 短剧的固定套路 —— 老实商家食材涨价所以卖得贵，隔壁黑心竞品低价抢客，
> 老顾客坚持光顾：「贵是贵了点，但吃了不烧心。」老板：「怕亏钱，但更怕坏规矩，先把规矩立住，路才能越走越宽。」
> 后续黑心店翻车被揭穿，正派老板笑到最后。

**它不提升效率，不加功能，不改代码质量。** 它只做一件事：把「快而便宜的路有坑」这类技术取舍，
从一句正确的废话，换成一个你会记住的说法。

---

## 安装

**别人的机器上（从 GitHub 装）**——已实测可用：

```bash
dsh plugin --profile <你的profile> add github:zhanshenovo/dsh-bushaoxin
```

一条命令就够。它会做三件事：拉取仓库、装进 profile 的 `node_modules`、
**自动把 `dsh-bushaoxin` 加进 `dsh.profile.bundles`**（不需要你手改任何文件）。
然后重启 DSH 即可。

> `github:` 简写会被解析成 `git+https://`，**不需要配 SSH key**。
> 也接受完整地址：`add git+https://github.com/zhanshenovo/dsh-bushaoxin.git`。

**本机开发时（从工作区装）**：

```bash
dsh plugin --profile <你的profile> add <本仓库路径>
```

装成本地链接（junction / symlink），改代码不用重装，重启即生效。

**验证它跑起来了：**

```
/bushaoxin_rewrite preset=特辣 npm install --force 之后本地能跑，CI 挂了
```

看到「隔壁那家『一键装依赖』的店挂出招牌」就是成功了。输入框上方还会多一个「🔥 不烧心」，
点一下向上拉出滑条，四档调强度。

**验证安装完整（可选）：**

```bash
cd <profile>/node_modules/dsh-bushaoxin && npm test
```

---

## 卸载

```bash
dsh plugin --profile <你的profile> remove dsh-bushaoxin
```

依赖和 `dsh.profile.bundles` 里的条目都会被清掉（已实测），重启 DSH 即可。

详细的安装说明与排错见 **[INSTALL.md](INSTALL.md)**。

---

## 一、主体：文风层（默认开）

助手在谈论「便宜的路有坑、慢的路可靠」这类取舍时，会用上这个梗的说法。
**不是事后贴上去的**，而是写进系统提示、让回复生成时就是这个风格。

技术原因（已核对宿主源码，别再试别的路）：

| 能不能事后改助手回复？ | 结论 |
|---|---|
| `ctx.on('assistant/message', …)` | ❌ 这是 `session.append` **之后**才发的通知事件，拿到的正文已经在会话里了 |
| 客户端渲染 | ❌ 客户端跟着 `agent/assistant-stream` 的**流式帧**实时渲染，等你拿到全文，用户早看见了 |
| `systemPrompt.section` | ✅ **唯一有效**：生成前写进系统提示，回复从一开始就是那个风格 |

### 强度

`config.styleLevel` = `关` \| `轻` \| `中`（默认）\| `重`

它控制的是「一轮回复里允许带几次梗」，不是「梗有多长」：

| 强度 | 每轮最多 | 说明 |
|---|---|---|
| 关 | 0 | 完全关闭，助手照常说话 |
| 轻 | 1 | 偏克制 |
| 中 | 1 | 技术话题平均每两三轮一次，日常对话不带 |
| 重 | 2 | 沾技术基本每轮都带 |

### 文风层的自我约束（写死在 `styleDirective` 里）

1. **不许复读原台词** —— 原梗就是被 AI 批量复读搞腻的，插件不能犯同一个错，要求按领域换词。
2. **梗后面必须跟真实技术结论** —— 段子是包装，结论才是内容。
3. **不许"演"短剧** —— 不写「顾客：」「老板：」对白，不加旁白场景。否则助手会开始角色扮演，把工作对话变成小剧场。
4. **严肃场合自动切回** —— 线上事故、用户明确要求正经时不使用。

---

## 二、短剧改写引擎（按需调用）

把任意文本拧成「老实商家 vs 黑心竞品」短剧。

### 五个旋钮（辣度不是音量，是形状）

| 旋钮 | 取值 | 管什么 |
|---|---|---|
| `preset` | `微辣` `中辣` `特辣` `变态辣` `干辣` | 预设组合，不是天花板 |
| `slots` | 1–4 | 讲几幕。1 = 只有招牌台词 |
| `density` | 0–100 | 招牌台词密度，**0 就是完全不出现**（干辣） |
| `flip` | `自嘲` `顾客复购` `黑心店反扑` `无` | 收尾往哪儿拐，不是永远"翻车+认账" |
| `seed` | 整数 | 换一批台词，不改骨架 |

### 怎么用

**人来拧（推荐）**：

```
/bushaoxin_rewrite preset=干辣 FAIL test/parser.test.ts ✕ 解析器 应忽略行尾注释
/bushaoxin_rewrite slots=4 density=100 seed=7 rm -rf 之前要不要 dry-run？
/bushaoxin_drama 升级依赖
```

**模型来调**：直接说「把这段改写成不烧心」「帮我排个不烧心剧本」，助手会调 `bushaoxin_rewrite` / `bushaoxin_drama`。

### 输出的硬约束

**每篇末尾永远附一行真实技术结论**，不可关闭（`keepTruthLine` 只允许测试用）。
整活可以夸张，但不能把人带沟里 —— 比如写到 `--force` 时，真话必须点明它会让 lockfile 与 `package.json` 脱节。

同一个 `(文本, 旋钮)` 永远得到同一份输出（纯函数 + `hashString`），所以可逐字断言。

---

## 三、门诊部与配料表（原有功能）

| 入口 | 说明 |
|---|---|
| `/bushaoxin` | 当前烧心指数与处方 |
| `bushaoxin_check` 工具 | 模型自己来挂号 |
| `GET /dsh-bushaoxin/report.html` | 插件配料表审计页 |
| `GET /dsh-bushaoxin/heartbeat` | 客户端挂件心跳 |

---

## 四、配置

写在 profile 的 `cordis.patch.yml`：

```yaml
- id: dsh-bushaoxin
  name: dsh-bushaoxin
  config:
    styleLevel: 中        # 关 | 轻 | 中 | 重
    toneHook: true        # 设 false 可整体关掉文风层
    defaults:             # 改写引擎的默认旋钮
      slots: 3
      density: 60
      flip: 黑心店反扑
```

---

## 五、开发

```bash
npm test         # 35 项断言：一期回归 + 三期改写引擎
npm run preview  # 打几篇成品出来人眼看
npm run demo     # 重建演示台本产物
npm run video    # 重建视频拍摄素材包
npm run cards    # 重建图文卡片（9 张 1080×1080）
```

引擎在 `lib/drama.js`，**纯函数、零 I/O、零宿主依赖、零第三方依赖** —— 所以每一句话都能被断言。
同一个 `(文本, 旋钮)` 永远得到同一份输出，测试可以逐字比对。

### 三次现场试用抓到的 bug（都留了回归断言）

| 问题 | 修法 |
|---|---|
| 查 `Cannot find module` 却讲 `--force` | 没命中线索时用通用剧本，不硬套具体剧情 |
| 讲 `--peer-deps` 招牌却喊 `--force` | 每条剧情自带招牌话术，不串台 |
| 「出厂记录只写了个日期」被时区抢走 | 删掉 `日期`/`error` 这类过度通用索引词，并让更长的关键词赢 |

---

## 已知缺陷（诚实交代）

**系统提示里那段文风正文是插件加载时定死的**（`systemPrompt.section` 不支持热替换）。
所以滑条改了宿主状态、也改了本轮回复，但那段正文在本次运行内不会跟着变。

彻底修需要让强度走一个每轮可变的通道（例如 `agent/pre-step` 水漏把当前档位注入），**这一步还没做**。

## 技术边界

宿主**没有**提供改写助手回复的钩子：

- `assistant/message` 是 `session.append` **之后**才发的通知事件，拿到正文时它已经在会话里了
- 客户端跟着 `agent/assistant-stream` 的**流式帧**实时渲染，等你拿到全文，用户早看见了

所以唯一有效的路是**生成前注入** —— 把文风写进系统提示，让回复从一开始就是那个风格。

## License

[MIT](LICENSE) © 2026 zhanshenovo

「不烧心」是中文网络流行梗，非本项目原创。插件与梗的原作者无关联。

