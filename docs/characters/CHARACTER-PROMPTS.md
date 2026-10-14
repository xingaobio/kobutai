# 内置角色生成提示词

用 AI 绘图工具生成一套原创二次元 Q 版角色，替换现在的 5 个内置角色（Momo、Rocky、Lo-fi 猫、讲解员 Blob、Pixel）。每个角色对应一种"表演场景"：激烈唱跳、偶像唱跳、安静地唱、跳舞、安静陪伴、看视频……抽卡时按内容和曲风出场。

## 怎么用

1. 先读第一节的**技术标准**：不符合标准的图放不进扩展。
2. 每个角色按第三节的步骤生成：先画**设定图**，再拿它当参考图，逐行画**动画**。
3. 提示词用英文写（大部分绘图工具对英文理解更好）。每段提示词末尾都要带上第二节的**统一画风**，整套角色才像一个系列。
4. 生成完按第五节的清单自查，把图放进项目的 `art/incoming/<角色 id>/` 文件夹，告诉我。
5. 我来切帧、对齐、拼成精灵图、写 `pack.json`、替换内置角色并跑测试。**尺寸不用精确，我会统一缩放和对齐。**

建议顺序：先做**第一批 7 个**（覆盖所有曲风和内容类型），满意了再做第二批。

---

## 一、技术标准（必须满足）

### 格式

| 项目 | 要求 |
|---|---|
| 每一帧（格子） | 192 × 208 像素（宽 × 高），竖向略长 |
| 精灵图 | 8 列，每行一个状态，最后由我拼成 1536 × 1040（5 行） |
| 每行帧数 | 4～8 帧，首选 8 帧 |
| 背景 | 透明（PNG）。工具做不到透明就用纯白或纯绿背景，我来抠图 |
| 角色位置 | 每帧居中，**脚底在同一条线上**（离格子底边约 8 像素），每帧角色大小一致，不能忽大忽小 |
| 留白 | 头顶留约 10% 空白（表情气泡会贴在角色右上角），手脚、道具不能超出格子 |
| 禁止 | 文字、字母、标志、水印、签名、边框、格子线、地面、脚下阴影、飘在角色外面的光效和粒子 |
| 文件 | PNG，单个文件不超过 8 MB |

### 状态（每个角色 5 行）

| 行 | 状态 | 什么时候出现 | 循环 | 建议帧率 | 要点 |
|---|---|---|---|---|---|
| 1 | `idle` 待机 | 没在播放 | 循环 | 6 | 呼吸、眨眼、小幅摇晃。**必须有** |
| 2 | `playing` 播放 | 正在播放 | 循环 | 6～12 | 这个角色的**表演场景**，最重要的一行。第 8 帧要能自然接回第 1 帧 |
| 3 | `paused` 暂停 | 暂停时 | — | — | **只显示第 1 帧**，定格并稍微变暗。第 1 帧必须是好看的"等你回来"姿势，其余帧可以重复第 1 帧 |
| 4 | `appear` 出场 | 抽到这个角色时 | 播一次 | 8 | 从无到有的登场动作，最后一帧接近待机姿势 |
| 5 | `click` 点击 | 用户点角色时 | 播一次 | 8 | 被戳到的反应，最后一帧回到待机姿势 |

最少要有 `idle`、`playing`、`paused` 三行；`appear`、`click` 缺了会自动用待机代替，可以以后再补。

### 显示环境

- 角色在网页上大约显示为 **100～140 像素高**，背景可能是白色也可能是深色：轮廓要清楚，小尺寸下也认得出是谁。
- 播放时程序会额外加一点上下律动，暂停时自动变暗，这些**不用画进图里**。

### 原创和授权

- 必须是**原创角色**，不能像任何已有的动漫角色、VTuber、游戏角色或品牌吉祥物。
- 记录用的是哪个工具、哪个模型、哪天生成的；确认该工具的条款允许商用。

---

