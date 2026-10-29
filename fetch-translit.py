#!/usr/bin/env python3
"""Fetch transliteration.org's Latin transliteration for the short surahs
(Al-Fatihah and Juz 30: surahs 78–114) and align it to alislam.org's verse
numbering (alislam counts the Bismillah as verse 1 except in At-Tawbah).
Alignment is verified per verse by comparing normalised Arabic skeletons;
any verse that fails is skipped and reported. Writes data/translit/<ch>.json.
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
BASE = "http://transliteration.org/quran/WebSite_CD/Beginner/{}.asp"
CACHE_DIR = Path("/tmp/translit_pages")
BISMILLAH_TL = "Bismi Allāhi Ar-Raĥmāni Ar-Raĥīmi"
CHAPTERS = [1] + list(range(78, 115))


def fetch(ch_page):
    cached = CACHE_DIR / f"{ch_page}.asp"
    if cached.exists() and cached.stat().st_size > 100:
        return cached.read_bytes().decode("windows-1256", errors="replace")
    url = BASE.format(ch_page)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    return raw.decode("windows-1256", errors="replace")


def is_upper_char(c):
    return c.isalpha() and c == c.upper() and c != c.lower()


def is_lower_char(c):
    return c.isalpha() and c == c.lower() and c != c.upper()


def clean_tl(frag):
    t = re.sub(r"</a\s+(?=<)", "</a>", frag, flags=re.I)
    t = re.sub(r"</a\b[^>]*>", "</a>", t, flags=re.I)
    t = re.sub(r"<audio[\s\S]*?</audio>", " ", t, flags=re.I)
    t = re.sub(r"<audio[^>]*>", " ", t, flags=re.I)
    t = re.sub(r"<script[\s\S]*?</script>", " ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("&zwj;", "").replace("&zwnj;", "").replace("&nbsp;", " ")
    t = html.unescape(t)
    t = t.replace("\u200d", "").replace("\u200c", "").replace("~", "")
    t = re.sub(r"\s+", " ", t).strip()

    # Split run-together TitleCase words (e.g. "LillāhiRabbi" -> "Lillāhi Rabbi")
    out = []
    i = 0
    while i < len(t):
        out.append(t[i])
        if i + 1 < len(t) and is_lower_char(t[i]):
            if is_upper_char(t[i + 1]):
                out.append(" ")
            elif t[i + 1] in "'`" and i + 2 < len(t) and is_upper_char(t[i + 2]):
                out.append(" ")
        i += 1
    t = "".join(out)
    t = re.sub(r"(?:^|(?<=\s))(['`])\s+", r"\1", t)

    # Join word fragments split across adjacent cells (where continuation starts lowercase)
    tokens = t.split(" ")
    merged = []
    for tok in tokens:
        if not tok:
            continue
        first_alpha = next((c for c in tok if c.isalpha()), "")
        if merged and first_alpha and is_lower_char(first_alpha):
            if merged[-1].lower().endswith(tok.lower()) and len(tok) <= 3:
                continue
            merged[-1] = merged[-1] + tok
        else:
            merged.append(tok)
    return " ".join(merged)


def clean_ar(frag):
    t = re.sub(r"<audio[\s\S]*?</audio>", " ", frag, flags=re.I)
    t = re.sub(r"<audio[^>]*>", " ", t, flags=re.I)
    t = re.sub(r"<script[\s\S]*?</script>", " ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("&zwj;", "").replace("&zwnj;", "").replace("&nbsp;", " ")
    t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def norm_skeleton(s):
    s = re.sub(r"\s+", "", s).replace("~", "")
    s = re.sub(r"[\u064B-\u065F\u0670\u0674\u06D6-\u06ED\u0640\u06DF\u06DE\u06E9\u0610-\u061A\u0600-\u0605]", "", s)
    s = re.sub(r"[\u0660-\u0669\u06F0-\u06F9]", "", s)
    s = re.sub(r"[﴿﴾٪٭]", "", s)
    s = s.replace("ہ", "ه").replace("ۃ", "ه").replace("ة", "ه").replace("ھ", "ه")
    # yeh family: Indo-Pak (ی, ے, ٮ) vs standard Arabic (ي, ى, ئ)
    s = s.replace("ی", "ي").replace("ے", "ي").replace("ى", "ي").replace("ٮ", "ي").replace("ئ", "ي")
    s = s.replace("ک", "ك").replace("ٱ", "ا").replace("ؤ", "و")
    s = re.sub(r"[\u0622\u0623\u0625]", "ا", s).replace("\u0621", "")
    # Uthmanic vs Indo-Pak orthography differences (silent alef/waw/yeh, double lam, sad/seen in musaytir)
    s = s.replace("ا", "").replace("و", "").replace("ي", "").replace("ص", "س")
    s = re.sub(r"ل+", "ل", s)
    return s


def parse(page):
    """Parse verse rows from the main table: {verse_no: {"tl": str, "ar": str}}."""
    parts = re.split(r"<table\b[^>]*>", page, flags=re.I)
    body = "".join(parts[2:]) if len(parts) > 2 else page
    rows = re.findall(r"<tr[^>]*>([\s\S]*?)(?:</tr>|(?=<tr\b)|$)", body, re.I)
    verses = {}
    vno = 0
    for r in rows:
        tds = re.findall(r"<td[^>]*>([\s\S]*?)(?:</td>|(?=<td\b)|$)", r, re.I)
        if len(tds) >= 2:
            tl = clean_tl(tds[0])
            ar = clean_ar(tds[1])
            if tl and ar:
                vno += 1
                verses[vno] = {"tl": tl, "ar": ar}
    return verses


def main():
    surahs = {s["ch"]: s for s in json.loads((ROOT / "data" / "surahs.json").read_text())}
    out_dir = ROOT / "data" / "translit"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = []
    for ch in CHAPTERS:
        s = surahs[ch]
        total = s["verses"]
        try:
            merged = parse(fetch(f"{ch:03d}"))
        except Exception as e:
            report.append((ch, f"fetch error: {e}"))
            continue
        data = json.loads((ROOT / "data" / "chapters" / f"{ch}.json").read_text())
        offset = 0 if ch in (1, 9) else 1  # alislam v = their v + offset
        out_verses, bad = [], 0
        for i, av in enumerate(data["verses"]):
            if i == 0 and offset == 1:
                out_verses.append({"n": av["n"], "tl": BISMILLAH_TL})
                continue
            tv = merged.get(i + 1 - offset)
            if not tv or not tv["tl"]:
                bad += 1
                continue
            if norm_skeleton(tv["ar"]) != norm_skeleton(av["ar"]):
                bad += 1
                continue
            out_verses.append({"n": av["n"], "tl": tv["tl"]})
        (out_dir / f"{ch}.json").write_text(
            json.dumps({"ch": ch, "source": "transliteration.org", "verses": out_verses},
                       ensure_ascii=False), encoding="utf-8")
        ok = len(out_verses)
        note = "" if bad == 0 else f" ({bad} skipped)"
        report.append((ch, f"{ok}/{total} verses{note}"))
        print(f"ch {ch:3d} {s['name']:<20} {ok:3d}/{total:3d}{note}", flush=True)
        if not (CACHE_DIR / f"{ch:03d}.asp").exists():
            time.sleep(0.25)
    problems = [r for r in report if "error" in r[1] or "skipped" in r[1]]
    print(f"\nDONE. {len(problems)} chapters with issues" + (":" if problems else ""))
    for ch, msg in problems:
        print("  ", ch, msg)


if __name__ == "__main__":
    main()
