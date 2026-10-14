# Kobutai 桌面版（Windows）设计

状态：D1 开发中（2026-10-14 启动）。技术路线：**Tauri 2**（Rust 外壳 + 系统自带的 WebView2 + 现有 Svelte/TypeScript 代码）。

## 1. 目标

桌面上常驻一个透明、置顶的小舞台：任何应用在播放时（Spotify 桌面版、浏览器标签页、系统播放器……），角色按内容出场，悬停弹出控制条。和扩展是同一套角色、同一套抽卡和分类模型。

不做的事（D1）：AI 识别、远程角色库同步、Petdex 自动匹配、音量控制、设置窗口、自动更新。见 §7 里程碑。

## 2. 关键决定

| 决定 | 选择 | 原因 |
|---|---|---|
| 框架 | Tauri 2 | 安装包和常驻内存小；保留 Svelte/TS 代码；以后可出 Mac 版 |
| 正在播放的信息 | Windows 系统媒体会话（GSMTC：`GlobalSystemMediaTransportControlsSessionManager`） | 一个接口覆盖所有向系统报告播放的应用，包括 Chrome/Edge 标签页；不录音，不需要权限 |
| 代码组织 | **暂不拆 monorepo**。新增 `desktop/`，用 Vite 别名直接引用 `src/` 里的共用代码 | 扩展零改动风险；做 Mac 版或共用代码变多时再拆 `packages/core` |
| 角色窗口 | 一个铺满主显示器工作区的透明、无边框、置顶、不进任务栏的窗口，默认鼠标穿透 | `Overlay.svelte` 按"视口坐标"布局，整块复用；拖动、气泡、控制条逻辑都不用改 |
| 鼠标穿透 | 前端上报可交互区域（角色、控制条、气泡的矩形），Rust 每 33 ms 读一次光标位置，进入区域时关闭穿透、离开时打开；按住左键期间不切换 | 穿透打开后网页收不到鼠标事件，只能由系统层判断 |
| 设置存储 | 前端替换层：扩展的 `storage`（`#imports`）改由 `localStorage` 实现，`session:` 区放内存 | `settings.ts` 原样复用；角色图片照旧放 IndexedDB（WebView2 支持） |
| 后台逻辑 | 不再有 service worker；`Hub`、抽卡引擎、分类器在角色窗口的页面里运行 | 只有一个窗口，省掉进程间消息 |
| 安装包 | NSIS `.exe`（主）+ MSI，GitHub Actions 的 Windows 机器构建 | 本地 Mac 不能直接出 Windows 包 |
| 签名 | 构建永远产出**未签名**测试包；配置了签名密钥时额外产出已签名包 | 证书在准备中；未签名包用于测试 |

## 3. 架构

```
┌──────────── Rust（desktop/src-tauri）────────────┐
│ media.rs   GSMTC：会话列表、属性、播放状态、时间线  │──事件 media://sessions──┐
│            控制：播放/暂停/切歌/跳转               │◀─命令 media_command──┐  │
│ overlay.rs 透明窗口、工作区尺寸、光标轮询与穿透      │◀─命令 set_hit_regions │  │
│ tray.rs    托盘：显示/隐藏角色、开机启动、退出       │                       │  │
└──────────────────────────────────────────────────┘                       │  │
┌──────────── 前端（desktop/ui，角色窗口）─────────────────────────────────┐ │  │
│ sessions.ts  每个系统会话 → 一个 PortLike，snapshot 送进 Hub ──────────────┘  │
│              Hub 发来的 command → invoke('media_command') ─────────────────┘
│ core.ts      Hub + GachaEngine + Tagger(本地模型) + PackCatalog（移植自 background.ts）
│ main.ts      挂载 Overlay.svelte（src/components），上报可交互区域
│ shims/       #imports 的 storage、browser.runtime.getURL
└───────────────────────────────────────────────────────────────────────────
共用：src/lib（registry、hub、gacha、tagging、pack、render、emoji、i18n）、src/components、public/（角色包、模型、表情）
```

## 4. Rust ↔ 前端接口合同

两边按这份合同各自开发。名字、字段、单位都不要改；要改先改这里。

### 4.1 事件 `media://sessions`（Rust → 前端）

