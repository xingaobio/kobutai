# NOVA：单曲循环彩蛋：机娘电音舞

- **文件夹**：`art/incoming/nova/`
- **出场**：🔒 隐藏角色：同一首歌听到第 3 遍时出现（不进普通抽卡池）
- **背景**：绿幕 `#00B140`
- **代表颜文字**：`[ ^_^ ]♪`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named NOVA: a cheerful android idol girl with a short silver-white bob, glowing cyan eyes, a white robotic headset with small angular ear-shaped antennas, thin cyan light lines along her neck and arms like circuit seams, a white-and-cyan sleeveless futuristic outfit with a short pleated skirt, white mechanical boots. Colour palette: silver white #E9EEF5, cyan #3FE6F2, graphite #2C3140, signal pink #FF6FAE. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key green (#00B140), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate NOVA from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. NOVA stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key green background (#00B140) for the entire clip.
0-2.5 s: standing upright, the cyan light lines pulsing softly, blinking with a tiny head tilt like a robot booting up.
2.5-7.5 s: a precise robotic dance in place: crisp popping and locking moves, arms snapping to angles on the beat, a smooth robot wave through the body, a quick spin, the headset antennas flicking, then the same dance cycle again.
7.5-10 s: freezes with a glitchy startled expression, then gives a salute and a cheerful peace sign, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

完成后这个文件夹里应该有：`PROMPT.md`（本文件）、`image.png`、`video.mp4`，需要时再加 `clips.json`。