## 二、统一画风（每段提示词末尾都加上）

**STYLE**

```
Style: original chibi anime character, about 2.5 heads tall, big expressive eyes with a highlight, clean dark outline, flat cel shading with a single shadow tone, soft saturated colours, a silhouette that stays readable at 120 px tall, cute and friendly. Full body visible, facing three-quarters toward the viewer. Transparent background.
```

**NEGATIVE**（工具有"负面提示"栏就填这里，没有就接在提示词后面写 "Avoid: …"）

```
background, scenery, floor, shadow under the feet, glow or particles outside the character, text, letters, numbers, logo, watermark, signature, border, grid lines, cropped limbs, extra fingers, blurry, photorealistic, 3D render, resemblance to any existing anime character, VTuber, game character or brand mascot
```

---

## 三、生成步骤（通用模板）

花括号 `{…}` 里的内容从第四节的角色卡复制。

### 第 1 步：设定图

```
Character design reference sheet of an original character named {NAME}: {LOOK}. Colour palette: {PALETTE}. Show the same character three times side by side at the same size: front view, three-quarter view, back view, standing in a neutral pose. {STYLE}
```

满意后再生成一张**标准形象**，作为后面每一步的参考图：

```
The same character as the attached reference sheet, alone, full body, standing in a relaxed idle pose, centred, feet near the bottom edge. Keep every design detail identical. {STYLE}
```

### 第 2 步：逐行画动画（每次上传标准形象作参考图）

大部分工具画不出 8:1 的超长图，所以每行画成 **4 列 × 2 排** 的网格（横版 3:2），我来切开：

```
Using the attached image as the exact character (same face, hair, outfit, colours and proportions; do not redesign anything), draw the "{STATE}" animation as 8 frames arranged in a grid of 4 columns and 2 rows, read left to right, top to bottom. Every frame is the same size, the character is the same scale in every frame and its feet stay on the same baseline. Leave clear empty space between frames. Frames: {FRAMES}. {LOOP_NOTE} {STYLE}
```

- 循环动作（idle、playing）的 `{LOOP_NOTE}` 填：`Frame 8 must flow smoothly back into frame 1.`
- 只播一次的动作（appear、click）填：`The last frame ends close to the relaxed idle pose.`
- paused 填：`Frame 1 is the most important: a clear, appealing pose. Frames 2-8 can repeat frame 1 with tiny breathing changes.`

### 第 3 步：画不好时的备用方法

**一次画一帧。** 网格里的角色走样，或者帧之间对不上时，就一帧一帧地画，每次都附上标准形象：

```
Using the attached image as the exact character (do not redesign anything), draw a single frame: {ONE FRAME DESCRIPTION}. Full body, centred, same scale as the reference, feet near the bottom edge. {STYLE}
```

**减少帧数。** 实在画不齐 8 帧，可以只画 4 个关键帧（每格动作差别大一点），扩展支持 4 帧的动画。

### 工具小贴士

- **ChatGPT（GPT 图像）**：可以上传参考图；提示里写 transparent background 通常能出透明背景。
- **Gemini（Nano Banana）**：擅长按参考图保持角色一致，适合第 2、3 步。
- **Midjourney**：有"角色参考"功能（参数名随版本变化），但不能出透明背景，需要后期抠图。
- 通用：一次只改一个地方；某一帧不满意就单独重画那一帧，不用整行重来。

---

## 四、角色卡

每个角色的 `tags` 决定它在哪些内容出场：`type` 是内容类型（音乐、视频、直播、播客），`genre` 是曲风。同一个曲风至少要有 2 个角色，"换一次"才有得换；两批都做完后每个曲风都有 2 个以上。

### 总览

