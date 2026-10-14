# 爆爆 Popo：看视频、看直播的观众

- **文件夹**：`art/incoming/popo/`
- **出场**：视频、直播
- **背景**：绿幕 `#00B140`
- **代表颜文字**：`(・ω・)つ🍿`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Popo: an excitable viewer kid with fluffy short orange-brown hair and a popcorn-shaped hair clip, freckles, big brown eyes, a red-and-white striped hoodie, holding a red-and-white popcorn bucket. Colour palette: orange-brown #F28C38, red #D93B3B, butter #FFF4D6, dark brown #5A3A2E. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key green (#00B140), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Popo from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Popo stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key green background (#00B140) for the entire clip.
0-2.5 s: holding the popcorn bucket, chewing, picking one piece and eating it, one blink.
2.5-7.5 s: watching something exciting: munching, leaning forward with wide eyes, gasping with a hand over the mouth, bursting out laughing and holding the belly, munching again, then the same reactions again.
7.5-10 s: looks at the viewer and holds out the popcorn bucket to offer some, then pulls it back with a cheeky grin, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

完成后这个文件夹里应该有：`PROMPT.md`（本文件）、`image.png`、`video.mp4`，需要时再加 `clips.json`。
