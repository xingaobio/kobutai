#!/usr/bin/env python3
"""Turn AI-generated character videos into a Kobutai character pack.

    python3 scripts/video2pack.py art/incoming/rina            # one character
    python3 scripts/video2pack.py art/incoming/*               # all of them

Input folder (named after the character id, e.g. art/incoming/rina/), either:
    video.mp4     one 10-second clip with every state in turn (any file name works
                  when it is the only video in the folder), as the prompts in
                  PROMPT.md ask for: idle 0-2.5 s, playing 2.5-7.5 s, click 7.5-10 s
                  (clips.json, e.g. {"playing": [3, 8]}, moves a window when the
                  model kept time differently)
or one clip per state (these win over video.mp4 when both are there):
    idle.mp4      required  calm loop: breathing, blinking
    playing.mp4   required  the performance: singing, dancing, playing
    appear.mp4    optional  played once when the character is drawn
    click.mp4     optional  played once when the character is clicked
Any format ffmpeg reads works (.mp4, .mov, .webm, .gif); MP4 keys cleanest.

Videos should have a static camera, the whole body in frame, and a plain solid
background (green, or blue for characters wearing green).

Output (art/packs/<id>/):
    sheet.webp    8-column sprite sheet, cells 208 px tall and as wide as the
                  character needs (96-192 px), transparent background
    pack.json     the pack manifest; name and tags come from art/roster.json
    preview.gif   the animations on a light and a dark background, to check by eye
    segments.json which seconds of the video each state was cut from

Each video is keyed (background removed), the smoothest loop is found
automatically, and every state is scaled and aligned with the same box so the
character does not jump in size or position between states. The paused state
is one still frame of the idle loop (the extension only shows its first frame).

Needs ffmpeg, numpy and Pillow (scipy optional: removes stray specks).
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

CELL_W, CELL_H, COLS = 192, 208, 8  # CELL_W is the widest a cell gets
MIN_CELL_W = 96
BOTTOM = 6  # px between the feet and the bottom of the cell
TOP = 0.10  # share of the cell height left free above the head (the emoji bubble sits there)
SIDE = 0.04  # share of the cell width left free on each side
EXTRACT_FPS = 24
WORK_H = 540  # frames are processed at this height

# Per state: loop length bounds in seconds, target frames per second in the sheet, whether it loops.
STATES = {
    'idle': dict(min_s=1.5, max_s=4.0, fps=8, loop=True),
    'playing': dict(min_s=0.8, max_s=3.0, fps=12, loop=True),
    'appear': dict(min_s=0.6, max_s=1.6, fps=12, loop=False),
    'click': dict(min_s=0.6, max_s=2.0, fps=12, loop=False),
}
# Where each state sits in an all-in-one video.mp4 (seconds), matching the video prompts in
# art/incoming/<id>/PROMPT.md. Video models keep time loosely, so loops are searched with some
# slack around these. A clips.json next to the video overrides them, e.g. {"playing": [3, 8]}.
TIMELINE = {'idle': (0.0, 2.5), 'playing': (2.5, 7.5), 'click': (7.5, 10.0)}
SLACK = 0.5
MAX_FRAMES = 24
VIDEO_EXT = ('.mp4', '.mov', '.webm', '.mkv', '.m4v', '.gif')

ROOT = Path(__file__).resolve().parent.parent


def die(msg: str) -> None:
    print(f'error: {msg}', file=sys.stderr)
    sys.exit(1)


# --- Reading videos ---------------------------------------------------------------------


def extract(video: Path, tmp: Path) -> list[Path]:
    """Frames at EXTRACT_FPS (at most WORK_H tall) written to `tmp`; only a few are ever held in memory."""
    cmd = [
        'ffmpeg', '-v', 'error', '-i', str(video),
        '-vf', f"fps={EXTRACT_FPS},scale=-2:'min(ih,{WORK_H})':flags=lanczos",
        str(tmp / '%05d.png'),
    ]
    subprocess.run(cmd, check=True)
    files = sorted(tmp.glob('*.png'))
    if not files:
        die(f'{video}: no frames could be read')
    return files


def load(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert('RGB'))


# --- Removing the background -----------------------------------------------------------------


def background_colour(files: list[Path]) -> np.ndarray:
    """Median colour of a thin border around the frame, over several frames."""
    picks = [load(files[i]) for i in np.linspace(0, len(files) - 1, 6).astype(int)]
    edges = []
    for f in picks:
        h, w, _ = f.shape
        b = max(2, int(min(h, w) * 0.02))
        edges += [f[:b].reshape(-1, 3), f[-b:].reshape(-1, 3), f[:, :b].reshape(-1, 3), f[:, -b:].reshape(-1, 3)]
    return np.median(np.concatenate(edges), axis=0)


def key(frame: np.ndarray, bg: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """RGBA float array (0..1): alpha from the colour distance to the background."""
    rgb = frame.astype(np.float32)
    # Measure the distance on a median-filtered copy: GIF dithering and video noise
    # otherwise leave a speckled fringe of background-coloured dots.
    smooth = np.asarray(Image.fromarray(frame).filter(ImageFilter.MedianFilter(3)), dtype=np.float32)
    dist = np.sqrt(((smooth - bg) ** 2).sum(axis=2))
    alpha = np.clip((dist - lo) / (hi - lo), 0, 1)
    # Pull the edge in by a pixel: the outermost ring is mostly background colour.
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)), dtype=np.float32) / 255
    alpha = clean(alpha)
    # Green/blue screen: remove the coloured fringe on soft edges only (solid parts keep their colours).
    ch = int(np.argmax(bg))
    if bg[ch] - np.delete(bg, ch).max() > 40:
        others = np.delete(rgb, ch, axis=2).max(axis=2)
        solid = np.asarray(Image.fromarray((alpha > 0.98).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(5))) > 0
        edge = ~solid
        rgb[..., ch] = np.where(edge, np.minimum(rgb[..., ch], others), rgb[..., ch])
    return np.dstack([rgb / 255.0, alpha])


def clean(alpha: np.ndarray) -> np.ndarray:
    """Drop specks of noise far smaller than the character."""
    try:
        from scipy import ndimage
    except ImportError:
        return alpha
    solid = alpha > 0.5
    labels, n = ndimage.label(solid)
    if n <= 1:
        return alpha
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    keep = np.isin(labels, 1 + np.flatnonzero(sizes >= sizes.max() * 0.01))
    near = ndimage.binary_dilation(keep, iterations=3)
    return np.where(near, alpha, 0)


# --- Finding a loop ----------------------------------------------------------------------


def thumb(path: Path) -> np.ndarray:
    """Small blurred thumbnail for comparing frames (the background is the same in all of them)."""
    img = Image.open(path).convert('RGB')
    return np.asarray(img.resize((64, max(1, round(64 * img.height / img.width))), Image.BOX), dtype=np.float32)


def pick_segment(files: list[Path], spec: dict, window: tuple[float, float] | None = None) -> tuple[int, int]:
    """(start, length) in frames, inside `window` (seconds) if given.
    Loops: where the last frame flows back into the first best. One-shots: from the window start."""
    first = 0 if window is None else max(0, round(window[0] * EXTRACT_FPS))
    end = len(files) if window is None else min(len(files), round(window[1] * EXTRACT_FPS))
    n = end - first
    if n < 4:
        die(f'not enough video in the {window} s window')
    lo = min(n - 1, max(2, round(spec['min_s'] * EXTRACT_FPS)))
    hi = min(n - 1, round(spec['max_s'] * EXTRACT_FPS))
    if not spec['loop'] or n <= lo + 1:
        return first, min(n, max(lo, hi))
    thumbs = {i: thumb(files[i]) for i in range(first, end)}
    best = (math.inf, first, lo)
    for length in range(lo, hi + 1):
        for start in range(first, end - length):
            d = float(np.abs(thumbs[start] - thumbs[start + length]).mean())
            # Prefer longer loops a little: they repeat less visibly.
            score = d - 0.02 * length / EXTRACT_FPS
            if score < best[0]:
                best = (score, start, length)
    return best[1], best[2]


def sample(files: list[Path], start: int, length: int, spec: dict, keyer) -> tuple[list[np.ndarray], float]:
    seconds = length / EXTRACT_FPS
    count = int(np.clip(round(seconds * spec['fps']), 4, MAX_FRAMES))
    idx = [start + int(i * length / count) for i in range(count)]
    return [keyer(load(files[i])) for i in idx], round(count / seconds, 2)


# --- Layout ------------------------------------------------------------------------------------


def union_box(frames: list[np.ndarray]) -> tuple[int, int, int, int]:
    mask = np.zeros(frames[0].shape[:2], bool)
    for f in frames:
        mask |= f[..., 3] > 0.1
    ys, xs = np.nonzero(mask)
    if not len(xs):
        die('nothing left after removing the background: is the background a plain colour?')
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def fit(box: tuple[int, int, int, int]) -> tuple[float, int]:
    """Scale and cell width for this character: as tall as the cell allows, and the cell
    only as wide as the character needs (a slim chibi in a wide cell looks small on the
    page, and the emoji bubble, placed at the cell's edge, ends up far from it)."""
    w, h = box[2] - box[0], box[3] - box[1]
    s = min(CELL_W * (1 - 2 * SIDE) / w, (CELL_H * (1 - TOP) - BOTTOM) / h)
    cell_w = math.ceil(w * s / (1 - 2 * SIDE) / 8) * 8
    return s, int(np.clip(cell_w, MIN_CELL_W, CELL_W))


def to_cell(rgba: np.ndarray, box: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = box
    crop = rgba[y0:y1, x0:x1]
    w, h = x1 - x0, y1 - y0
    s, cell_w = fit(box)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    img = Image.fromarray((np.clip(crop, 0, 1) * 255).astype(np.uint8), 'RGBA')
    img = img.convert('RGBa').resize((nw, nh), Image.LANCZOS).convert('RGBA')
    cell = Image.new('RGBA', (cell_w, CELL_H), (0, 0, 0, 0))
    cell.alpha_composite(img, ((cell_w - nw) // 2, CELL_H - BOTTOM - nh))
    return cell


# --- One character -------------------------------------------------------------------------------


def find_video(folder: Path, state: str) -> Path | None:
    for ext in VIDEO_EXT:
        p = folder / f'{state}{ext}'
        if p.exists():
            return p
    return None


def build(folder: Path, out_root: Path, roster: dict, lo: float, hi: float) -> Path:
    pid = folder.name
    meta = roster.get(pid)
    if not meta:
        die(f'{pid}: not in art/roster.json (add its name and tags there first)')
    # One video per state (idle.mp4, playing.mp4…) and/or one all-in-one video.mp4 cut by time.
    videos = {s: find_video(folder, s) for s in STATES}
    combined = find_video(folder, 'video')
    if not combined and not any(videos.values()):
        # A clip straight from the generator keeps its own long name: use it if it is the only one.
        loose = sorted(p for p in folder.iterdir() if p.suffix.lower() in VIDEO_EXT)
        if len(loose) > 1:
            die(f'{pid}: several videos in {folder}; name the one to use video.mp4')
        combined = loose[0] if loose else None
    timeline = dict(TIMELINE)
    clips = folder / 'clips.json'
    if clips.exists():
        timeline.update({k: tuple(v) for k, v in json.loads(clips.read_text()).items() if k in STATES})
    jobs: dict[str, tuple[Path, tuple[float, float] | None]] = {}
    if combined:
        for state, (a, b) in timeline.items():
            jobs[state] = (combined, (max(0.0, a - SLACK), b + SLACK) if STATES[state]['loop'] else (a, b))
    for state, video in videos.items():
        if video:
            jobs[state] = (video, None)
    for need in ('idle', 'playing'):
        if need not in jobs:
            die(f'{pid}: put video.mp4 (all states) or {need}.mp4 in {folder}')

    states: dict[str, tuple[list[np.ndarray], float]] = {}
    report = {}
    with tempfile.TemporaryDirectory() as tmp:
        extracted: dict[Path, tuple[list[Path], np.ndarray]] = {}
        for state, (video, window) in jobs.items():
            if video not in extracted:
                d = Path(tmp) / str(len(extracted))
                d.mkdir()
                files = extract(video, d)
                extracted[video] = (files, background_colour(files))
            files, bg = extracted[video]
            start, length = pick_segment(files, STATES[state], window)
            states[state] = sample(files, start, length, STATES[state], lambda f, bg=bg: key(f, bg, lo, hi))
            t0, t1 = start / EXTRACT_FPS, (start + length) / EXTRACT_FPS
            report[state] = {'video': video.name, 'from_s': round(t0, 2), 'to_s': round(t1, 2),
                             'frames': len(states[state][0]), 'fps': states[state][1]}
            print(f'  {state}: {video.name} {t0:.2f}–{t1:.2f}s → {len(states[state][0])} frames @ {states[state][1]} fps'
                  f'  (background rgb{tuple(int(c) for c in bg)})')

    # Paused shows one still: the first frame of the idle loop.
    states['paused'] = ([states['idle'][0][0]], 1)
    # One shared box: same scale and position in every state.
    box = union_box([f for frames, _ in states.values() for f in frames])

    order = ['idle', 'playing', 'paused', 'appear', 'click']
    rows, row, manifest_states = [], 0, {}
    for state in order:
        if state not in states:
            continue
        frames, fps = states[state]
        cells = [to_cell(f, box) for f in frames]
        need_rows = math.ceil(len(cells) / COLS)
        manifest_states[state] = {
            'kind': 'sprite', 'src': 'sheet.webp', 'frames': len(cells), 'cols': COLS, 'row': row, 'fps': fps,
            **({} if state not in ('appear', 'click') else {'loop': False}),
        }
        rows.append(cells)
        row += need_rows

    cw = fit(box)[1]
    sheet = Image.new('RGBA', (cw * COLS, CELL_H * row), (0, 0, 0, 0))
    r = 0
    for cells in rows:
        for i, c in enumerate(cells):
            sheet.alpha_composite(c, ((i % COLS) * cw, (r + i // COLS) * CELL_H))
        r += math.ceil(len(cells) / COLS)

    out = out_root / pid
    out.mkdir(parents=True, exist_ok=True)
    sheet.save(out / 'sheet.webp', 'WEBP', quality=90, method=6)
    manifest = {
        'id': pid,
        'name': meta['name'],
        'author': meta.get('author', 'Kobutai'),
        'license': meta.get('license', 'All rights reserved'),
        'tags': meta['tags'],
        'size': {'w': cw, 'h': CELL_H},
        'states': manifest_states,
    }
    (out / 'pack.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    # Which seconds of the video each state came from: adjust with clips.json if a cut looks wrong.
    (out / 'segments.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    preview(states, box, out / 'preview.gif')
    kb = (out / 'sheet.webp').stat().st_size // 1024
    print(f'  → {out}/  ({cw}×{CELL_H} cells, {cw * COLS}×{CELL_H * row} sheet, {kb} KB)')
    return out


def preview(states: dict, box, path: Path) -> None:
    """Idle then playing, on light and dark backgrounds side by side."""
    frames, durations = [], []
    cw = fit(box)[1]
    for state in ('idle', 'playing'):
        cells, fps = states[state]
        for _ in range(2):
            for c in cells:
                cell = to_cell(c, box)
                canvas = Image.new('RGB', (cw * 2, CELL_H), (245, 245, 245))
                canvas.paste((30, 30, 38), (cw, 0, cw * 2, CELL_H))
                canvas.paste(cell, (0, 0), cell)
                canvas.paste(cell, (cw, 0), cell)
                frames.append(canvas)
                durations.append(round(1000 / fps))
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=durations, loop=0)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('folders', nargs='+', type=Path, help='art/incoming/<id> folders')
    ap.add_argument('--out', type=Path, default=ROOT / 'art' / 'packs')
    ap.add_argument('--roster', type=Path, default=ROOT / 'art' / 'roster.json')
    ap.add_argument('--key-low', type=float, default=40, help='colour distance below which a pixel is background')
    ap.add_argument('--key-high', type=float, default=90, help='colour distance above which a pixel is fully kept')
    args = ap.parse_args()
    if not shutil.which('ffmpeg'):
        die('ffmpeg is not installed')
    roster = json.loads(args.roster.read_text())
    for folder in args.folders:
        if folder.is_dir():
            print(folder.name)
            build(folder, args.out, roster, args.key_low, args.key_high)


if __name__ == '__main__':
    main()
