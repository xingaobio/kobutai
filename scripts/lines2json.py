#!/usr/bin/env python3
"""检查角色台词源文件并导出为扩展用的 JSON。

    python3 scripts/lines2json.py            # docs/characters/lines/*.md → src/lib/dialogue/lines.json
    python3 scripts/lines2json.py --check    # 只检查，不写文件

源文件一种语言一个：docs/characters/lines/zh.md、en.md、ja.md。格式和规则见
docs/characters/DIALOGUE.md。有错误时退出码为 1，不写出文件。
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "docs" / "characters" / "lines"
OUT = ROOT / "src" / "lib" / "dialogue" / "lines.json"
LANGS = ["en", "ja", "zh"]

MOODS = ["calm", "hype", "bright", "sad", "any", "ent", "info", "live", "podcast"]
KEYS = {"appear", "click", "click.many", "paused", "resumed", "repeat",
        "long_play", "late_night", "idle"} | {f"playing.{m}" for m in MOODS}
REQUIRED = ["appear", "click", "playing.any", "paused"]
MIN_COUNT = {"appear": 5, "click": 5, "playing.any": 5}  # 其他 key 至少 3 句
DEFAULT_MIN = 3
MAX_WIDTH = {"zh": 16, "ja": 18, "en": 20}  # 全角算 1，半角算 0.5（英文约 40 个字符）

COMMON_FORBIDDEN = [
    (re.compile(r"https?://|www\.", re.I), "不能有链接"),
]
FORBIDDEN = {
    "zh": [
        (re.compile(r"[《》「」『』]"), "不能出现书名号或引号括起的作品名"),
        (re.compile(r"难听|好吵|太吵|难看|真烂|好烂"), "不能贬低正在播放的内容"),
        (re.compile(r"记录|数据|收集"), "不要提记录、数据，免得像在收集信息"),
    ],
    "ja": [
        (re.compile(r"[《》「」『』]"), "不能出现书名号或引号括起的作品名"),
        (re.compile(r"うるさ|ひどい曲|つまらない曲|ダサい|下手"), "不能贬低正在播放的内容"),
        (re.compile(r"記録|データ|収集"), "不要提记录、数据，免得像在收集信息"),
    ],
    "en": [
        (re.compile(r"[“”\"]"), "不能用双引号（容易变成歌名）"),
        (re.compile(r"\b(noisy|awful|terrible|cringe|sucks?)\b", re.I), "不能贬低正在播放的内容"),
        (re.compile(r"\b(data|logged|logging|tracking|collect(ed|ing)?)\b", re.I), "不要提记录、数据，免得像在收集信息"),
    ],
}


def width(text: str) -> float:
    text = text.replace("{k}", "")
    return sum(1 if unicodedata.east_asian_width(c) in "FWA" else 0.5 for c in text)


def parse(path: Path):
    chars: dict[str, dict[str, list[str]]] = {}
    where: dict[tuple[str, str, str], int] = {}
    errors: list[str] = []
    cur_id = cur_key = None
    for no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.rstrip()
        if m := re.match(r"^## (\S+)", line):
            cur_id, cur_key = m.group(1), None
            if not re.fullmatch(r"[a-z][a-z0-9_-]*|_global", cur_id):
                errors.append(f"{path.name}:{no}: 角色 id 不合法：{cur_id}")
            if cur_id in chars:
                errors.append(f"{path.name}:{no}: 角色重复：{cur_id}")
            chars.setdefault(cur_id, {})
        elif m := re.match(r"^### (\S+)", line):
            cur_key = m.group(1)
            if cur_id is None:
                errors.append(f"{path.name}:{no}: {cur_key} 不在任何角色下面")
            elif cur_key not in KEYS:
                errors.append(f"{path.name}:{no}: 未知的 key：{cur_key}")
            elif cur_key in chars[cur_id]:
                errors.append(f"{path.name}:{no}: {cur_id} 的 {cur_key} 重复出现")
            else:
                chars[cur_id][cur_key] = []
        elif line.startswith("- "):
            text = line[2:].strip()
            if cur_id is None or cur_key is None or cur_key not in chars.get(cur_id, {}):
                errors.append(f"{path.name}:{no}: 台词不在任何 key 下面：{text}")
                continue
            pool = chars[cur_id][cur_key]
            if text in pool:
                errors.append(f"{path.name}:{no}: {cur_id}/{cur_key} 有重复台词：{text}")
                continue
            pool.append(text)
            where[(cur_id, cur_key, text)] = no
    return chars, where, errors


def check(chars, where, lang: str, path: Path) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    limit = MAX_WIDTH[lang]
    rules = COMMON_FORBIDDEN + FORBIDDEN[lang]
    for cid, keys in chars.items():
        for req in REQUIRED:
            if req not in keys:
                errors.append(f"{lang}/{cid}: 缺少必需的 {req}")
        for key, pool in keys.items():
            need = MIN_COUNT.get(key, DEFAULT_MIN)
            if len(pool) < need:
                errors.append(f"{lang}/{cid}/{key}: 只有 {len(pool)} 句，至少要 {need} 句")
            for text in pool:
                no = where[(cid, key, text)]
                if not text.replace("{k}", "").strip():
                    errors.append(f"{path.name}:{no}: 台词不能只有颜文字")
                if (w := width(text)) > limit:
                    errors.append(f"{path.name}:{no}: 太长（{w:g} > {limit}）：{text}")
                for pat, why in rules:
                    if pat.search(text):
                        errors.append(f"{path.name}:{no}: {why}：{text}")
                if text.count("{") != text.count("{k}"):
                    errors.append(f"{path.name}:{no}: 只允许 {{k}} 这一个占位符：{text}")
        if cid != "_global" and not any(k.startswith("playing.") and k != "playing.any" for k in keys):
            warnings.append(f"{lang}/{cid}: 没有按情绪分的 playing 台词，所有情绪都会说通用台词")
    if "_global" not in chars:
        errors.append(f"{lang}: 没有 _global 全局库")
    return errors, warnings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只检查，不写文件")
    ap.add_argument("--src", type=Path, default=SRC_DIR)
    ap.add_argument("-o", "--out", type=Path, default=OUT)
    args = ap.parse_args()

    errors: list[str] = []
    warnings: list[str] = []
    data: dict[str, dict] = {}
    for lang in LANGS:
        path = args.src / f"{lang}.md"
        if not path.exists():
            errors.append(f"缺少 {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")
            continue
        chars, where, errs = parse(path)
        errs2, warns = check(chars, where, lang, path)
        errors += errs + errs2
        warnings += warns
        data[lang] = {"global": chars.pop("_global", {}), "characters": chars}

    # 三种语言要有同一批角色，免得换了语言某个角色突然不说话。
    if len(data) == len(LANGS):
        ids = {lang: set(d["characters"]) for lang, d in data.items()}
        every = set.union(*ids.values())
        for lang, have in ids.items():
            for cid in sorted(every - have):
                errors.append(f"{lang}: 缺少角色 {cid}（其他语言有）")

    for w in warnings:
        print(f"提示：{w}", file=sys.stderr)
    if errors:
        for e in errors:
            print(f"错误：{e}", file=sys.stderr)
        print(f"共 {len(errors)} 个错误，没有写出文件。", file=sys.stderr)
        return 1

    total = {lang: sum(len(p) for k in [d["global"], *d["characters"].values()] for p in k.values()) for lang, d in data.items()}
    summary = "，".join(f"{lang} {n} 句" for lang, n in total.items())
    if args.check:
        print(f"检查通过：{summary}")
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"已写出 {args.out.relative_to(ROOT) if args.out.is_relative_to(ROOT) else args.out}：{summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
