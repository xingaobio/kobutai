# HappyDesk

一个 Chrome 扩展：网页上悬浮一个动画角色，根据你正在播放的内容出场；鼠标悬停弹出媒体控制条，可以跨标签页控制播放。

- 设计文档：[docs/DESIGN.md](docs/DESIGN.md)
- 进度与验收：[docs/GOAL.md](docs/GOAL.md)
- 隐私政策：[PRIVACY.md](PRIVACY.md)
- 上架材料：[docs/store/listing.md](docs/store/listing.md)

## 开发

```bash
npm install
npm run dev        # 启动带热重载的 Chrome
npm run check      # 类型检查 + 单元测试 + 构建
npm run e2e        # 构建后用 Playwright 加载扩展跑端到端测试
npm run zip        # 打包上架用的 .output/happydesk-<version>-chrome.zip
```

手动加载：`npm run build`，然后在 `chrome://extensions` 打开开发者模式，"加载已解压的扩展程序"选择 `.output/chrome-mv3`。

首次运行 E2E 前需要 `npx playwright install chromium`。`PETDEX_LIVE=1 npm run e2e` 会额外跑一个连真实 petdex.dev 的导入测试。

## 抽卡与角色

- 每次开始播放新内容，后台先给内容打标签（类型 + 曲风），再从对应池子里等概率抽一个角色。回到之前播过的内容，会恢复当时抽到的角色。
- 每个内容可以"换一次"（同一个池子，不能退回）；可以锁定当前角色，锁定后不再抽。
- 悬浮窗：在 https 页面上，控制条里有"弹出悬浮窗"按钮，会打开置顶的画中画窗口（Document Picture-in-Picture），切到别的应用也能看到。
- 图鉴、导入角色、AI 设置在扩展的选项页（点工具栏图标 → "图鉴 · 导入角色 · 设置"）。
- **AI 识别（可选）**：在设置里填自己的 Anthropic API key。只发送标题、作者、域名；不填也能用本地规则。
- **Petdex**：选项页可以搜索 [petdex.dev](https://petdex.dev) 的几千个社区宠物并导入，也可以导入本地的 `pet.json` + `spritesheet.webp`。导入的角色进入通用池，素材不随扩展分发。

## 架构

| 位置 | 作用 |
|---|---|
| `src/entrypoints/media-hook.content.ts` | 页面主世界脚本：镜像 Media Session 的 handler/元数据，以及未挂到 DOM 的媒体元素（如 Spotify） |
| `src/entrypoints/content/` | 每个 frame 汇报媒体快照并执行指令；顶层 frame 用 Shadow DOM 渲染浮层 |
| `src/entrypoints/background.ts` | 汇总所有标签页的媒体，选出主媒体，转发控制指令 |
| `src/lib/media/` | 通用控制器 + 站点适配器（YouTube、YouTube Music、Bilibili、Spotify） |
| `src/lib/pack/` | 角色包格式、校验、加载 |
| `src/lib/render/` | `Renderer` 接口：精灵图和透明视频两种实现 |
| `src/lib/tagging/` | 本地规则打标签、可选的 Claude 打标签、缓存 |
| `src/lib/gacha/` | 角色池与抽卡引擎（换一次、锁定、最近记录） |
| `src/lib/petdex.ts`, `src/lib/importer.ts` | Petdex 格式解析、帧数检测、导入 |
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

内置占位角色由 `node scripts/gen-placeholders.mjs` 生成到 `public/packs/`。

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

想投稿角色：按上面的格式在 `library/` 下加一个文件夹，并把 id 加进 `index.json`，提交 PR。

## 许可证

代码：MIT。素材的许可证在各角色包的 `license` 字段里单独声明。
