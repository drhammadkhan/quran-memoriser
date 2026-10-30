#!/usr/bin/env python3
"""Download the full Quran (Arabic + Sher Ali English translation) from the
API that powers alislam.org's official Quran app (api.readquran.app), and
save one JSON file per chapter under data/chapters/.
"""
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).parent
API = "https://api.readquran.app/chapter/{ch}:{a}-{b}"
BODY = json.dumps({"en": True, "f": 1, "hover": 0}).encode()
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Origin": "https://alislam.org",
    "Referer": "https://alislam.org/quran/app/",
}

surahs = json.loads((ROOT / "data" / "surahs.json").read_text())

def fetch_range(ch, a, b, retries=4):
    url = API.format(ch=ch, a=a, b=b)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=BODY, headers=HEADERS, method="POST")
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    return None

def main():
    total_verses = 0
    for s in surahs:
        ch, nverses = s["ch"], s["verses"]
        out_path = ROOT / "data" / "chapters" / f"{ch}.json"
        if out_path.exists():
            existing = json.loads(out_path.read_text())
            if len(existing["verses"]) == nverses:
                total_verses += nverses
                continue
        verses = []
        for a in range(1, nverses + 1, 10):
            b = min(a + 9, nverses)
            batch = fetch_range(ch, a, b)
            for item in batch:
                en = item.get("en") or {}
                verses.append({
                    "n": item["v"],
                    "ar": item["ar"],
                    "en": en.get("text") or "",
                    "w": [w.get("t", "") for w in (item.get("words") or [])],
                })
            time.sleep(0.12)
        verses.sort(key=lambda v: v["n"])
        got = len(verses)
        assert got == nverses, f"chapter {ch}: expected {nverses} verses, got {got}"
        missing_en = sum(1 for v in verses if not v["en"])
        out_path.write_text(json.dumps({"ch": ch, "verses": verses}, ensure_ascii=False), encoding="utf-8")
        total_verses += got
        print(f"ch {ch:3d} {s['name']:<22} {got:3d} verses (empty en: {missing_en})", flush=True)
    print(f"DONE total verses: {total_verses}")
    # refresh the data hashes so installed apps pick up the changes
    import subprocess, sys
    subprocess.run([sys.executable, str(ROOT / "build-manifest.py")], check=False)

if __name__ == "__main__":
    main()
