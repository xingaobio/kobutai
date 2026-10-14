# 角色提示词（Flow：Nano Banana + Omni / Veo）

每个角色两段提示词：先用 **Nano Banana** 生成造型图，再把造型图交给 **Omni 或 Veo** 生成一段 10 秒视频。视频里按时间顺序做完三种动作，脚本会自动切开：

| 时间 | 状态 | 扩展里什么时候用 |
|---|---|---|
| 0–2.5 秒 | 待机 | 没在播放时循环；暂停时取其中一帧定格 |
| 2.5–7.5 秒 | 表演 | 播放时循环（唱、跳、弹琴…） |
| 7.5–10 秒 | 点击反应 | 用户点角色时播一次 |

## 操作步骤

1. 打开角色文件夹里的 `PROMPT.md`（内容和本文件里对应的一节相同）。
2. 在 Flow 里用 Nano Banana 跑 **①造型图**，满意后下载，命名为 `image.png` 放进角色文件夹。
3. 用 Omni（或 Veo）生成视频：把 `image.png` 设为参考图（能设首帧就设为首帧），粘贴 **②视频提示词**，时长选 10 秒。满意后下载 **MP4**，命名为 `video.mp4` 放进同一个文件夹。
4. 在项目目录运行 `python3 scripts/video2pack.py art/incoming/<id>`（或 `art/incoming/*` 一次处理全部）。
5. 打开 `art/packs/<id>/preview.gif` 看效果。动作切得不对时，看 `art/packs/<id>/segments.json` 里每段取的是第几秒，在角色文件夹里放一个 `clips.json` 调整，例如 `{"playing": [3, 8]}`，再运行一次。

## 生成时的诀窍

- **背景**：大部分角色用绿幕；身上有绿色的角色（青歌、麻糬、应援酱、听听）用蓝幕，提示词里已经写好。
- **固定镜头最重要**：视频里镜头一动，脚本就没法对齐。不满意就让 Omni 改："keep the camera completely still"。
- **表演要重复**：提示词要求同一套动作做两遍，这样脚本更容易找到能无缝循环的片段。
- **Omni 可以对话修改**：动作不对时不用重新生成，直接说 "make the jump smaller" 或 "keep her feet in the same spot"。
- **原地表演**：角色走出画面、走远走近，缩放就会不稳。
- **一次只换一个角色**：先把一个角色走通，再批量做。

建议先做第一批 7 个：莉娜 Rina、星璃 Hoshiri、青歌 Qingge、霓 Nei、麻糬 Mochi、爆爆 Popo、小喜 Kiki。

## 隐藏角色

隐藏角色不进普通抽卡池，只在特定情况下出现，是彩蛋而不是"稀有度"：

- **月白 Tsukishiro**：凌晨 0～4 点在听音乐时出现
- **NOVA**：同一首歌听到第 3 遍时出现
- **莓莓 Meimei**：10 秒内连续点角色 10 次时出现

素材和普通角色做法完全一样。出现条件需要扩展里加一点代码，素材做好后告诉 Claude 一起加上。

---

## 莉娜 Rina：激烈唱跳：摇滚主唱 + 吉他

- **文件夹**：`art/incoming/rina/`
- **出场**：音乐；曲风 摇滚、欧美流行
- **背景**：绿幕 `#00B140`
- **代表颜文字**：`\m/(≧▽≦)\m/`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Rina: a high-energy rock singer girl with a short messy crimson bob and one black streak, sharp amber eyes, a black leather jacket with small star patches over a white tank top, a red plaid skirt, chunky black boots, and a small black-and-red electric guitar on a strap. Colour palette: crimson #E8384F, black #1E1E24, off-white #F5F5F0, amber #F2B33D. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key green (#00B140), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Rina from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Rina stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key green background (#00B140) for the entire clip.
0-2.5 s: standing relaxed with the guitar slung, breathing gently, tapping one foot, one slow blink.
2.5-7.5 s: an intense rock performance in place: strumming the guitar hard, headbanging, a small jump and landing on the beat, singing loudly with mouth wide open, then the same jump-strum-headbang cycle again.
7.5-10 s: a startled little hop, then she grins and flashes a devil-horns hand sign at the viewer, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