| 批次 | id | 名字 | 表演场景 | 内容类型 | 曲风 |
|---|---|---|---|---|---|
| 1 | `rina` | 莉娜 | 激烈唱跳：摇滚主唱 + 吉他 | 音乐 | 摇滚、欧美流行 |
| 1 | `hoshiri` | 星璃 | 偶像唱跳 | 音乐 | J-pop、动漫 |
| 1 | `qingge` | 青歌 | 安静地唱：抒情 | 音乐 | 华语、J-pop、其他 |
| 1 | `nei` | 霓 | 跳舞：DJ / 电音 | 音乐 | 电子、欧美流行 |
| 1 | `mochi` | 麻糬 | 安静陪伴：Lo-fi | 音乐 | Lo-fi、古典、其他 |
| 1 | `popo` | 爆爆 | 看视频、看直播的观众 | 视频、直播 | — |
| 1 | `kiki` | 小喜 | 吉祥物：认不出内容时出场 | 全部 | —（通用池） |
| 2 | `raku` | 乐酷 | 激烈说唱 | 音乐 | 嘻哈、摇滚、电子 |
| 2 | `viola` | 薇奥 | 安静演奏：小提琴 | 音乐 | 古典、动漫、Lo-fi |
| 2 | `aria` | 艾莉亚 | 流行舞台唱跳 | 音乐 | 欧美流行、华语、嘻哈 |
| 2 | `ouen` | 应援酱 | 打 call 应援 | 直播 | — |
| 2 | `tingting` | 听听 | 认真听播客 | 播客、视频 | — |

"代表颜文字"是角色的口头禅，可以用在宣传图上，以后也可以放进表情气泡。

---

### 1. 莉娜 Rina：激烈唱跳（摇滚）

- **tags**：type `music`，genre `rock`、`western-pop`
- **性格**：嗓门大、自信、停不下来
- **代表颜文字**：`\m/(≧▽≦)\m/`
- **{NAME}**：`Rina`
- **{LOOK}**：`a high-energy rock singer girl with a short messy crimson bob and one black streak, sharp amber eyes, a black leather jacket with small star patches over a white tank top, a red plaid skirt, chunky black boots, and a small black-and-red electric guitar on a strap`
- **{PALETTE}**：`crimson #E8384F, black #1E1E24, off-white #F5F5F0, amber #F2B33D`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) standing with the guitar slung, tapping one foot; 2) foot up; 3) foot down, shoulders relaxed; 4) flicks her fringe with one hand; 5) blinks; 6) tiny head nod; 7) grips the guitar neck; 8) back to frame 1` |
| playing（帧率 12） | `1) crouched, ready to jump, hand on the strings; 2) jumping up while strumming hard; 3) in the air, hair flying, mouth wide open singing; 4) landing, head banged down; 5) head thrown back shouting; 6) wide power stance, strumming; 7) guitar raised high with both hands; 8) dropping back toward the crouch` |
| paused | `1) sitting cross-legged hugging the guitar, eyes half closed, small smile; 2-8) same pose with tiny breathing changes` |
| appear | `1) only her boots visible dropping in from above; 2) landing in a crouch; 3) standing up; 4) guitar swung forward; 5) power pose; 6) devil-horns hand sign; 7) grin; 8) relaxed idle pose` |
| click | `1) startled hop; 2) in the air, surprised face; 3) landing; 4) turns to the viewer; 5) devil-horns sign; 6) wink; 7) grin; 8) relaxed idle pose` |

### 2. 星璃 Hoshiri：偶像唱跳

- **tags**：type `music`，genre `jpop`、`anime`
- **性格**：元气、爱笑、舞台感强
- **代表颜文字**：`☆*:.｡.o(≧▽≦)o.｡.:*☆`
- **{NAME}**：`Hoshiri`
- **{LOOK}**：`an idol singer girl with long lavender-to-pink gradient hair in two high side buns held by gold star clips, large violet eyes with star-shaped highlights, a white and lilac frilly idol dress with a big bow, white ankle boots, and a handheld microphone with a small star on it`
- **{PALETTE}**：`lavender #B79CFF, pink #FF8FC7, white #FFFFFF, gold #FFD95A`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) holding the microphone to her chest, smiling; 2) sways left; 3) centre; 4) sways right; 5) small wave with her free hand; 6) blinks; 7) tilts her head cutely; 8) back to frame 1` |
| playing（帧率 10） | `1) singing into the microphone, free arm stretched out; 2) step to the right, pointing at the sky; 3) half turn, skirt flaring; 4) turn completed, hair flowing; 5) heart shape with both hands; 6) step to the left, one heel kicked up behind; 7) wink with a peace sign; 8) microphone back to her mouth` |
| paused | `1) microphone lowered, looking at the viewer with a soft smile, hands together; 2-8) same pose with tiny breathing changes` |
| appear | `1) a small burst of her silhouette; 2) appearing with a little jump; 3) landing; 4) arms open; 5) peace sign; 6) wink; 7) smile; 8) relaxed idle pose` |
| click | `1) surprised; 2) blushing, both hands on her cheeks; 3) shy smile; 4) waving; 5) waving; 6) blowing a kiss; 7) giggling; 8) relaxed idle pose` |

