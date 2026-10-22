# Chrome 应用商店上架材料

上传和填表时直接从这里复制。商店后台：<https://chrome.google.com/webstore/devconsole>

## 要上传的文件

| 用途 | 文件 | 规格 |
|---|---|---|
| 扩展包 | `npm run zip` 生成的 `.output/kobutai-<版本>-chrome.zip` | |
| 截图（英文） | `docs/marketing/store/en/1-hero.png` … `5-characters.png` | 1280×800，共 5 张 |
| 截图（中文） | `docs/marketing/store/zh/1-hero.png` … `5-characters.png` | 1280×800，给中文商店页用 |
| 小宣传图 | `docs/marketing/store/promo-440x280.png` | 440×280 |
| 商店图标 | `public/icon/128.png` | 128×128 |

截图用 `KOBUTAI_E2E=1 npx wxt build && STORE_SHOTS=1 npx playwright test store-shots` 重新生成（第 1、5 张来自官网 `site/index.html`）。

## 基本信息

- **名称**：来自扩展包里的 `public/_locales/*/messages.json`，商店会自动读取：英文 "Kobutai – a tiny stage for what you play"，中文、日文 "Kobutai 小舞台"
- **默认语言**：English（`default_locale: en`）；中文（简体）和日文由扩展包自动提供
- **类别**：Lifestyle → Entertainment（找不到时选 Fun）
- **官网 / 主页**：https://kobutai.pages.dev
- **支持网址**：https://github.com/xingaobio/kobutai/issues
- **隐私政策网址**：https://kobutai.pages.dev/privacy.html

## 简短描述

商店的简短描述直接用扩展包里的 `extDescription`，不用另填。

## 详细描述

### English

```
Kobutai puts a little chibi performer in the corner of the page, drawn to match whatever you're playing, and turns it into a remote for your music.

• A draw for every song. Each new song or video draws one character from the pool for its genre: a guitarist for rock, a violinist for classical, a popcorn kid for a funny video. Draw again once, or lock a favourite.
• Knows the genre, offline. A small model trained for Kobutai (about 2.6 MB) reads the title, artist and site on your computer: music, video, live stream or podcast, plus 10 genres. No API key, no audio recording, nothing sent.
• Control from any tab. Hover the character to play, pause, skip, seek or change volume, even when the music lives in another tab. There's also a toolbar mini player and an always-on-top picture-in-picture window.
• Sticker album. Every character you've drawn is collected in the album; ones you haven't met yet are silhouettes.
• Bring your own. Import community characters from Petdex or a sprite sheet you drew yourself, and share it with everyone.
• Little moods. Kaomoji and animated emoji bubbles say what's on, and every character talks in its own voice, in English, Japanese or Chinese.
• Optional AI. Connect your own model (30+ providers; free tiers are plenty) as a second opinion. It's asked only about items the built-in model is unsure of, and only their title, artist and site are sent.
• English, Japanese and Chinese.

Tuned for YouTube, YouTube Music, Spotify and Bilibili, and works on most other pages that play audio or video.

Free and open source. No account, no ads, no analytics.
```

### 中文

```
Kobutai 在网页角落放一个 Q 版小角色：你放什么，就抽一个相配的角色出场，鼠标移上去就是音乐遥控器。

• 每首歌抽一次：每放一首新歌或一个新视频，就从对应曲风的角色池里抽一个——摇滚是弹吉他的莉娜，古典是拉小提琴的薇奥，搞笑视频是抱着爆米花的爆爆。可以"换一次"，也可以锁定喜欢的角色。
• 离线听出曲风：专门为 Kobutai 训练的小模型（约 2.6 MB）在你的电脑上读标题、作者和网站名，判断是音乐、视频、直播还是播客，以及 10 种曲风。不用 API key，不录音，什么都不发送。
• 跨标签页控制：悬停角色即可播放、暂停、切歌、拖进度、调音量，音乐在别的标签页里也能控制；工具栏还有迷你播放器和置顶的画中画悬浮窗。
• 贴纸图鉴：抽到过的角色都收进图鉴，没遇到的显示为剪影。
• 导入自己的角色：从 Petdex 导入社区角色，或导入自己画的精灵图，还可以投稿分享给所有人。
• 小表情：颜文字和动态表情气泡说明正在放什么，每个角色还会用自己的口吻说话（中英日三语）。
• 可选的 AI：连上你自己的模型（30 多家服务商，免费额度就够）做第二意见，只在内置模型没把握时才问它，也只发送标题、作者和网站名。
• 中文、英文、日文。

已适配 YouTube、YouTube Music、Spotify、哔哩哔哩，其他能放音视频的网页大多也能用。

免费开源。不需要账号，没有广告，没有统计。
```

### 日本語