任何会话增减、属性变化、播放状态变化时立即发送；有会话在播放时每 1 秒发送一次（更新进度）。

```ts
interface SessionsPayload {
  sessions: DesktopSession[];
  /** 系统当前的"主会话"（GetCurrentSession），没有则 null */
  currentId: string | null;
}
interface DesktopSession {
  /** SourceAppUserModelId，例如 "Spotify.exe"、"Chrome"、"SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" */
  id: string;
  title: string;
  artist: string;
  albumTitle: string;
  playing: boolean;
  /** 秒；按 LastUpdatedTime 外推到发送时刻（播放中） */
  position: number;
  /** 秒；未知为 0 */
  duration: number;
  canPlay: boolean;
  canPause: boolean;
  canNext: boolean;
  canPrev: boolean;
  canSeek: boolean;
}
```

同时提供命令 `media_sessions(): SessionsPayload`，前端启动时主动拉一次。

### 4.2 命令 `media_command`（前端 → Rust）

```ts
invoke('media_command', { id: string, cmd: DesktopCommand }): Promise<void>
type DesktopCommand =
  | { type: 'play' } | { type: 'pause' } | { type: 'toggle' }
  | { type: 'next' } | { type: 'prev' }
  | { type: 'seek'; time: number }   // 秒
```

找不到会话或系统拒绝时返回错误字符串（前端只记日志）。音量、静音不在 D1 范围：前端不发送。

### 4.3 命令 `set_hit_regions`（前端 → Rust）

```ts
invoke('set_hit_regions', { rects: { x: number; y: number; w: number; h: number }[] }): Promise<void>
```

坐标是角色窗口内的 CSS 像素（逻辑像素），Rust 按窗口缩放比换算。空数组 = 整个窗口穿透。前端在布局、悬停、气泡变化时上报（节流 ≤ 每 50 ms 一次）。

Rust 端规则：光标在任一矩形内 → 不穿透；否则穿透；鼠标左键按住期间保持当前状态（拖动时不会丢失）。

### 4.4 事件 `overlay://cursor`（Rust → 前端）

```ts
interface CursorPayload { inside: boolean }
```

穿透状态每次切换时发送（`inside: true` = 光标进入可交互区域、窗口开始接收鼠标；`false` = 离开、窗口恢复穿透），启动时发一次当前状态。原因：窗口切到穿透后，网页可能收不到 `pointerleave`，悬停状态会卡住。前端收到 `inside: false` 时结束悬停（收起控制条），效果和鼠标正常移出一样。

### 4.5 窗口与托盘

- 角色窗口 label 为 `overlay`：透明、无边框、置顶、`skipTaskbar`、不可调整大小、无阴影，位置和大小等于主显示器工作区（不盖住任务栏）。**点击不抢焦点**：窗口带 `WS_EX_NOACTIVATE`，点角色或控制条时，正在打字的应用不会失去输入焦点（控制条里没有需要键盘输入的控件）。工作区变化（分辨率、任务栏移动）时重新铺满；前端靠 `resize` 事件自适应。
- 托盘菜单（文字跟随系统语言：中/日/英，其他用英文）：显示/隐藏角色、开机启动（勾选，tauri-plugin-autostart）、退出。左键单击托盘图标 = 显示/隐藏。
- 单实例：再次启动时不开第二份（tauri-plugin-single-instance）。

## 5. 前端适配规则

- **会话 → 快照**（`MediaSnapshot`）：`title`、`artist` 直接用；`currentTime = position`、`duration`；`volume = 1`、`muted = false`、`canVolume = false`；`adapter = 'smtc'`；`site` 用下表把应用映射成"伪站点"，让分类器的站点规则继续生效：

  | 应用 id 包含（不区分大小写） | site |
  |---|---|
  | `spotify` | `open.spotify.com` |
  | `applemusic` / `itunes` | `music.apple.com` |
  | `cloudmusic` | `music.163.com` |
  | `qqmusic` | `y.qq.com` |
  | `kugou` | `www.kugou.com` |
  | 其他 | 应用 id 去掉路径和 `.exe` 后的小写名（例如 `chrome`、`msedge`） |