---

## 星璃 Hoshiri：偶像唱跳

- **文件夹**：`art/incoming/hoshiri/`
- **出场**：音乐；曲风 J-pop、动漫
- **背景**：绿幕 `#00B140`
- **代表颜文字**：`☆*:.｡.o(≧▽≦)o.｡.:*☆`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Hoshiri: an idol singer girl with long lavender-to-pink gradient hair in two high side buns held by gold star clips, large violet eyes with star-shaped highlights, a white and lilac frilly idol dress with a big bow, white ankle boots, and a handheld microphone with a small star on it. Colour palette: lavender #B79CFF, pink #FF8FC7, white #FFFFFF, gold #FFD95A. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key green (#00B140), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Hoshiri from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Hoshiri stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key green background (#00B140) for the entire clip.
0-2.5 s: holding the microphone to her chest, swaying softly side to side, smiling, one blink.
2.5-7.5 s: an idol song-and-dance in place: singing into the microphone, step to the right pointing at the sky, half turn with the skirt flaring, heart hands, step to the left with a heel kick, wink with a peace sign, then the same routine again.
7.5-10 s: blushes and covers her cheeks with both hands, then gives a cheerful wave, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

---

## 青歌 Qingge：安静地唱：抒情

- **文件夹**：`art/incoming/qingge/`
- **出场**：音乐；曲风 华语、J-pop
- **背景**：蓝幕（角色身上有绿色） `#0047BB`
- **代表颜文字**：`♪～(´ε｀ )`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Qingge: a gentle ballad singer girl with long straight black hair decorated with a jade-green hairpin and a loose ribbon, calm dark eyes, a long celadon-green cardigan with a subtle traditional Chinese collar over a simple white dress, soft cloth shoes, standing at a vintage microphone on a stand. Colour palette: celadon #7FB8A4, charcoal #2B2B33, ivory #F7F3EA, muted gold #C9A86A. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key blue (#0047BB), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Qingge from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Qingge stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key blue background (#0047BB) for the entire clip.
0-2.5 s: standing beside the vintage microphone stand with hands folded, slow calm breathing, hair moving slightly, one slow blink.
2.5-7.5 s: a quiet ballad: eyes closed, singing softly into the microphone, swaying slowly left and right, one hand rising gently to her chest on a long note and lowering again, then the same gentle sway again.
7.5-10 s: turns her head toward the viewer with a soft surprised smile and a small wave of her long sleeve, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

---

## 霓 Nei：跳舞：DJ / 电音

- **文件夹**：`art/incoming/nei/`
- **出场**：音乐；曲风 电子、欧美流行
- **背景**：绿幕 `#00B140`
- **代表颜文字**：`┏(＾0＾)┛┗(＾0＾)┓`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Nei: a dancer DJ girl with short silver hair with neon cyan tips, cat-ear headphones in cyan and magenta, an oversized black hoodie with neon stripes on the sleeves, black shorts, chunky high-top sneakers, and glowing wristbands. Colour palette: neon cyan #19E3FF, magenta #FF3FD8, navy #22223A, silver #E6E9F2. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key green (#00B140), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Nei from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Nei stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key green background (#00B140) for the entire clip.
0-2.5 s: standing with hands in the hoodie pocket, nodding slightly to a quiet beat, adjusting the headphones once.
2.5-7.5 s: an energetic shuffle dance in place: arms up, shuffle kicks, running-man steps, a quick spin with the hood flying, a fist-pump jump, then the same dance cycle again.
7.5-10 s: lifts one headphone off her ear with a puzzled look, then gives a thumbs up and puts it back, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

---

## 麻糬 Mochi：安静陪伴：Lo-fi

