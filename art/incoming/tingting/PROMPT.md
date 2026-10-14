# 听听 Tingting：认真听播客

- **文件夹**：`art/incoming/tingting/`
- **出场**：播客、视频
- **背景**：蓝幕（角色身上有绿色） `#0047BB`
- **代表颜文字**：`(・・？)`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Tingting: a thoughtful listener kid with short brown hair and a cowlick, round curious eyes, a cosy green cardigan, big over-ear headphones, holding a small notebook and a pencil. Colour palette: green #6FA36F, brown #8B5E3C, cream #F4EFE6, ink #33333D. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key blue (#0047BB), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Tingting from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Tingting stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key blue background (#0047BB) for the entire clip.
0-2.5 s: standing with the notebook under one arm, tapping the pencil on the chin, one blink.
2.5-7.5 s: listening carefully to a podcast: nodding along, writing quickly in the notebook, pencil on the chin thinking, raising a finger with an "aha" face, writing again, then the same cycle again.
7.5-10 s: looks up, lifts one side of the headphones with a curious head tilt, smiles and waves the pencil, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

完成后这个文件夹里应该有：`PROMPT.md`（本文件）、`image.png`、`video.mp4`，需要时再加 `clips.json`。
