# HappyDesk 设计文档

> 状态：已确认（2026-10-02）。本文是 grilling 会话达成的共识，改动需经用户确认。

## 1. 产品一句话

Chrome 扩展：网页上悬浮一个动画角色，根据当前播放内容从素材库**自动抽卡**出场；鼠标悬停弹出媒体控制条，可跨标签页控制播放。开源项目。

## 2. 平台与浮层

- **平台**：仅 Chrome / Chromium 系，Manifest V3。
- **浮层形态**：
  - 默认：content script 向页面注入 Shadow DOM 浮层（样式隔离）。
  - 可一键弹出为 Document Picture-in-Picture 系统级悬浮窗（M3）。
- **显示范围**：所有普通网页显示；支持"本站点隐藏"。
- **交互**：
  - 可拖动、可缩放，位置按站点记忆。
  - 页面进入全屏时自动隐藏。
  - 点击角色触发互动动作。
  - 悬停时在角色下方浮出控制条。

## 3. 媒体控制

- **范围**：播放/暂停、上一首/下一首、进度条（可拖动）、音量、封面与标题。
- **跨标签页**：后台 service worker 汇总所有标签页的媒体状态。
  - **主媒体规则**：最后开始播放的标签页。
  - 控制条内有下拉菜单，可手动切换。
- **站点适配**：
  - 通用适配器：`<video>`/`<audio>` 元素 + `navigator.mediaSession.metadata`。
  - 专项适配（验收站点）：YouTube、YouTube Music、Bilibili、Spotify Web（上一首/下一首等通过站点按钮触发）。
  - 其他站点走通用适配，尽力而为。

## 4. 素材（角色包）

- **形式**：循环动画片段，不做 Live2D，但渲染层抽象为 `Renderer` 接口，预留扩展。
- **自定义格式**：每个角色是一个文件夹，内含 `pack.json` 和各状态素材。

  ```jsonc
  // pack.json
  {
    "id": "miku-like-singer",
    "name": "麦克风歌姬",
    "author": "...",
    "license": "...",
    "tags": { "type": ["music"], "genre": ["jpop", "anime"] }, // 空数组 = 通用池
    "size": { "w": 192, "h": 208 },
    "states": {
      "idle":    { "kind": "sprite", "src": "idle.webp", "frames": 8, "cols": 8, "fps": 8 },
      "playing": { "kind": "video",  "src": "playing.webm", "loop": true },
      "paused":  { ... },
      "appear":  { ... },  // 出场（可选，缺省回落 idle）
      "click":   { ... }   // 点击互动（可选）
    }
  }
  ```

  - `kind: "sprite"` 表示精灵图集（任意帧数）。
  - `kind: "video"` 表示透明 WebM。
  - 缺失的状态回落到 `idle`。
- **Petdex 适配器**：读取 Petdex/Codex 宠物格式。
  - 格式：`pet.json` + `spritesheet.webp`，8 列 × 9 行，每格 192×208。
  - 状态映射：
    - idle → idle
    - running / jumping → playing
    - waiting → paused
    - waving → appear
    - failed → error
  - Petdex 宠物进入**通用池**。
  - **不随扩展打包分发**：由用户自行拉取（版权原因）。
- **分发**：
  - M1/M2：内置素材打包在扩展内。
  - M3：素材库来自 GitHub 仓库的 `index.json`，按需下载，缓存在 IndexedDB。

## 5. 识别与抽卡

- **标签体系**（两层，约 10 个桶 + 通用池）：
  - 内容类型 `type`：`music | video | live | podcast | other`
  - 音乐风格 `genre`：`jpop | anime | western-pop | hiphop | rock | electronic | classical | lofi | cpop | other`
- **打标签流程**：
  1. 先用本地关键词规则（标题/频道/域名）。
  2. 若设置页填写了 Anthropic API key，再调用 Claude 输出结构化标签（官方 SDK，JSON schema 结构化输出，effort low，默认模型 `claude-opus-5-5`，可在设置里改）。最多等 6 秒，超时先用规则结果，AI 结果晚到也会写入缓存。
     - key 只存在本地 `chrome.storage.local`，不写进代码。
     - 只发送标题、频道、域名，不发送完整 URL 或页面内容。
  3. 结果按"标题+频道"缓存。
- **抽卡规则**：
  - 每检测到一次新内容开始播放，就在匹配的曲风池中**等概率随机**抽一次。池子为空时回落到通用池。
  - 每个内容可以"换一次"：在同一曲风池重抽，不可退回。
  - 可以"锁定"当前角色，锁定后不再自动抽。
  - **无稀有度、无付费**。
  - 图鉴：记录抽到过的角色 ID，在图鉴页展示。

## 6. 存储

- 无账号体系。
- `chrome.storage.sync`：图鉴（角色 ID 列表）、锁定状态。
- `chrome.storage.local`：设置、AI key、浮层位置/大小（按站点）、标签缓存。
- `chrome.storage.local`：导入角色的元数据（`userPacks`）、AI 识别缓存。
- `chrome.storage.session`：当前抽卡结果和最近 50 个内容的抽卡记录（service worker 重启后保留）。
- 扩展 IndexedDB：导入角色的精灵图（Petdex 一张约 2MB）。素材以 `hdblob:<id>` 引用；content script 只按需向 background 取当前角色的那一张。M3 的远程素材缓存也放在这里。
- 渲染：扩展内置素材直接用 CSS 背景图；其他来源（导入、远程）在 content script 里 fetch 后画到 canvas 上，避免被网页的 CSP 拦截。

## 7. 技术栈

- WXT（Vite）+ TypeScript + Svelte 5。
- 浮层在 Shadow DOM 中渲染。
- 测试：Vitest 跑单元测试；Playwright 加载已构建的扩展跑端到端冒烟测试（尽量做到）。
- 许可证：代码 MIT；素材在 `assets/LICENSE` 中单独声明。

## 8. 里程碑

- **M1 骨架**：
  - 浮层、拖动/缩放/记忆位置、全屏隐藏。
  - 跨标签页媒体控制与悬停控制条。
  - 3–5 个内置角色，按 playing/paused 切换动画。
- **M2 抽卡**：
  - 规则打标签 + 可选 AI。
  - 角色池与抽卡、换一次、锁定、图鉴页。
  - Petdex 适配器。
- **M3 增强**：
  - Document PiP 悬浮窗。
  - 远程素材库（GitHub `index.json` + IndexedDB 缓存）。
  - 上架准备（权限最小化、隐私说明、商店素材文案）。

各阶段的验收标准见 [GOAL.md](./GOAL.md)。

## 9. 暂时搁置

- 素材版权：上架前必须处理。
- 内置 AI 代理后端（如果以后需要"系统内置 AI"）。
- 仓库何时公开。