### 3. 青歌 Qingge：安静地唱（抒情）

- **tags**：type `music`，genre `cpop`、`jpop`、`other`
- **性格**：温柔、安静、唱歌时会闭上眼睛
- **代表颜文字**：`♪～(´ε｀ )`
- **{NAME}**：`Qingge`
- **{LOOK}**：`a gentle ballad singer girl with long straight black hair decorated with a jade-green hairpin and a loose ribbon, calm dark eyes, a long celadon-green cardigan with a subtle traditional Chinese collar over a simple white dress, soft cloth shoes, standing at a vintage microphone on a stand`
- **{PALETTE}**：`celadon #7FB8A4, charcoal #2B2B33, ivory #F7F3EA, muted gold #C9A86A`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) standing beside the microphone stand, hands folded; 2) slow breath in; 3) breath out; 4) hair sways slightly; 5) blinks; 6) looks at the viewer with a soft smile; 7) tucks hair behind her ear; 8) back to frame 1` |
| playing（帧率 6～8） | `1) eyes closed, singing softly, one hand on the stand, body leaning slightly left; 2) centred; 3) leaning slightly right; 4) free hand rising to her chest; 5) head lifted, singing a high note; 6) free hand extended softly forward; 7) centred, hand returning; 8) leaning slightly left again` |
| paused | `1) a step back from the microphone, hands clasped, eyes closed, peaceful smile; 2-8) same pose with tiny breathing changes` |
| appear | `1) walking in from the side; 2) walking; 3) reaching the stand; 4) adjusting the microphone; 5) small bow; 6) bow; 7) rising; 8) relaxed idle pose` |
| click | `1) turns her head; 2) slight surprise; 3) small smile; 4) waves with her long sleeve; 5) waves; 6) little bow; 7) smile; 8) relaxed idle pose` |

### 4. 霓 Nei：跳舞（DJ / 电音）

- **tags**：type `music`，genre `electronic`、`western-pop`
- **性格**：酷、话少、一听到节拍就停不下来
- **代表颜文字**：`┏(＾0＾)┛┗(＾0＾)┓`
- **{NAME}**：`Nei`
- **{LOOK}**：`a dancer DJ girl with short silver hair with neon cyan tips, cat-ear headphones in cyan and magenta, an oversized black hoodie with neon stripes on the sleeves, black shorts, chunky high-top sneakers, and glowing wristbands`
- **{PALETTE}**：`neon cyan #19E3FF, magenta #FF3FD8, navy #22223A, silver #E6E9F2`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) standing, nodding to a quiet beat; 2) nod down; 3) nod up; 4) adjusts the headphones with one hand; 5) blinks; 6) hands in hoodie pocket; 7) small shoulder bounce; 8) back to frame 1` |
| playing（帧率 12） | `1) both arms up, leaning left; 2) shuffle step, one foot kicked out; 3) arms crossed in front of the chest; 4) running-man step; 5) both arms up, leaning right; 6) quick spin, hood flying; 7) jumping with a fist pump; 8) landing, knees bent` |
| paused | `1) headphones around her neck, sitting on the ground hugging her knees, looking at the viewer a bit bored; 2-8) same pose with tiny breathing changes` |
| appear | `1) sliding in from the side; 2) sliding; 3) stopping with a pose; 4) pulling the headphones on; 5) head nod; 6) peace sign; 7) smirk; 8) relaxed idle pose` |
| click | `1) lifts one headphone off her ear; 2) puzzled look; 3) leans toward the viewer; 4) thumbs up; 5) thumbs up; 6) puts the headphone back; 7) nod; 8) relaxed idle pose` |