- **`MediaSnapshot` 新增可选字段 `canVolume?: boolean`**（缺省视为 true）。`ControlBar.svelte` 在 false 时隐藏音量和静音。扩展行为不变。
- **主会话**：Hub 的注册表照旧决定"主条目"。会话的 tabId 用 id 的稳定哈希，frameId 固定 0。会话消失 = 端口断开。
- **存储替换层**：实现扩展用到的 `storage` 子集：`defineItem(key, { fallback, init })` 返回 `getValue / setValue / removeValue / watch`，以及 `getItem / setItem / removeItem`；键的 `local:`、`sync:` 前缀存 `localStorage`（JSON），`session:` 存内存；`watch` 同窗口立即通知，跨窗口靠 `storage` 事件。
- **资源路径**：`browser.runtime.getURL(p)` 返回 `p`（Vite 把仓库的 `public/` 作为静态目录）。
- **"在此站点隐藏"**：改成"隐藏这个应用"，D1 先隐藏按钮。PiP 在桌面不需要：不传 `openPip`。

## 6. 构建与测试

- `npm run desktop:dev`：本机开发（需要 Windows + Rust + WebView2）。
- `npm run desktop:build`：出安装包。
- `npm run desktop:check`：前端类型检查和单元测试（任何系统都能跑）。
- CI：`.github/workflows/desktop.yml`，`windows-latest`。推送到 `main` 且改动涉及 `desktop/**`、`src/**`、`public/**` 时运行，也可以手动运行。步骤：前端检查 → `cargo test` → `tauri build` → 上传 `kobutai-desktop-unsigned`（NSIS 和 MSI）。签名步骤在配置了密钥时才运行（D3 补全，取决于证书类型）。
- 未签名包测试：Windows 会提示"已保护你的电脑"，点"更多信息" → "仍要运行"。

### D1 Windows 测试清单

1. 安装：运行 `Kobutai_0.1.0_x64-setup.exe`，不应要求管理员权限；托盘出现图标。
2. Spotify 桌面版播放一首歌：角色出场，曲风合适；切歌后按新歌重新抽。
3. Chrome 或 Edge 里播放 YouTube：同样出场；同时开着 Spotify 时，控制条里能切换来源。
4. 悬停角色出控制条：播放/暂停、上一首/下一首、拖进度条有效；鼠标移开后控制条收起。
5. 鼠标穿透：角色以外的地方，点击、滚动都落在下面的窗口上。
6. 不抢焦点：在记事本里打字时点一下角色或暂停按钮，继续打字，字应该还进记事本。
7. 拖动角色换位置，从托盘退出再打开，位置保留。
8. 托盘：显示/隐藏、开机启动（勾选后重启电脑验证）、退出；再次双击程序不会开出第二个。
9. 记录：哪些播放器拿不到标题（角色不出场），有没有卡顿、闪烁、黑底（透明失效）。

如果第 4 或第 6 条异常（点击没反应、拖不动进度条），把 `desktop/src-tauri/src/overlay.rs` 里的 `NO_ACTIVATE` 改成 `false` 再构建一次对比。

## 7. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| **D1 最小可用** | Tauri 外壳；透明穿透窗口；读取和控制系统媒体会话；抽卡、渲染、气泡、控制条；本地分类模型；托盘、开机启动、单实例；CI 出未签名包 | 在 Windows 11 上：Spotify 桌面版和 Chrome 里的 YouTube 播放时角色出场、按曲风换角色；悬停出控制条，播放/暂停/切歌/拖进度有效；角色以外的地方鼠标能点到下面的窗口；拖动后位置重启仍保留 |
| D2 功能补齐 | 设置窗口（复用设置页：图鉴、导入、模型）；按应用隐藏；每个应用的音量（Windows 音频会话）；AI 识别；远程角色库；专辑封面 | 设置页功能和扩展一致 |
| D3 发布 | 代码签名；自动更新（tauri-plugin-updater + GitHub Releases）；官网下载入口 | 已签名包安装无警告，能自动升级 |

## 8. 风险和待验证

- 不向系统报告播放信息的播放器（部分国内客户端）拿不到标题：D1 实测记录名单。
- 浏览器标签页的会话只有标题和"作者"，没有网址：站点规则失效，靠模型本身判断。
- 全屏看视频时角色是否应该自动躲开：D1 先不处理，D2 根据反馈决定。
- 多显示器：D1 只铺主显示器。
