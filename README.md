# Kobutai 小舞台

（曾用名 HappyDesk。英文、日文、中文都写作 Kobutai / 小舞台 / こぶたい。）

一个 Chrome 扩展：网页上悬浮一个动画角色，根据你正在播放的内容出场；鼠标悬停弹出媒体控制条，可以跨标签页控制播放。

- 设计文档：[docs/DESIGN.md](docs/DESIGN.md)
- 进度与验收：[docs/GOAL.md](docs/GOAL.md)
- 隐私政策：[PRIVACY.md](PRIVACY.md)
- 界面语言：中文、英文、日文，默认跟随浏览器，设置页顶部可切换（`src/lib/i18n/`，新增文字要三种语言都写，否则类型检查不通过）
- 用户投稿角色与每周更新：[docs/COMMUNITY-CHARACTERS.md](docs/COMMUNITY-CHARACTERS.md)
- 落地页（英日中三语，静态网页）：[site/](site/README.md)；Product Hunt 配图：`docs/producthunt/`
- 上架材料：[docs/store/listing.md](docs/store/listing.md)
- 角色图源与匹配：[docs/SOURCES.md](docs/SOURCES.md)
- 以后的方向：AI 孵化原创角色（暂不实现）：[docs/AI-HATCH.md](docs/AI-HATCH.md)
- 生成新内置角色的提示词和规格：[docs/CHARACTER-PROMPTS.md](docs/CHARACTER-PROMPTS.md)

## 开发

```bash
npm install
npm run dev        # 启动带热重载的 Chrome
npm run check      # 类型检查 + 单元测试 + 构建
npm run e2e        # 构建后用 Playwright 加载扩展跑端到端测试
npm run zip        # 打包上架用的 .output/happydesk-<version>-chrome.zip
```

手动加载：`npm run build`，然后在 `chrome://extensions` 打开开发者模式，"加载已解压的扩展程序"选择 `.output/chrome-mv3`。

首次运行 E2E 前需要 `npx playwright install chromium`。`PETDEX_LIVE=1 npm run e2e` 会额外跑连真实 petdex.dev 的导入测试和自动匹配测试。`npm run match:check` 对照真实的 Petdex 清单检查匹配表里的角色是否都还存在。

## 抽卡与角色