### 5. 麻糬 Mochi：安静陪伴（Lo-fi）

- **tags**：type `music`，genre `lofi`、`classical`、`other`
- **性格**：慢吞吞、爱犯困、很治愈
- **代表颜文字**：`(っ˘ω˘ς )`
- **{NAME}**：`Mochi`
- **{LOOK}**：`a sleepy cosy girl sitting on a cushion, with messy cream-coloured hair in a low bun held by a pencil, round glasses, sleepy green eyes, an oversized beige knit sweater, holding a warm mug, with a small orange cat sitting next to her`
- **{PALETTE}**：`cream #F2E3C6, sage #8DB580, brown #6B4F3F, cat orange #F49E4C`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) sitting, holding the mug with both hands; 2) sipping; 3) lowering the mug, content sigh; 4) the cat flicks its tail; 5) she blinks slowly; 6) the cat looks up at her; 7) she smiles; 8) back to frame 1` |
| playing（帧率 5～6） | `1) eyes closed, head nodding down gently to the beat; 2) head up; 3) head down, the cat's tail sways left; 4) head up, tail sways right; 5) head down, faint steam curls from the mug; 6) head up; 7) head down, the cat nods too; 8) head up` |
| paused | `1) dozing off, head tilted onto her shoulder, the cat curled up asleep beside her; 2-8) same pose with tiny breathing changes` |
| appear | `1) walking in carrying the mug; 2) walking; 3) the cat trotting after her; 4) sitting down on the cushion; 5) the cat sits; 6) she settles; 7) sip; 8) relaxed idle pose` |
| click | `1) startled awake; 2) glasses slipping down her nose; 3) pushing the glasses up; 4) blinking; 5) sleepy smile; 6) the cat yawns; 7) she yawns; 8) relaxed idle pose` |

### 6. 爆爆 Popo：看视频、看直播的观众

