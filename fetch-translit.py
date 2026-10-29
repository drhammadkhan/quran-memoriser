#!/usr/bin/env python3
"""Fetch transliteration.org's Latin transliteration for all 114 surahs and
align it to alislam.org's verse numbering (alislam counts the Bismillah as
verse 1 except in At-Tawbah). Alignment is verified per verse by comparing
normalised Arabic skeletons; any verse that fails is skipped and reported.
Writes data/translit/<ch>.json.
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
BASE = "http://transliteration.org/quran/WebSite_CD/Beginner/{}.asp"

def fetch(ch_page):
    url = BASE.format(ch_page)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("windows-1256", errors="replace")

WORD_RE = re.compile(r"<a onclick=\"aud_play_pause\('(?:myAudio)?([0-9]+)[^']*'\)[^>]*>([\s\S]*?)</a>", re.I)

def clean(fragment):
    t = re.sub(r"<[^>]+>", "", fragment)
    t = t.replace("&zwj;", "").replace("&zwnj;", "").replace("&nbsp;", " ")
    t = html.unescape(t)          # handles bare numeric refs like &#257
    t = t.replace("\u200d", "").replace("\u200c", "")
    return re.sub(r"\s+", " ", t).strip()

def norm_skeleton(s):
    s = s.replace(" ", "")
    s = re.sub(r"[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u06DF\u06DE\u06E9\u0614-\u061A]", "", s)
    s = re.sub(r"[\u0660-\u0669\u06F0-\u06F9]", "", s)
    s = re.sub(r"[﴿﴾٪]", "", s)
    s = s.replace("ہ", "ه").replace("ۃ", "ه").replace("ة", "ه")
    # yeh family: Indo-Pak final ā (ی, ے) vs standard Arabic (ي, ى)
    s = s.replace("ی", "ي").replace("ے", "ي").replace("ى", "ي").replace("ک", "ك").replace("ٱ", "ا")
    s = re.sub(r"[\u0622\u0623\u0625]", "ا", s).replace("\u0621", "")
    # alefs carry the Uthmanic-rasm vs modern-orthography differences (silent
    # alefs, dagger alefs) — drop them so both scripts compare on the
    # remaining consonants only
    return s.replace("ا", "")

NAV_JUNK = {"next", "previous", "next sūrah", "previous sūrah", "next surah", "previous surah"}

def parse(page):
    """returns {verse_no: {"tl": [words], "ar": [words]}}.
    Their layout sometimes appends the NEXT verse's first transliteration word
    inside this verse's last (mixed Arabic+Latin) cell — route the Latin tail
    to the following verse."""
    verses = {}
    pending_next = {}
    for mid, frag in WORD_RE.findall(page):
        if "<img" in frag:
            continue
        text = clean(frag)
        if not text or text.lower() in NAV_JUNK:
            continue
        digits = re.sub(r"\D", "", mid)
        v = digits[3:-2]
        if len(v) not in (2, 3) or not v.isdigit():
            continue
        v = int(v)
        ar_part = " ".join(re.findall(r"[\u0600-\u06FF][\u0600-\u06FF\u064B-\u065F\u0670\u06D6-\u06ED\u0640]*", text))
        latin_part = re.sub(r"[\u0600-\u06FF\u064B-\u065F\u0670\u06D6-\u06ED\u0640]+", " ", text)
        latin_part = re.sub(r"\s+", " ", latin_part).strip()
        slot = verses.setdefault(v, {"tl": [], "ar": []})
        if ar_part:
            slot["ar"].append(ar_part)
        if latin_part:
            if ar_part:
                pending_next.setdefault(v + 1, []).append(latin_part)  # preview of next verse
            else:
                slot["tl"].append(latin_part)
    for v, words in pending_next.items():
        if v in verses:
            verses[v]["tl"] = words + verses[v]["tl"]
    return verses

def main():
    surahs = json.loads((ROOT / "data" / "surahs.json").read_text())
    out_dir = ROOT / "data" / "translit"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = []
    for s in surahs:
        ch = s["ch"]
        expected = s["verses"] - (0 if ch in (1, 9) else 1)  # standard count
        pages = [f"{ch:03d}"]
        merged = {}
        for p in pages:
            try:
                merged.update(parse(fetch(p)))
            except Exception as e:
                report.append((ch, f"fetch error {p}: {e}"))
                merged = {}
                break
        if len(merged) < expected:  # e.g. surah 58 continues in 58B.asp
            try:
                for v, slot in parse(fetch(f"{ch:03d}B")).items():
                    merged.setdefault(v, slot)
            except Exception:
                pass
        if not merged:
            continue
        data = json.loads((ROOT / "data" / "chapters" / f"{ch}.json").read_text())
        offset = 0 if ch in (1, 9) else 1  # alislam v = their v + offset
        out_verses, bad = [], 0
        for i, av in enumerate(data["verses"]):
            tv = merged.get(i + 1 - offset) if i + 1 - offset >= 1 else None
            if not tv or not tv["tl"]:
                bad += 1
                continue
            if norm_skeleton(" ".join(tv["ar"])) != norm_skeleton(av["ar"]):
                bad += 1
                continue
            out_verses.append({"n": av["n"], "tl": " ".join(tv["tl"])})
        # join letter-split cells: "A llāhu"→"Allāhu", "A ş-"→"Aş-", "Dh āta"→"Dhāta"
        for v in out_verses:
            v["tl"] = re.sub(r'\bA l(l)', r'Al\1', v["tl"])
            v["tl"] = re.sub(r'\bA ([a-z\u00E0-\u017F\u1E00-\u1EFF]-)', r'A\1', v["tl"])
            v["tl"] = re.sub(r'\b([A-Z][a-z]?) ([āīū])', r'\1\2', v["tl"])
        (out_dir / f"{ch}.json").write_text(
            json.dumps({"ch": ch, "source": "transliteration.org", "verses": out_verses},
                       ensure_ascii=False), encoding="utf-8")
        ok = len(out_verses)
        note = "" if bad == 0 else f" ({bad} skipped)"
        report.append((ch, f"{ok}/{expected} verses{note}"))
        print(f"ch {ch:3d} {s['name']:<20} {ok:3d}/{expected:3d}{note}", flush=True)
        time.sleep(0.25)
    problems = [r for r in report if "error" in r[1] or "skipped" in r[1]]
    print(f"\nDONE. {len(problems)} chapters with issues" + (":" if problems else ""))
    for ch, msg in problems:
        print("  ", ch, msg)

if __name__ == "__main__":
    main()
