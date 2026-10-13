#!/usr/bin/env python3
"""Subset the display fonts (both SIL OFL 1.1) to the characters our pages use.

Usage: python3 scripts/subset-font.py ZCOOLKuaiLe-Regular.ttf [ZenMaruGothic-Bold.ttf]
Writes public/fonts/kobutai-display.woff2 (Chinese and Latin) and, given the second
font, public/fonts/kobutai-display-ja.woff2 (Japanese). Needs `pip install fonttools brotli`.
Characters missing from a subset (e.g. an imported character's name) fall back to the
next font in --font-display, so rerun this after adding new interface text.
"""
import pathlib
import sys

from fontTools import subset

root = pathlib.Path(__file__).resolve().parent.parent
BASE = {chr(c) for c in range(0x20, 0x7F)} | set('、。，：；！？「」『』（）·…—～×')


def cjk(paths):
    out = set()
    for path in paths:
        for ch in path.read_text(encoding='utf-8'):
            if ord(ch) > 0x2E7F:  # CJK and fullwidth forms
                out.add(ch)
    return out


def write(src, text, name):
    out = root / 'public/fonts' / name
    out.parent.mkdir(parents=True, exist_ok=True)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    font = subset.load_font(src, opts)
    s = subset.Subsetter(opts)
    s.populate(text=''.join(sorted(text)))
    s.subset(font)
    subset.save_font(font, str(out), opts)
    print(f'{len(text)} characters → {out.relative_to(root)} ({out.stat().st_size // 1024} KB)')


sources = list((root / 'src').rglob('*.svelte')) + list((root / 'src').rglob('*.ts')) + list((root / 'public/packs').rglob('pack.json'))
write(sys.argv[1], cjk(sources) | BASE, 'kobutai-display.woff2')

if len(sys.argv) > 2:
    # Japanese: every kana, plus the kanji the Japanese interface and character names use.
    kana = {chr(c) for c in range(0x3040, 0x3100)} | {chr(c) for c in range(0xFF61, 0xFFA0)}
    ja = cjk([root / 'src/lib/i18n/ja.ts', *(root / 'public/packs').rglob('pack.json')])
    write(sys.argv[2], ja | kana | BASE | set('ー〜・'), 'kobutai-display-ja.woff2')