- **tags**：type `video`、`live`，genre 无
- **性格**：吃货、反应大、看什么都很投入
- **代表颜文字**：`(・ω・)つ🍿`
- **{NAME}**：`Popo`
- **{LOOK}**：`an excitable viewer kid with fluffy short orange-brown hair and a popcorn-shaped hair clip, freckles, big brown eyes, a red-and-white striped hoodie, holding a red-and-white popcorn bucket`
- **{PALETTE}**：`orange-brown #F28C38, red #D93B3B, butter #FFF4D6, dark brown #5A3A2E`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) holding the popcorn bucket, chewing; 2) chewing; 3) picking a piece; 4) eating it; 5) blinks; 6) looks around; 7) shakes the bucket; 8) back to frame 1` |
| playing（帧率 8） | `1) munching while watching; 2) leaning forward, eyes wide; 3) gasping, hand over mouth; 4) a single popcorn piece popping up from the bucket (kept close to the bucket); 5) laughing; 6) laughing harder, holding the belly; 7) munching again; 8) settling back` |
| paused | `1) the bucket is empty, looking at the viewer with pleading puppy eyes; 2-8) same pose with tiny breathing changes` |
| appear | `1) jumping in hugging the bucket; 2) in the air; 3) landing; 4) wobbling; 5) steadying; 6) grin; 7) first bite; 8) relaxed idle pose` |
| click | `1) looks at the viewer; 2) holds the bucket out, offering popcorn; 3) offering; 4) pulls it back; 5) eats one himself; 6) cheeky grin; 7) chewing; 8) relaxed idle pose` |

### 7. 小喜 Kiki：吉祥物（通用）

- **tags**：type 空，genre 空（通用池：认不出内容时出场）
- **性格**：好奇、开朗，是 Kobutai 的"桌面精灵"
- **代表颜文字**：`♪(´▽｀)`
- **{NAME}**：`Kiki`
- **{LOOK}**：`a cheerful little desk spirit girl with sunny yellow short hair and a single curl shaped like a music note on top, big orange eyes, white headphones resting around her neck, a yellow hoodie with a round smiley badge, and a star-shaped hairpin`
- **{PALETTE}**：`sunny yellow #FFD23F, orange #FF9F1C, white #FFFFFF, ink #3A3A48`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) standing, looking around curiously; 2) looks left; 3) looks right; 4) the music-note curl bounces; 5) blinks; 6) small wave; 7) hands behind her back; 8) back to frame 1` |
| playing（帧率 8） | `1) bouncing to the music, eyes closed, humming; 2) bounce up; 3) bounce down, swaying left; 4) bounce up; 5) bounce down, swaying right; 6) clapping; 7) clapping; 8) bounce down` |
| paused | `1) sitting with her chin on her hands, waiting patiently, headphones around her neck; 2-8) same pose with tiny breathing changes` |
| appear | `1) peeking in from the side; 2) hopping in; 3) landing; 4) arms wide open; 5) big smile; 6) wave; 7) wave; 8) relaxed idle pose` |
| click | `1) giggles; 2) spins; 3) spinning; 4) spin completed; 5) points at the viewer; 6) laughs; 7) bows; 8) relaxed idle pose` |

---

### 8. 乐酷 Raku：激烈说唱（第二批）

- **tags**：type `music`，genre `hiphop`、`rock`、`electronic`
- **性格**：嘴快、自来熟、节奏感满分
- **代表颜文字**：`(⌐■_■)`
- **{NAME}**：`Raku`
- **{LOOK}**：`a confident rapper boy with spiky dark-blue hair under a backwards orange cap, sharp golden eyes, an oversized white T-shirt with an abstract graffiti print (no letters), baggy cargo pants, chunky sneakers, a gold chain with a music-note pendant, and a microphone`
- **{PALETTE}**：`dark blue #2B3A67, orange #FF7A00, white #FFFFFF, gold #E8C547`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) standing with one hand in his pocket; 2) shoulder bounce; 3) shoulder bounce; 4) adjusts the cap; 5) blinks; 6) taps the microphone on his palm; 7) smirks; 8) back to frame 1` |
| playing（帧率 10） | `1) microphone up, rapping; 2) free hand chopping down on the beat; 3) leaning back; 4) pointing at the viewer; 5) shoulder bounce; 6) arms crossed in a b-boy stance; 7) jumping; 8) landing` |
| paused | `1) squatting, spinning the cap on one finger, relaxed grin; 2-8) same pose with tiny breathing changes` |
| appear | `1) sliding in; 2) stopping; 3) putting on sunglasses; 4) adjusting them; 5) pose; 6) nod; 7) smirk; 8) relaxed idle pose (sunglasses back on his head)` |
| click | `1) turns to the viewer; 2) fist forward for a fist bump; 3) fist bump; 4) pulls back; 5) laughs; 6) finger guns; 7) wink; 8) relaxed idle pose` |

### 9. 薇奥 Viola：安静演奏（小提琴，第二批）

- **tags**：type `music`，genre `classical`、`anime`、`lofi`
- **性格**：优雅、专注、有点害羞
- **代表颜文字**：`(￣▽￣)♪～`
- **{NAME}**：`Viola`
- **{LOOK}**：`an elegant violinist girl with long wavy silver-blonde hair tied with a black velvet ribbon, calm blue eyes, a navy-and-white dress with a lace collar, black shoes, holding a violin and bow`
- **{PALETTE}**：`silver-blonde #E9E4D4, navy #23325C, white #FFFFFF, violin wood #B8862B`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) holding the violin under one arm and the bow in the other hand; 2) breath; 3) breath; 4) tucks a strand of hair; 5) blinks; 6) glances at the viewer shyly; 7) small smile; 8) back to frame 1` |
| playing（帧率 6） | `1) eyes closed, bow at the start of a long stroke, body leaning slightly left; 2) bow a quarter across; 3) bow halfway, centred; 4) bow three quarters, leaning slightly right; 5) bow at the end, head tilted; 6) bow starting back; 7) bow halfway back, centred; 8) bow almost back to the start` |
| paused | `1) violin lowered under one arm, standing calmly with a small smile; 2-8) same pose with tiny breathing changes` |
| appear | `1) walking in; 2) walking; 3) stopping; 4) curtsy begins; 5) curtsy; 6) rising; 7) raising the violin; 8) relaxed idle pose` |
| click | `1) surprised; 2) plucks one string; 3) listening to the note; 4) small smile; 5) blushes; 6) little nod; 7) smile; 8) relaxed idle pose` |

