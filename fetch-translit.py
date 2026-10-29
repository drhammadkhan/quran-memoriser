#!/usr/bin/env python3
"""Fetch transliteration.org's Latin transliteration for all 114 surahs
(from WebSite_CD/MixPure/{001..114}.asp) and align it to alislam.org's verse
numbering (alislam counts the Bismillah as verse 1 except in At-Tawbah).
Writes data/translit/<ch>.json for all 114 chapters.
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
BASE = "http://transliteration.org/quran/WebSite_CD/MixPure/{}.asp"
CACHE_DIR = Path("/tmp/translit_mixpure")
BISMILLAH_TL = "Bismi Allāhi Ar-Raĥmāni Ar-Raĥīmi"


def fetch(ch_page):
    cached = CACHE_DIR / f"{ch_page}.asp"
    if cached.exists() and cached.stat().st_size > 500:
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


def normalize_tl_words(t):
    # Clean spaces around hyphens (e.g. "Yā -Sīn" -> "Yā-Sīn")
    t = re.sub(r"\s*-\s*", "-", t)
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


def clean_mixpure_tl(frag):
    t = re.sub(r"</a\s+(?=<)", "</a>", frag, flags=re.I)
    t = re.sub(r"</a\b[^>]*>", "</a>", t, flags=re.I)
    t = re.sub(r"<audio[\s\S]*?</audio>", " ", t, flags=re.I)
    t = re.sub(r"<audio[^>]*>", " ", t, flags=re.I)
    t = re.sub(r"<script[\s\S]*?</script>", " ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("&zwj;", "").replace("&zwnj;", "").replace("&nbsp;", " ")
    t = html.unescape(t)
    # Strip any embedded Arabic/waqf characters in the Latin cell
    t = re.sub(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+", " ", t)
    t = t.replace("\u200d", "").replace("\u200c", "").replace("~", "")
    t = re.sub(r"\s+", " ", t).strip()
    m = re.match(r"^(\d{3})-(\d{3})\s+(.*)$", t)
    if not m:
        return None, None
    vno = int(m.group(2))
    t = m.group(3)
    t = re.sub(r"\s*\([^()]*:\s*\d+\)\.?\s*$", "", t).strip()
    t = normalize_tl_words(t)
    return vno, t


def parse(page):
    """Parse verse rows from a MixPure page: {verse_no: tl_str}."""
    rows = re.findall(r"<tr[^>]*>([\s\S]*?)(?:</tr>|(?=<tr\b)|$)", page, re.I)
    verses = {}
    for r in rows:
        tds = re.findall(r"<td[^>]*>([\s\S]*?)(?:</td>|(?=<td\b)|$)", r, re.I)
        if len(tds) >= 2:
            vno, tl = clean_mixpure_tl(tds[0])
            if vno is not None and tl:
                verses[vno] = tl
    return verses


def main():
    surahs = json.loads((ROOT / "data" / "surahs.json").read_text())
    out_dir = ROOT / "data" / "translit"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = []
    total_written = 0
    for s in surahs:
        ch = s["ch"]
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
            tl = merged.get(i + 1 - offset)
            if not tl:
                bad += 1
                continue
            out_verses.append({"n": av["n"], "tl": tl})
        (out_dir / f"{ch}.json").write_text(
            json.dumps({"ch": ch, "source": "transliteration.org", "verses": out_verses},
                       ensure_ascii=False), encoding="utf-8")
        ok = len(out_verses)
        total_written += ok
        note = "" if bad == 0 else f" ({bad} skipped)"
        report.append((ch, f"{ok}/{total} verses{note}"))
        if ch % 15 == 0 or ch == 114 or bad > 0:
            print(f"ch {ch:3d} {s['name']:<20} {ok:3d}/{total:3d}{note}", flush=True)
        if not (CACHE_DIR / f"{ch:03d}.asp").exists():
            time.sleep(0.25)
    problems = [r for r in report if "error" in r[1] or "skipped" in r[1]]
    print(f"\nDONE. {total_written} verses written across {len(report)} chapters. {len(problems)} chapters with issues.")
    for ch, msg in problems:
        print("  ", ch, msg)


if __name__ == "__main__":
    main()