- **文件夹**：`art/incoming/mochi/`
- **出场**：音乐；曲风 Lo-fi、古典
- **背景**：蓝幕（角色身上有绿色） `#0047BB`
- **代表颜文字**：`(っ˘ω˘ς )`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Mochi: a sleepy cosy girl sitting on a cushion, with messy cream-coloured hair in a low bun held by a pencil, round glasses, sleepy green eyes, an oversized beige knit sweater, holding a warm mug, with a small orange cat sitting next to her. Colour palette: cream #F2E3C6, sage #8DB580, brown #6B4F3F, cat orange #F49E4C. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key blue (#0047BB), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Mochi from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Mochi stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key blue background (#0047BB) for the entire clip.
0-2.5 s: sitting on the cushion holding the mug with both hands, taking a slow sip, the cat beside her flicking its tail.
2.5-7.5 s: a calm lo-fi vibe: eyes closed, gently nodding her head to a slow beat while holding the mug, the cat nodding along and swaying its tail, the same slow nod repeating.
7.5-10 s: startles awake, her glasses slip down her nose, she pushes them up and gives a sleepy smile, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

---

## 爆爆 Popo：看视频、看直播的观众

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

---

## 小喜 Kiki：吉祥物：认不出内容时出场

- **文件夹**：`art/incoming/kiki/`
- **出场**：全部内容（通用池）
- **背景**：绿幕 `#00B140`
- **代表颜文字**：`♪(´▽｀)`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Kiki: a cheerful little desk spirit girl with sunny yellow short hair and a single curl shaped like a music note on top, big orange eyes, white headphones resting around her neck, a yellow hoodie with a round smiley badge, and a star-shaped hairpin. Colour palette: sunny yellow #FFD23F, orange #FF9F1C, white #FFFFFF, ink #3A3A48. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key green (#00B140), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Kiki from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Kiki stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key green background (#00B140) for the entire clip.
0-2.5 s: standing and looking around curiously, the music-note curl on her head bouncing, a small wave, one blink.
2.5-7.5 s: a happy groove in place: bouncing to the music with eyes closed and humming, swaying left and right, clapping on the beat, then the same bounce-sway-clap cycle again.
7.5-10 s: giggles, does a quick spin, then points at the viewer and laughs, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

---

## 乐酷 Raku：激烈说唱

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

---

## 薇奥 Viola：安静演奏：小提琴

- **文件夹**：`art/incoming/viola/`
- **出场**：音乐；曲风 古典、动漫、Lo-fi
- **背景**：绿幕 `#00B140`
- **代表颜文字**：`(￣▽￣)♪～`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Viola: an elegant violinist girl with long wavy silver-blonde hair tied with a black velvet ribbon, calm blue eyes, a navy-and-white dress with a lace collar, black shoes, holding a violin and bow. Colour palette: silver-blonde #E9E4D4, navy #23325C, white #FFFFFF, violin wood #B8862B. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key green (#00B140), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Viola from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Viola stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key green background (#00B140) for the entire clip.
0-2.5 s: holding the violin under one arm and the bow in the other hand, calm breathing, glancing shyly at the viewer.
2.5-7.5 s: a quiet violin performance: eyes closed, playing with long slow bow strokes, the body swaying gently with each stroke, the same slow strokes repeating.
7.5-10 s: plucks one string, listens to the note with a small surprised smile, then blushes and nods, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

---

## 艾莉亚 Aria：流行舞台唱跳

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

---

## 应援酱 Ouen：打 call 应援

- **文件夹**：`art/incoming/ouen/`
- **出场**：直播
- **背景**：蓝幕（角色身上有绿色） `#0047BB`
- **代表颜文字**：`(ﾉ´∀｀)ﾉ♪`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Ouen: an enthusiastic fan girl with a black bob with mint-green ends and blunt bangs, sparkling eyes, a heart-shaped headband, a mint festival happi coat with a wave pattern (no letters), and a glowstick in each hand, one mint and one pink. Colour palette: mint #5CE1B9, pink #FF7EB6, black #222222, white #FFFFFF. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key blue (#0047BB), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Ouen from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Ouen stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key blue background (#0047BB) for the entire clip.
0-2.5 s: holding a glowstick in each hand and swaying excitedly, one bounce.
2.5-7.5 s: a high-energy fan cheer in place: glowsticks raised high, swung down in big circles, crossed in front, a jump with both raised, thrust forward on the beat, waved side to side, then the same cheer again.
7.5-10 s: turns and points a glowstick at the viewer with a wink, then waves both glowsticks, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

---

## 听听 Tingting：认真听播客

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

---