### 10. 艾莉亚 Aria：流行舞台唱跳（第二批）

- **tags**：type `music`，genre `western-pop`、`cpop`、`hiphop`
- **性格**：天生的舞台中心，自信又热情
- **代表颜文字**：`ヽ(＾Д＾)ﾉ`
- **{NAME}**：`Aria`
- **{LOOK}**：`a pop star girl with a long honey-blonde high ponytail, heart-shaped sunglasses pushed up on her head, a glittery pink cropped jacket over a purple top, white shorts, white sneakers, and a small headset microphone`
- **{PALETTE}**：`hot pink #FF5DA2, honey #FFC94D, white #FFFFFF, purple #7A4DFF`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) hand on hip, confident smile; 2) shifts weight; 3) flips the ponytail; 4) adjusts the sunglasses; 5) blinks; 6) small wave; 7) hand back on hip; 8) back to frame 1` |
| playing（帧率 10） | `1) hip pop to the left, singing; 2) arm wave; 3) step-touch to the right; 4) hair flip; 5) pointing at the viewer; 6) spin; 7) jump with arms in a V; 8) landing in a pose` |
| paused | `1) sunglasses down over her eyes, arms crossed, cool smile, waiting; 2-8) same pose with tiny breathing changes` |
| appear | `1) striking a pose from the side; 2) strutting in; 3) strutting; 4) stopping; 5) flipping the sunglasses up; 6) wink; 7) blowing a kiss; 8) relaxed idle pose` |
| click | `1) surprised; 2) laughs; 3) points at the viewer; 4) peace sign; 5) spin; 6) pose; 7) wink; 8) relaxed idle pose` |

### 11. 应援酱 Ouen：打 call 应援（直播，第二批）

- **tags**：type `live`，genre 无
- **性格**：头号粉丝，永远热情
- **代表颜文字**：`(ﾉ´∀｀)ﾉ♪`
- **{NAME}**：`Ouen`
- **{LOOK}**：`an enthusiastic fan girl with a black bob with mint-green ends and blunt bangs, sparkling eyes, a heart-shaped headband, a mint festival happi coat with a wave pattern (no letters), and a glowstick in each hand, one mint and one pink`
- **{PALETTE}**：`mint #5CE1B9, pink #FF7EB6, black #222222, white #FFFFFF`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) holding both glowsticks, swaying; 2) sway; 3) cheers silently; 4) checks the glowsticks; 5) blinks; 6) excited bounce; 7) sway; 8) back to frame 1` |
| playing（帧率 12） | `1) both glowsticks raised high; 2) arms swinging down in a big circle; 3) arms crossing in front; 4) jumping with both glowsticks up; 5) thrusting the glowsticks forward on the beat; 6) arms out wide; 7) waving them side to side; 8) back up high` |
| paused | `1) sitting down, glowsticks lowered and dim, looking at the viewer hopefully; 2-8) same pose with tiny breathing changes` |
| appear | `1) running in waving the glowsticks; 2) running; 3) stopping; 4) cracking a glowstick; 5) it lights up; 6) both raised; 7) cheering; 8) relaxed idle pose` |
| click | `1) turns to the viewer; 2) points a glowstick at the viewer; 3) wink; 4) waves both glowsticks; 5) waving; 6) jump; 7) landing; 8) relaxed idle pose` |

