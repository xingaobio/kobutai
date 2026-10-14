# 乐酷 Raku：激烈说唱

- **文件夹**：`art/incoming/raku/`
- **出场**：音乐；曲风 嘻哈、摇滚、电子
- **背景**：绿幕 `#00B140`
- **代表颜文字**：`(⌐■_■)`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Raku: a confident rapper boy with spiky dark-blue hair under a backwards orange cap, sharp golden eyes, an oversized white T-shirt with an abstract graffiti print (no letters), baggy cargo pants, chunky sneakers, a gold chain with a music-note pendant, and a microphone. Colour palette: dark blue #2B3A67, orange #FF7A00, white #FFFFFF, gold #E8C547. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key green (#00B140), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Raku from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Raku stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key green background (#00B140) for the entire clip.
0-2.5 s: standing with one hand in his pocket, slight shoulder bounce, adjusting the cap once.
2.5-7.5 s: a hard-hitting rap in place: rapping into the microphone, free hand chopping down on the beat, leaning back, pointing at the viewer, shoulder bounces, a b-boy stance with crossed arms, then the same cycle again.
7.5-10 s: turns to the viewer and offers a fist bump, then finger guns and a wink, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

完成后这个文件夹里应该有：`PROMPT.md`（本文件）、`image.png`、`video.mp4`，需要时再加 `clips.json`。
