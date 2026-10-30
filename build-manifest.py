#!/usr/bin/env python3
"""Write data/manifest.json — a content hash for every Quran data file.

The app compares these hashes against the copies saved on the device and
re-downloads only the files that changed, so edits to the data reach phones
that have the app installed for offline use.

Run this after changing anything in data/ (download-data.py runs it for you):
    python3 build-manifest.py
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def main():
    paths = [DATA / "surahs.json"]
    for ch in range(1, 115):
        paths.append(DATA / "chapters" / f"{ch}.json")
        translit = DATA / "translit" / f"{ch}.json"
        if translit.exists():
            paths.append(translit)

    files = {}
    for p in paths:
        files[p.relative_to(ROOT).as_posix()] = hashlib.sha1(p.read_bytes()).hexdigest()[:12]

    out = DATA / "manifest.json"
    out.write_text(json.dumps({"version": 1, "files": files}, indent=0) + "\n", encoding="utf-8")
    print(f"Wrote {out.relative_to(ROOT)} ({len(files)} files)")


if __name__ == "__main__":
    main()