### 12. 听听 Tingting：认真听播客（第二批）

- **tags**：type `podcast`、`video`，genre 无
- **性格**：好学、爱记笔记、会突然"啊懂了"
- **代表颜文字**：`(・・？)`
- **{NAME}**：`Tingting`
- **{LOOK}**：`a thoughtful listener kid with short brown hair and a cowlick, round curious eyes, a cosy green cardigan, big over-ear headphones, holding a small notebook and a pencil`
- **{PALETTE}**：`green #6FA36F, brown #8B5E3C, cream #F4EFE6, ink #33333D`

| 状态 | {FRAMES} |
|---|---|
| idle | `1) standing with the notebook under one arm; 2) breath; 3) taps the pencil on the chin; 4) looks up thinking; 5) blinks; 6) opens the notebook; 7) closes it; 8) back to frame 1` |
| playing（帧率 6） | `1) listening with eyes half closed, nodding; 2) nodding; 3) writing in the notebook; 4) writing; 5) pencil on the chin, thinking; 6) raising a finger, an "aha" expression; 7) writing quickly; 8) nodding again` |
| paused | `1) one side of the headphones lifted off, stretching with both arms up, relaxed; 2-8) same pose with tiny breathing changes` |
| appear | `1) walking in; 2) walking; 3) stopping; 4) putting the headphones on; 5) adjusting them; 6) opening the notebook; 7) ready; 8) relaxed idle pose` |
| click | `1) looks up; 2) lifts one headphone; 3) curious head tilt; 4) smiles; 5) waves the pencil; 6) puts the headphone back; 7) nods; 8) relaxed idle pose` |

---

## 五、交给我之前的检查清单

每个角色检查一遍：

- [ ] 原创：不像任何已有角色、VTuber、品牌吉祥物
- [ ] 每一帧都是同一个角色：脸、发型、配色、服装、道具没有变化
- [ ] 每一帧角色大小一致，脚底在同一条线上，没有超出格子
- [ ] 背景透明或纯色，没有地面、阴影、文字、水印、边框
- [ ] 至少有 idle、playing、paused 三行
- [ ] playing 能从第 8 帧自然接回第 1 帧
- [ ] paused 的第 1 帧是好看、清楚的姿势
- [ ] 缩小到 120 像素高时还认得出是谁
- [ ] 放在白色和深色背景上都清楚
- [ ] 记录了工具、模型、日期，确认可以商用

## 六、交给我之后

把每个角色的图放进项目的 `art/incoming/<角色 id>/` 文件夹，文件名写清是哪一行，比如：

```
art/incoming/rina/ref.png        标准形象
art/incoming/rina/idle.png       4×2 网格，或 idle-1.png … idle-8.png 单帧
art/incoming/rina/playing.png
art/incoming/rina/paused.png
art/incoming/rina/appear.png     （可选）
art/incoming/rina/click.png      （可选）
```

我会：切帧并去掉多余背景，统一缩放到 192 × 208、对齐脚底，拼成 `sheet.webp`，写 `pack.json`（名字、作者、许可证、tags、每行的帧数和帧率），替换内置角色，并用测试检查抽卡池里每个曲风都有角色。