## 月白 Tsukishiro：深夜限定：抱着月亮安静地唱

- **文件夹**：`art/incoming/tsukishiro/`
- **出场**：🔒 隐藏角色：凌晨 0～4 点在听音乐时出现（不进普通抽卡池）
- **背景**：蓝幕（角色身上有绿色） `#0047BB`
- **代表颜文字**：`(_ _).｡o○ ☾`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Tsukishiro: a dreamy late-night girl with long snow-white hair and soft white rabbit ears with pale pink insides, heterochromia eyes (left violet, right gold), a cream oversized pajama hoodie decorated with retro Heisei-style stickers (stars, hearts, a small crescent moon, no letters), fluffy slippers, hugging a big crescent-moon pillow. Colour palette: snow white #F4F2FA, lavender #B9A6E8, moon gold #F2CF5B, pale pink #F7C6D9. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key blue (#0047BB), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Tsukishiro from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Tsukishiro stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key blue background (#0047BB) for the entire clip.
0-2.5 s: sitting on the floor hugging the crescent-moon pillow, rabbit ears drooping sleepily, slow breathing, one slow blink.
2.5-7.5 s: a quiet late-night song: eyes half closed, softly singing while swaying slowly with the moon pillow, rabbit ears gently bobbing to the rhythm, the same slow sway repeating.
7.5-10 s: her rabbit ears shoot straight up in surprise, she peeks over the pillow at the viewer, then smiles sleepily and waves a little, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应

---

## NOVA：单曲循环彩蛋：机娘电音舞

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

---

## 莓莓 Meimei：连戳彩蛋：地雷系小恶魔

- **文件夹**：`art/incoming/meimei/`
- **出场**：🔒 隐藏角色：10 秒内连续点角色 10 次时出现（不进普通抽卡池）
- **背景**：绿幕 `#00B140`
- **代表颜文字**：`(｀∀´)Ψ`

**① 造型图（Nano Banana）** → 保存为 `image.png`

```
Full-body character illustration of an original character named Meimei: a mischievous little devil girl in jirai-kei fashion with long black twin tails with pink inner colour, pink eyes with heart-shaped highlights, tiny glossy black devil horns, small bat wings, a thin devil tail with a heart tip, a black-and-pink frilly blouse with a big ribbon, a black skirt, platform Mary Jane shoes, holding a strawberry-shaped plush. Colour palette: black #1C1A22, sakura pink #FF8FB8, strawberry red #E8394F, cream white #FFF4F7. Standing in a relaxed pose, facing three-quarters toward the viewer, centred, the whole body in frame with empty space around it, feet near the bottom. Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Background: a flat solid chroma-key green (#00B140), perfectly even, no gradient, no shadow. Avoid: any background scenery, floor, shadow under the feet, text, letters, logo, watermark, extra characters, glow or particles outside the character, resemblance to any existing anime character, VTuber, game character or brand mascot.
```

**② 10 秒视频（Omni / Veo，把 image.png 作为参考图或首帧）** → 下载 MP4，保存为 `video.mp4`

```
Animate Meimei from the reference image. One continuous 10-second shot with a locked-off static camera: no zoom, no pan, no cuts. Meimei stays in the centre of the frame in the same spot, the whole body always visible, on the same flat solid chroma-key green background (#00B140) for the entire clip.
0-2.5 s: standing with the strawberry plush, swinging it slowly, devil tail swishing, a sly smile and one blink.
2.5-7.5 s: a playful cute-but-mischievous dance in place: hopping side to side with the twin tails bouncing, making heart hands, a wink with a tongue out, tail swishing on the beat, wings fluttering, then the same routine again.
7.5-10 s: puffs her cheeks in mock anger, points at the viewer, then laughs and blows a kiss, returning to the relaxed pose.
Keep the exact character design from the reference: same face, hair, outfit, colours and proportions, chibi anime style with clean outlines and flat colours. Smooth, clear motion. No other characters, no new props, no text, no particles or effects, no lighting or background changes.
```

**③ 时间分段**（脚本按这个切，模型没按时间走就改 `clips.json`）：0–2.5 秒待机 · 2.5–7.5 秒表演 · 7.5–10 秒点击反应
