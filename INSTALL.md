# 安装说明

给第一次装的人。**一条命令，不用改任何文件。**

> 这份说明里的每条命令都在真实 DSH 上跑过（2026-10，pnpm v11.7.0 / Node 24）。

---

## 你需要什么

| 项 | 要求 |
|---|---|
| DeepSeek Harness | 已经装好并能启动 |
| Node.js | **≥ 20**（插件 `engines` 里写着） |
| 网络 | 能访问 github.com |
| SSH key | **不需要**（见下方说明） |

---

## 第一步：确认你的 profile 名字

profile 是 DSH 的一套配置档，默认通常是 `web` 或 `desktop`。

```bash
# 列出你现有的 profile
ls ~/.dsh/profiles
```

Windows 上是 `dir %USERPROFILE%\.dsh\profiles`。

如果你不确定用哪个，就用你现在日常启动 DSH 时用的那个（`dsh web` 对应的就是 `web`）。

---

## 第二步：装

```bash
dsh plugin --profile <你的profile> add github:zhanshenovo/dsh-bushaoxin
```

把 `<你的profile>` 换成上一步查到的名字。例如 profile 叫 `web`：

```bash
dsh plugin --profile web add github:zhanshenovo/dsh-bushaoxin
```

**这一条命令做了三件事**，都不用你操心：

1. 从 GitHub 拉取插件
2. 装进 profile 的 `node_modules`
3. **自动把 `dsh-bushaoxin` 加进 `dsh.profile.bundles`**

实测输出：

```
dependencies:
+ dsh-bushaoxin git+https://github.com/zhanshenovo/dsh-bushaoxin.git

Done in 20.7s using pnpm v11.7.0
```

> **关于 SSH key**：`github:` 这个简写会被 pnpm 自动解析成 `git+https://`，
> 走的是匿名 HTTPS，**没有配 SSH key 也能装**。
> 你也可以直接写完整地址，效果一样：
> `add git+https://github.com/zhanshenovo/dsh-bushaoxin.git`

---

## 第三步：重启 DSH

插件是在启动时加载的，装完必须重启一次。

关掉 DSH，再按你平时的方式启动。历史会话不会丢（都在 `~/.dsh/sessions`）。

---

## 第四步：验证

**① 文风层生效了没？**

随便问一个技术问题，看它有没有用上「不烧心」的说法。

**② 改写引擎能用吗？** 在输入框敲：

```
/bushaoxin_rewrite preset=特辣 npm install --force 之后本地能跑，CI 挂了
```

看到「隔壁那家『一键装依赖』的店挂出招牌」就是成功了。

**③ 滑条在吗？** 输入框上方应该多了一行「🔥 不烧心」。点它，会向上拉出一个滑条，
四档：关 / 轻 / 中 / 重。

**④ 想在终端里确认安装完整（可选）：**

```bash
cd ~/.dsh/profiles/<你的profile>/node_modules/dsh-bushaoxin
npm test
```

应该看到 `all checks passed` 和 `35/35 通过`。

---

## 卸载

```bash
dsh plugin --profile <你的profile> remove dsh-bushaoxin
```

实测它会**同时清掉 `dsh.profile.bundles` 里的条目**，不用手动改文件。重启 DSH 即可。

---

## 排错

**`dsh: command not found`**
DSH 的 CLI 没在 PATH 里。用完整路径调用，或用你平时启动 DSH 的方式。

**`ERR_PNPM_FETCH_404` / 拉不下来**
网络到 github.com 不通。试试完整地址：

```bash
dsh plugin --profile <你的profile> add git+https://github.com/zhanshenovo/dsh-bushaoxin.git
```

**装完看不到任何变化**
八成是没重启 DSH。插件在启动时加载，热改不生效。

**重启后滑条还是不出现**
客户端部分需要重新拉取。试一次强制刷新（Ctrl+Shift+R / Cmd+Shift+R）。

**想看装到哪了**

```bash
cat ~/.dsh/profiles/<你的profile>/package.json
```

`dependencies` 里应该有 `dsh-bushaoxin`，`dsh.profile.bundles` 里也应该有它。

**装错了 profile**
`remove` 掉再对正确的 profile 装一次：

```bash
dsh plugin --profile <错的> remove dsh-bushaoxin
dsh plugin --profile <对的> add github:zhanshenovo/dsh-bushaoxin
```

---

## 它到底会改什么（装之前先看清）

这个插件**只观察、只输出文字**：

- ❌ 不修改你的 profile 配置（除了它自己那条 bundle 记录）
- ❌ 不改工具参数、不拦截工具执行
- ❌ 不写任何文件到你的工作区
- ✅ 只往系统提示里加一段文风说明（可关）
- ✅ 只提供一个本地 HTTP 路由，用来读写"辣度"这一个值

想确认？代码全是明文，`lib/` 下面一共五个文件，没有依赖，没有构建步骤。
