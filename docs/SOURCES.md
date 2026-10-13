# 角色图源：验证过什么，代码用了哪条

这里记录 2026-10-06 ～ 10-07 对各个图源的实测结果，以及"按内容匹配角色"这条路径在代码里的位置。接口状态会变，重新验证的方法写在每一节末尾。

## 结论

| 来源 | 能否直接调用 | 需要 key | 形态 | 在代码里 |
|---|---|---|---|---|
| **Petdex**（`assets.petdex.dev`） | 能，返回 `access-control-allow-origin: *` | 否 | 8 列精灵图，和角色包格式一致 | **已接入**：手动导入 + 自动匹配 |
| GitHub 上的 Codex 宠物仓库 | 能（`raw.githubusercontent.com`，允许跨域） | 否 | 同 Petdex 格式 | 未接入，可在「导入角色」页用本地文件导入 |
| Google Noto 动态表情 | 能，允许跨域 | 否 | WebP 动图 / Lottie，只有表情符号 | **已接入**：表情气泡，25 个预先渲染后打包（CC BY 4.0） |
| 维基共享资源（GIF） | 能，允许跨域；并发请求会被限流 | 否 | 带背景的矩形 GIF | 未接入（渲染器不支持） |
| Imgflip / Memegen | 能 | 否 | 静态的空白梗图模板 | 不适合，未接入 |
| Giphy | 接口通，无 key 返回 401 | 是 | GIF / 贴纸 | 未接入 |
| Tenor | 接口已于 2026-06-30 关停 | — | — | 不可用 |
| 微信表情、WhatsApp 贴纸 | 没有对外接口 | — | — | 不可用 |
| Telegram 贴纸 | 需要机器人令牌 | 是 | — | 未接入 |
| Reddit / Know Your Meme | 直接请求被拒（403 / 406） | — | — | 不可用 |

唯一形态合适、不需要 key、扩展能直接下载的角色来源是 Petdex，所以角色走的是这一条。Noto 动态表情不是角色，用来做角色旁边的表情气泡。

## 已接入：按内容匹配 Petdex 角色

标题或作者里出现已知的角色、作品、热梗或歌手时，直接换上对应的角色，而不是从曲风池里抽。设置页里的开关是「自动匹配角色」，**默认关闭**。

| 位置 | 作用 |
|---|---|
| `src/lib/match/table.ts` | 匹配表：关键词 → Petdex 角色（slug）。73 条规则、162 个角色，其中 10 条是 VTuber（Neuro-sama、A-SOUL、七海 Nana7mi、永雏塔菲等，频道名也算）。同一条规则里排在最前的角色优先 |
| `src/lib/match/matcher.ts` | 纯规则匹配（不联网）：英文按整词匹配，中日文按子串匹配，数组表示"同时出现" |
| `src/lib/match/auto.ts` | 命中后取用角色：已导入的直接用；否则下载清单（每天最多一次）和那一张精灵图；最多保留 24 个，按最近使用淘汰 |
| `src/lib/gacha/engine.ts` | `GachaDeps.match`：匹配到且已安装的角色优先于池内抽取；`GachaDeps.rematch`："换一次"换成同一规则的下一个角色，没有下一个时回到普通池 |
| `src/entrypoints/background.ts` | 接线：下载最多等 6 秒；更慢时先照常抽卡，角色下载完后如果还在播同一个内容就换上 |
| `src/entrypoints/options/Settings.svelte` | 开关和说明 |

设计上的几个取舍：

- **只用人工核对过的匹配表，不做"角色名出现在标题里就算"**。Petdex 有近五千个社区角色，名字里有 Lemon、Happy、Steve、Queen 这类常见词，直接按名字匹配会配错。表里每个 slug 都读过它在 Petdex 上的描述。
- **匹配不需要 AI，也不发送标题**。实验里 AI 能多找到一些"需要联想"的内容（例如从歌名想到作品），但需要用户自己的 key。后续可以让 AI 识别顺带返回人物和作品名，再查同一张表。
- **规则的 key 必须自己就能说明主体**。`idol`、`queen`、`one piece`、`胡桃`、`pepe`、`loopy` 这类词单独出现时不算，要和第二个词一起出现。单元测试里有一组"不应该命中"的标题。

### 测试记录

- **规则匹配**：项目自带的 42 条标题里，10 条命中且全部正确，其余 32 条都没有误命中（`src/lib/match/match.test.ts`）。
- **真实浏览器**：`PETDEX_LIVE=1 npx playwright test match-live` 在真实 Petdex 上跑通——关闭时照常抽卡，开启后《初音ミク》的标题下载并显示初音未来，第二个标题直接复用不再下载。
- **素材**：抽查 16 个角色的精灵图，全部通过项目的网格检查，单张 1.5–3.4 MB。

