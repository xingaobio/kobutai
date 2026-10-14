# 角色素材

用 Google Flow 生成角色（Nano Banana 画造型，Veo 生成视频），放进这里，再用脚本转成扩展用的角色包。

## 文件夹

```
art/
  roster.json          角色名单：名字、表演场景、在哪些内容和曲风出场（tags）
  incoming/<角色 id>/  你放素材的地方，每个角色一个文件夹
  packs/<角色 id>/     脚本的产出：sheet.webp、pack.json、preview.gif
```

## 每个角色文件夹里放什么

每个角色文件夹里已经有一份 `PROMPT.md`：造型图提示词和视频提示词都写好了，所有角色的汇总在 `art/PROMPTS.md`。

| 文件名 | 必须 | 内容 |
|---|---|---|
| `PROMPT.md` | 已有 | 这个角色的提示词 |
| `image.png` | 建议 | Nano Banana 生成的造型图（留档，也是生成视频的参考图） |
| `video.mp4` | 必须 | 一段 10 秒视频，依次是：0–2.5 秒待机、2.5–7.5 秒表演、7.5–10 秒点击反应 |
| `clips.json` | 可选 | 模型没按时间走时，改各段的秒数，例如 `{"playing": [3, 8]}` |

也可以每种状态单独一段视频：`idle.mp4`、`playing.mp4`（必须），`appear.mp4`、`click.mp4`（可选）。单独的视频优先于 `video.mp4`。

- 文件名必须和上表一致，脚本靠文件名认状态。
- 视频格式 `.mp4`、`.mov`、`.webm`、`.gif` 都可以。**优先下载 MP4（720p 就够）**：GIF 只有 256 色，边缘会有抖动噪点，脚本能处理，但 MP4 更干净。
- 暂停画面不用单独做，脚本自动取待机里的一帧。
- 脚本会在每个时间段里自动找出最顺滑、能无缝循环的一段。

## 视频的要求

- 镜头固定：不推拉、不平移
- 纯色背景：绿色最好；角色身上有绿色时用蓝色（提示词里已经按角色写好）
- 全身始终在画面里，原地表演，不走出画面

## 转换

```bash
python3 scripts/video2pack.py art/incoming/rina      # 一个角色
python3 scripts/video2pack.py art/incoming/*         # 全部
```

需要 ffmpeg、numpy、Pillow。先打开 `art/packs/<id>/preview.gif` 看效果（左边浅色背景、右边深色背景）；`segments.json` 记录了每种状态取自视频的第几秒。满意后告诉 Claude 把它装进扩展的内置角色。

新增角色：先在 `roster.json` 里加一条（id 只能用小写字母、数字和连字符），再建同名文件夹。

## 哪些文件进 git

只有文字类文件进 git：`roster.json`、提示词（`PROMPTS.md`、各角色的 `PROMPT.md`）、`clips.json`，以及 `packs/<id>/` 下的 `pack.json` 和 `segments.json`。

视频、造型图和预览图（`.mp4`、`.png`、`.gif`、`.webp` 等）体积大，被 `.gitignore` 排除，只存在本机，请自己另做备份。装进扩展的成品精灵图在 `public/packs/<id>/sheet.webp`，那部分在 git 里。
