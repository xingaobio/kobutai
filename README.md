# HappyDesk

一个 Chrome 扩展：网页上悬浮一个动画角色，根据你正在播放的内容出场；鼠标悬停弹出媒体控制条，可以跨标签页控制播放。

- 设计文档：[docs/DESIGN.md](docs/DESIGN.md)
- 进度与验收：[docs/GOAL.md](docs/GOAL.md)

## 开发

```bash
npm install
npm run dev        # 启动带热重载的 Chrome
npm run check      # 类型检查 + 单元测试 + 构建
npm run e2e        # 构建后用 Playwright 加载扩展跑端到端测试
```

手动加载：`npm run build`，然后在 `chrome://extensions` 打开开发者模式，"加载已解压的扩展程序"选择 `.output/chrome-mv3`。

首次运行 E2E 前需要 `npx playwright install chromium`。

## 架构

| 位置 | 作用 |
|---|---|
| `src/entrypoints/media-hook.content.ts` | 页面主世界脚本：镜像 Media Session 的 handler/元数据，以及未挂到 DOM 的媒体元素（如 Spotify） |
| `src/entrypoints/content/` | 每个 frame 汇报媒体快照并执行指令；顶层 frame 用 Shadow DOM 渲染浮层 |
| `src/entrypoints/background.ts` | 汇总所有标签页的媒体，选出主媒体，转发控制指令 |
| `src/lib/media/` | 通用控制器 + 站点适配器（YouTube、YouTube Music、Bilibili、Spotify） |
| `src/lib/pack/` | 角色包格式、校验、加载 |
| `src/lib/render/` | `Renderer` 接口：精灵图和透明视频两种实现 |

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

## 许可证

代码：MIT。素材的许可证在各角色包的 `license` 字段里单独声明。