- 每次开始播放新内容，后台先给内容打标签（类型 + 曲风），再从对应池子里等概率抽一个角色。回到之前播过的内容，会恢复当时抽到的角色。
- 每个内容可以"换一次"（同一个池子，不能退回）；可以锁定当前角色，锁定后不再抽。
- **只在有声音时出现**：任何一个标签页在出声（播放且没静音），每个网页上都会出现角色；全部停下 5 分钟后自动收起，再播放时回来。静音自动播放的预览视频不算。设置页可以改成"一直显示"。
- 角色跟着播放状态走：播放时逐帧动画之外还有轻微的上下律动；暂停时定格在一帧上并稍微变暗。系统开了"减少动态效果"时不做律动。
- **表情气泡**：角色旁边会冒出一个小表情，说明在放什么——摇滚是 🤘 或 \m/(≧▽≦)\m/、Lo-fi 是 ☕ 或 (っ˘ω˘ς )、生日歌是 🎂、搞笑视频是 😂；暂停时冒出 😴 或 (｡-ω-)zzZ，"换一次"时冒出 🥳，几秒后自动消失。同一个内容放很久时（长视频、直播），每隔几分钟会再冒一个不一样的表情，角色有时顺便做个动作，频率可以在设置页调。默认动态表情和颜文字混着出，设置页可以只要其中一种，或者关掉。表情来自 Google 的 [Noto 动态表情](https://googlefonts.github.io/noto-emoji-animation/)（CC BY 4.0），已经打包在扩展里，不联网。
- 悬浮窗：在 https 页面上，控制条里有"弹出悬浮窗"按钮，会打开置顶的画中画窗口（Document Picture-in-Picture），切到别的应用也能看到。
- 图鉴、导入角色、AI 设置在扩展的选项页（点工具栏图标 → "图鉴 · 导入角色 · 设置"）。不喜欢的角色可以在图鉴里删除，之后不会再抽到；内置角色删除后可以在图鉴页底部恢复。
- **AI 识别（可选）**：在「AI 模型」页连接你自己的模型——订阅登录（ChatGPT、GitHub Copilot、Kimi、xAI…）、API key（OpenAI、Anthropic、Google、DeepSeek、OpenRouter 等 30 多家），或 Ollama / LM Studio 等自定义端点。基于 [pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai)。只发送标题、作者、域名；不连接也能用本地规则。每个新内容只问一次、请求很短、结果有缓存，所以有免费额度的服务商（NVIDIA、Google AI Studio、Groq、OpenRouter 的免费模型等）就够用。
- **Petdex**：选项页可以搜索 [petdex.dev](https://petdex.dev) 的几千个社区宠物并导入，也可以导入本地的 `pet.json` + `spritesheet.webp`。导入的角色进入通用池，素材不随扩展分发。
- **自动匹配角色（实验，默认关闭）**：在设置页打开后，标题或作者里出现已知的角色、作品、热梗或歌手时，直接换上对应的角色——播放《千本桜》出现初音未来，标题里有"奶龙"出现奶龙。匹配在本机按 [`src/lib/match/table.ts`](src/lib/match/table.ts) 里的规则完成，不需要 AI，也不发送标题；命中时从 Petdex 下载那一个角色，最多保留最近用到的 24 个。对匹配到的角色点"换一次"，会换成同一匹配下的另一个角色（例如另一个初音未来）；这条匹配只有一个角色时才回到普通的池子。规则怎么写、验证过哪些图源，见 [docs/SOURCES.md](docs/SOURCES.md)。

## 架构

| 位置 | 作用 |
|---|---|
| `src/entrypoints/media-hook.content.ts` | 页面主世界脚本：镜像 Media Session 的 handler/元数据，以及未挂到 DOM 的媒体元素（如 Spotify） |
| `src/entrypoints/content/` | 每个 frame 汇报媒体快照并执行指令；顶层 frame 用 Shadow DOM 渲染浮层 |
| `src/entrypoints/background.ts` | 汇总所有标签页的媒体，选出主媒体，转发控制指令 |
| `src/lib/media/` | 通用控制器 + 站点适配器（YouTube、YouTube Music、Bilibili、Spotify） |
| `src/lib/pack/` | 角色包格式、校验、加载 |
| `src/lib/render/` | `Renderer` 接口：精灵图和透明视频两种实现 |
| `src/lib/tagging/` | 本地规则打标签、可选的 AI 打标签、缓存 |
| `src/lib/llm/` | 模型接入（pi-ai）：服务商列表、凭证存储、浏览器版 OAuth 回调 |
| `src/lib/gacha/` | 角色池与抽卡引擎（换一次、锁定、最近记录） |
| `src/lib/petdex.ts`, `src/lib/importer.ts` | Petdex 格式解析、帧数检测、导入 |
| `src/lib/match/` | 按内容直接匹配角色：规则表、匹配器、按需从 Petdex 取用（可选功能） |
| `src/entrypoints/options/` | 图鉴、导入角色、设置 |

## 角色包格式

每个角色是一个文件夹，内含 `pack.json` 和素材文件：

```jsonc
{
  "id": "momo",
  "name": "Momo 歌姬",
  "tags": { "type": ["music"], "genre": ["jpop", "anime"] }, // 空数组 = 通用池
  "size": { "w": 192, "h": 208 },
  "states": {
    "idle":    { "kind": "sprite", "src": "sheet.svg", "frames": 8, "cols": 8, "row": 0, "fps": 6 },
    "playing": { "kind": "video", "src": "dance.webm", "loop": true },
    "appear":  { "kind": "sprite", "src": "sheet.svg", "frames": 8, "cols": 8, "row": 3, "fps": 6, "loop": false }
  }
}
```

- 状态：`idle`（必填）、`playing`、`paused`、`appear`、`click`、`error`，缺失的状态会回落到 `idle`。
- `sprite`：精灵图集，从 `row` 行开始按 `cols` 列排列，共 `frames` 帧。
- `video`：透明 WebM。
- `src` 只能是包内的相对路径或 https URL。

内置的 12 个角色（莉娜、星璃、青歌、霓、麻糬、爆爆、小喜、乐酷、薇奥、艾莉亚、应援酱、听听）用 Google Flow 生成（Nano Banana 画造型、Omni / Veo 生成视频），再由 `python3 scripts/video2pack.py` 转成精灵图，素材和流程在 [`art/`](art/README.md)。另有 3 个隐藏角色在 `art/packs/`，出现条件的代码还没加。`scripts/gen-placeholders.mjs` 是早期占位角色的生成脚本，现在只用来画扩展图标。

## 远程角色库

扩展默认订阅本仓库的 [`library/index.json`](library/index.json)，每 12 小时同步一次，也可以在设置页添加别的库或手动同步。

```
library/
  index.json          { "packs": ["dj-neko", "idol-star"] }   # 最多 100 个
  dj-neko/
    pack.json         # 格式同上，id 必须和文件夹名一致
    sheet.png
```

- 只支持 https；素材只能是包内相对路径或 https，类型限 PNG / WebP / GIF / JPEG / AVIF / WebM（不支持 SVG），单个文件不超过 8MB。
- 下载后存在扩展的 IndexedDB 里，离线也能用；某个库连不上时保留上次的角色。
- `node scripts/gen-raster.mjs` 重新生成 `library/` 里的示例角色和扩展图标。
- `node scripts/gen-emoji.mjs` 重新生成表情气泡用的精灵图（`public/emoji/`，需要联网和 Playwright 的 Chromium）。

想投稿角色：按上面的格式在 `library/` 下加一个文件夹，并把 id 加进 `index.json`，提交 PR。

## 许可证

界面风格「贴纸手帐」：粉色点纸、拍立得卡片、和纸胶带，用在工具栏菜单和选项页；盖在别人网页上的控制条保持白底细边框，只用一处粉色。标题字体是 ZCOOL KuaiLe（SIL OFL 1.1），只打包页面用到的字（`scripts/subset-font.py`，`public/fonts/`）。

代码：MIT。素材的许可证在各角色包的 `license` 字段里单独声明。表情气泡的动画来自 Google Noto Emoji，CC BY 4.0，见 [`public/emoji/LICENSE.md`](public/emoji/LICENSE.md)。
