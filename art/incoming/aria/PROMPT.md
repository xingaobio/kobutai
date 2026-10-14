# 艾莉亚 Aria：流行舞台唱跳

- **文件夹**：`art/incoming/aria/`
- **出场**：音乐；曲风 欧美流行、华语、嘻哈
- **背景**：绿幕 `#00B140`
- **代表颜文字**：`ヽ(＾Д＾)ﾉ`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Aria: a pop star girl with a long honey-blonde high ponytail, heart-shaped sunglasses pushed up on her head, a glittery pink cropped jacket over a purple top, white shorts, white sneakers, and a small headset microphone. Colour palette: hot pink #FF5DA2, honey #FFC94D, white #FFFFFF, purple #7A4DFF. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key green (#00B140), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Aria from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Aria stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key green background (#00B140) for the entire clip.
0-2.5 s: standing with a hand on her hip and a confident smile, flipping the ponytail once.
2.5-7.5 s: a pop-star stage routine in place: hip pop while singing into the headset, arm wave, step-touch, hair flip, pointing at the viewer, a spin, a jump with arms in a V, then the same routine again.
7.5-10 s: laughs, points at the viewer, flashes a peace sign and winks, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

完成后这个文件夹里应该有：`PROMPT.md`（本文件）、`image.png`、`video.mp4`，需要时再加 `clips.json`。