```
Kobutai は、再生中の曲に合わせてちびキャラが登場する、ブラウザの小さな舞台です。キャラにカーソルを合わせれば、音楽のリモコンになります。

• 1 曲ごとに 1 回ガチャ：新しい曲や動画が始まるたびに、そのジャンルのキャラから 1 体が登場。ロックならギターのリナ、クラシックならバイオリンのヴィオラ、おもしろ動画ならポップコーンのポポ。1 回だけ引き直したり、お気に入りをロックしたりできます。
• ジャンルをオフラインで判定：Kobutai のために学習させた小さなモデル（約 2.6 MB）が、曲名・アーティスト・サイト名をあなたのパソコンの中で読み取り、音楽・動画・ライブ・ポッドキャストと 10 種類のジャンルを判定します。API キー不要、録音なし、何も送りません。
• どのタブからでも操作：キャラにカーソルを合わせると、再生・一時停止・曲送り・シーク・音量を操作できます。音楽が別のタブで流れていても大丈夫。ツールバーのミニプレーヤーと、常に手前に表示されるピクチャー・イン・ピクチャーもあります。
• シール図鑑：出会ったキャラは図鑑に集まり、まだのキャラはシルエットで表示されます。
• 自分のキャラも：Petdex のコミュニティキャラや、自分で描いたスプライトシートを読み込めます。みんなに共有することもできます。
• 小さな気分：顔文字やアニメーション絵文字の吹き出しが、いま何を流しているかを教えてくれます。キャラはそれぞれの口調でしゃべります（日本語・英語・中国語）。
• AI はお好みで：自分のモデル（30 以上のサービス。無料枠で十分）をセカンドオピニオンとしてつなげます。内蔵モデルが迷ったときだけ問い合わせ、送るのは曲名・アーティスト・サイト名だけです。
• 日本語・英語・中国語に対応。

YouTube、YouTube Music、Spotify、bilibili に最適化。音声や動画を再生するほとんどのページで動きます。

無料・オープンソース。アカウント不要、広告なし、アクセス解析なし。
```

## 隐私页（Privacy practices）

### 单一用途（Single purpose）

```
Shows a small animated character on web pages that matches the media you are playing, and lets you control that media (play, pause, skip, seek, volume) from any tab.
```

### 权限理由（Permission justification）

| 权限 | 复制到后台的英文理由 |
|---|---|
| `storage` | `Saves the user's settings, the overlay position per site, the character album, imported characters, the recognition cache and, only if the user connects their own AI provider, that provider's API key or sign-in token. Everything stays in the browser.` |
| `alarms` | `Wakes the background worker once an hour to check whether the subscribed character libraries need their 12-hourly update.` |
| Host permission（内容脚本 `<all_urls>`） | `The extension's single purpose is to show the character on whatever page the user is playing media on and to read and control that page's audio/video (title, artist, playback state, play/pause/seek/volume). It must run on all sites because media can play on any site. The content scripts do not read page text, forms or cookies.` |
| `optional_host_permissions`（`https://*/*`、`http://*/*`） | `Not granted at install. Requested at runtime, for one origin at a time, only when the user (1) adds a custom character library on a host without CORS, (2) connects an AI provider of their choice (its API and sign-in hosts; localhost/127.0.0.1 to complete OAuth sign-in), or (3) adds a self-hosted model endpoint such as a local Ollama server.` |

如果后台单独问到 `web_accessible_resources`：`Lets the on-page overlay load the built-in character and emoji images. use_dynamic_url stops websites from detecting the extension.`

### 远程代码（Remote code）

选 **No, I am not using remote code**。所有代码都打包在扩展里；远程角色库只下载图片和 JSON，并经过格式校验。

### 数据使用（Data usage）

开发者不收集任何数据。但商店问的是"扩展会处理哪些数据"，保守起见勾这两项：

- **Website content**：正在播放的标题、作者、网站域名。默认只在本机识别；只有用户自己连接 AI 服务商时，内置模型没把握的那些内容才会发给用户选的服务商。
- **Authentication information**：用户自己添加的 AI 服务商 API key 或登录令牌，只保存在本机，只发给该服务商用于认证。

然后勾选三条承诺：不出售或转让给第三方（用户自己选的服务商除外）；不用于与单一用途无关的目的；不用于判断信用或放贷。

## 分发（Distribution）

- **价格**：免费
- **地区**：所有地区
- **可见性**：先选 **Unlisted（不公开）** 给朋友测试也可以；准备好 Product Hunt 再改成 Public

## 提交前检查

- [ ] `npm run check` 和 `npm run e2e` 全部通过
- [ ] `package.json` 的版本号比上次提交的高（第一次提交用 0.1.0 即可）
- [ ] 内置角色是用 Google Flow（Nano Banana、Omni / Veo）生成的原创角色，确认所用套餐的条款允许发布
- [ ] 默认角色库 `library/` 里还是两个早期占位角色（DJ Neko、偶像 Star），风格和 12 个新角色不一致，决定是否清空 `library/index.json`
- [ ] 「自动匹配角色」默认关闭，但规则表里有商业 IP 和真人形象（见 `docs/development/SOURCES.md` 的"已知限制"），决定是否随上架版本提供
- [ ] 分类模型训练数据中的 Apple 公开榜单：收费（包括 Patreon 回报）前核实使用条款，或去掉这部分数据重新训练（见 `docs/development/CLASSIFIER.md`）
- [ ] 审核通过、发布后：把 `site/index.html` 里的 `STORE_URL` 改成商店地址，官网按钮就会从"即将上架"变成"添加到 Chrome"