### 维护匹配表

```bash
npm run match:check   # 对照真实的 Petdex 清单，检查表里每个角色是否还存在
```

加规则前先在 Petdex 上看这个角色的描述，确认它画的确实是你要的那个主体；同名的角色很多。热梗更新很快，可以定期补充。

### 已知限制

- 命中的角色是社区投稿的同人作品，涉及动漫、游戏角色、商业 IP（奶龙、Chiikawa、三丽鸥、Labubu 等）真人形象（表里 `kind: 'person'` 的 7 条）和 VTuber（`kind: 'vtuber'` 的 10 条，背后是真人，A-SOUL 等还是公司的商业 IP）。扩展不分发这些素材，只在用户开启后从 Petdex 下载到本机。**上架前需要决定是否保留这些规则。**
- 下载下来的角色和手动导入的一样进入通用池，之后别的内容也可能抽到它。
- Petdex 能从请求看出下载了哪个角色（标题本身不会发送）。见 `PRIVACY.md`。

## 已接入：Noto 动态表情（表情气泡）

| 位置 | 作用 |
|---|---|
| `scripts/gen-emoji.mjs` | 从 `fonts.gstatic.com` 取 Lottie 文件，在浏览器里逐帧渲染成 8 列精灵图 `public/emoji/<名字>.webp`，并生成 `src/lib/emoji/sheets.gen.ts` |
| `src/lib/emoji/pick.ts` | 按关键词 → 曲风 → 内容类型选表情 |
| `src/components/Bubble.svelte`、`EmojiSprite.svelte` | 气泡的出现时机和绘制 |

- **许可证**：Google 开发者博客写明"The artwork is available under the CC BY 4.0 license"，署名见 `public/emoji/LICENSE.md` 和设置页。
- **为什么预先渲染**：原始 WebP 动图 512 px，一个 185–943 KB；Lottie 只有 28–42 KB，但要在每个网页里跑播放器。预先渲染成 96 px 的精灵图，25 个一共约 1.1 MB，运行时不联网。
- **没有动画版本的表情**（不能用）：🎧 🎤 🎹 🎵 💤 🌙 🎙️ 🔴 🎄 🕺 💨 🐱。
- 想加表情：在 `gen-emoji.mjs` 的 `EMOJI` 里加名字和码位（码位在 [动态表情列表](https://googlefonts.github.io/noto-emoji-animation/) 里查，必须有动画版本），重新运行脚本，再在 `pick.ts` 里用上它。

## 未接入的来源

### GitHub 上的 Codex 宠物仓库

格式和 Petdex 相同（`pet.json` + `spritesheet.webp`），抽查的两张图通过了网格检查。

| 仓库 | 数量 | 说明 |
|---|---|---|
| `dnnyngyen/codex-pokepets` | 1738 | 带索引 `pets.json`。**精灵图取自宝可梦游戏的官方素材**（见该仓库 LICENSE 第 2 部分），因此没有接入自动下载 |
| `TiantianTitan/codex-anime-pets` | 48 | 原神、星穹铁道、绝区零等；没有许可证文件 |
| `YaKun9/codex-pets` | 17 | 每个角色带单独的许可说明 |

GitHub 没有统一的检索入口：搜索出 172 个相关仓库，目录结构各不相同，多数没有索引。要用的话只能挑选仓库、预先合并成自己的索引。

### 动图类（需要先改渲染器）

现在的渲染器把外部图片画到 canvas 上，GIF 只会显示第一帧；角色包格式也只有精灵图和视频两种。下面这些来源能调用，但要先支持动图才能用。

- **维基共享资源**：`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=<关键词> filemime:image/gif&prop=imageinfo&iiprop=url|size|metadata&origin=*`。奥巴马的视频能配到一张公有领域的奥巴马 GIF，但换成其他人物基本没有结果，或者配到不合适的片段。是带背景的矩形片段，不是透明角色。
- **Giphy**：覆盖面最好，但测试 key 每小时 100 次调用，写进公开扩展会被所有用户共用；只能像 AI key 一样让用户自己填。

## 重新验证

```bash
# 是否可调用、是否允许跨域（看状态码和 access-control-allow-origin）
curl -sS -o /dev/null -D - -H 'Origin: chrome-extension://x' https://assets.petdex.dev/manifests/petdex-v1.json | grep -iE '^HTTP|access-control'

npm run match:check                                   # 匹配表里的角色是否都还在
PETDEX_LIVE=1 npx playwright test match-live          # 真实浏览器 + 真实 Petdex（先 HAPPYDESK_E2E=1 npx wxt build）
```
