# Chrome Web Store 上架材料

## 基本信息

- **名称**：HappyDesk 悬浮角色播放器（en: HappyDesk – floating gacha media mascot）
- **类别**：娱乐（Entertainment）
- **语言**：中文（简体）、English
- **主页**：https://github.com/xingaobio/happydesk
- **隐私政策 URL**：仓库公开后使用 `https://github.com/xingaobio/happydesk/blob/main/PRIVACY.md`
- **打包**：`npm run zip` → `.output/happydesk-<version>-chrome.zip`

## 简短描述（≤132 字符）

- zh_CN：网页上的悬浮小角色：听什么就随机抽谁出来陪你，悬停即可跨标签页控制播放。
- en：A floating mascot drawn at random to match what you play. Hover it to control media across tabs.

## 详细描述（zh_CN）

HappyDesk 在网页角落放一个会动的小角色，替代浏览器里藏得很深的媒体控制：

• 悬停角色就能播放 / 暂停、切歌、拖进度、调音量，并且能控制其他标签页里正在播放的内容。
• 抽卡：每开始播放一首新歌或一个新视频，就会根据内容类型和曲风（J-Pop、动漫、欧美、说唱、摇滚、电子、古典、Lo-fi、华语…）随机抽一个角色出场。每首可以"换一次"，也可以锁定喜欢的角色。
• 图鉴：收集抽到过的角色，没抽到的显示为剪影。
• 置顶悬浮窗：一键弹出到画中画窗口，切到别的应用也能看到。
• 角色可以从 Petdex 社区导入，或订阅远程角色库。
• 可选 AI 识别：填入你自己的 Anthropic API key，用 Claude 更准确地识别曲风（只发送标题、作者、域名）。
• 已适配 YouTube、YouTube Music、哔哩哔哩、Spotify 网页版，其他网站通用支持。

开源、无广告、无统计，开发者不收集任何数据。

## Detailed description (en)

HappyDesk puts an animated mascot in the corner of every page and turns it into a media remote:

• Hover the mascot to play/pause, skip, seek and change volume — for media playing in any tab.
• Gacha: each new song or video draws a random character from the pool that matches its type and genre. Reroll once per track, or lock a favourite.
• Collection book of every character you have drawn.
• Pop out into an always-on-top Picture-in-Picture window.
• Import pets from the Petdex community or subscribe to remote character libraries.
• Optional AI tagging with your own Anthropic API key (only title, artist and domain are sent).
• Tuned for YouTube, YouTube Music, Bilibili and Spotify Web; works generically elsewhere.

Open source, no ads, no analytics, no data collection.

## 单一用途说明（Single purpose）

在网页上显示一个悬浮角色，并用它控制浏览器里正在播放的媒体。

## 权限理由（Permission justification）

| 权限 | 理由 |
|---|---|
| `storage` | 保存浮层位置、隐藏的网站、图鉴、锁定角色、AI 设置和识别缓存。 |
| `alarms` | 每小时唤醒一次后台，检查订阅的远程角色库是否需要更新（每 12 小时一次）。 |
| 内容脚本 `<all_urls>` | 扩展的核心功能是在用户访问的任何网页上显示悬浮角色，并读取/控制该页面正在播放的音视频。没有在所有网站运行，就无法在任意网站上显示角色和控制媒体。内容脚本不读取页面正文、表单或 Cookie。 |
| 页面主世界脚本（`world: MAIN`） | 只用于观察网页的 Media Session（标题、上一首/下一首按钮）以及未挂到页面上的音频元素（如 Spotify），以便控制它们。 |
| `optional_host_permissions: https://*/*` | 默认不授予。用户添加自定义远程角色库、且该服务器不支持 CORS 时，只针对那一个源申请。 |
| `web_accessible_resources: packs/*`（`use_dynamic_url`） | 让网页里的浮层能加载内置角色图片；动态 URL 防止网站探测扩展。 |

**远程代码**：不使用。所有代码都打包在扩展里；远程角色库只下载图片 / 视频和 JSON 数据，并经过格式校验。

**数据使用声明**：不收集用户数据（见 PRIVACY.md）。可选的 AI 识别会把内容标题、作者、域名发给用户自己的 Anthropic 账号。

## 素材

- 图标：`public/icon/{16,32,48,96,128}.png`（`node scripts/gen-raster.mjs` 生成）
- 宣传图 440×280：`docs/store/promo-440x280.png`
- 截图 1280×800：`docs/store/screenshot-*.png`（`STORE_SHOTS=1 npx playwright test store-shots` 生成）

## 上架前检查

- [ ] 仓库公开，`PRIVACY.md` 和默认角色库地址可以访问
- [ ] 内置角色和远程库素材的版权已确认（当前都是本项目生成的原创占位角色，MIT）
- [ ] Petdex 导入功能的版权提示仍然显示在导入页
- [ ] `npm run check` 和 `npm run e2e` 全部通过
- [ ] `package.json` 版本号已更新
