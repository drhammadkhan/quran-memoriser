#!/usr/bin/env python3
"""Builds prototype.html — the design-variant picker for the Quran Memoriser.
Four variants, each a full mini-page (header + grid slice + chapter excerpt)
with real interactions. Palettes are authentic combinations from Sanzo Wada's
"A Dictionary of Colour Combinations" (via mattdesl/dictionary-of-colour-combinations).
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent
surahs_all = json.loads((ROOT / "data" / "surahs.json").read_text())
baqarah = json.loads((ROOT / "data" / "chapters" / "2.json").read_text())["verses"][:5]

PICK = [1, 2, 4, 12, 18, 36, 55, 67, 78, 112, 113, 114]
# realistic sample statuses for the demo slice
DEMO_STATUS = {1: "done", 2: "partial", 4: "next", 12: "later", 18: "next",
               36: "unset", 55: "later", 67: "unset", 78: "later",
               112: "done", 113: "unset", 114: "partial"}
DEMO_TICKED = {1: 7, 2: 14, 112: 5, 114: 3}  # ticked-verse counts shown on cards

DATA = {
    "surahs": [s for s in surahs_all if s["ch"] in PICK],
    "verses": [{"n": v["n"], "ar": v["ar"], "en": v["en"]} for v in baqarah],
    "demoStatus": DEMO_STATUS,
    "demoTicked": DEMO_TICKED,
}

HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>Quran Memoriser — design variants</title>
<style>
@font-face { font-family: "ManzoorNaskh"; src: url("assets/ManzoorNaskh.ttf") format("truetype"); font-display: swap; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
#stage > div { min-height: 100vh; }
.ar { font-family: "ManzoorNaskh", serif; direction: rtl; }

/* ============ shared wiring bits ============ */
.hidden { display: none !important; }

/* ============ V1 WASHI — paper calm (Wada #190: Ivory Buff / English Red / Black) ============ */
.v1 { background: #f6efdc; color: #232019; padding-bottom: 80px; }
.v1-serif { font-family: Georgia, "Times New Roman", serif; }
.v1-top { background: #f9f3e1; border-bottom: 1px solid #e0d4b4; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.v1-brand { font-size: 21px; font-weight: 700; letter-spacing: 0.2px; }
.v1-brand .mark { color: #d96629; margin-right: 8px; }
.v1-sub { font-size: 11.5px; color: #7a7160; margin-top: 2px; }
.v1-chips { display: flex; gap: 7px; flex-wrap: wrap; }
.v1-chip { border: 1px solid #ddcfab; border-radius: 999px; padding: 4px 11px; font-size: 12px; color: #5d5647; background: #fcf7e9; }
.v1-chip .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: 0; }
.v1-main { max-width: 1080px; margin: 0 auto; padding: 26px 22px; }
.v1-filters { display: flex; gap: 7px; margin-bottom: 20px; flex-wrap: wrap; }
.v1-filter { border: 1px solid #d8cba6; background: transparent; border-radius: 999px; padding: 5px 13px; font-size: 12.5px; color: #5d5647; cursor: pointer; }
.v1-filter[data-active] { background: #232019; color: #f6efdc; border-color: #232019; }
.v1-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 12px; }
.v1-card { border: 1px solid #e0d4b4; border-radius: 10px; padding: 13px 15px 11px; background: #fcf7e9; cursor: pointer; border-left-width: 4px; border-left-color: #e0d4b4; }
.v1-card[data-status=done] { border-left-color: #437742; }
.v1-card[data-status=next] { border-left-color: #d96629; }
.v1-card[data-status=partial] { border-left-color: #f27291; }
.v1-card[data-status=later] { border-left-color: #5a82b3; }
.v1-card-top { display: flex; justify-content: space-between; align-items: center; }
.v1-num { width: 27px; height: 27px; border-radius: 50%; border: 1px solid #c9b98d; color: #5d5647; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.v1-cardar { font-size: 19px; color: #232019; }
.v1-name { font-size: 17px; font-weight: 700; margin-top: 6px; }
.v1-meta { font-size: 12px; color: #7a7160; margin-top: 2px; }
.v1-meta .tick { color: #437742; font-weight: 700; }
.v1-pill { margin-top: 9px; border: 1px solid #c9b98d; background: transparent; border-radius: 4px; padding: 3px 9px; font-size: 11.5px; letter-spacing: 0.4px; color: #7a7160; cursor: pointer; text-transform: uppercase; font-family: inherit; }
.v1-pill[data-status=done] { color: #437742; border-color: #437742; }
.v1-pill[data-status=next] { color: #d96629; border-color: #d96629; }
.v1-pill[data-status=partial] { color: #c04a68; border-color: #f27291; }
.v1-pill[data-status=later] { color: #5a82b3; border-color: #5a82b3; }
.v1-sec { margin-top: 42px; }
.v1-crumb { color: #7a7160; font-size: 13px; text-decoration: none; }
.v1-chhead { border: 1px solid #e0d4b4; background: #fcf7e9; border-radius: 10px; padding: 18px 20px; }
.v1-chtitle { font-size: 24px; }
.v1-chtitle .ar { font-size: 27px; color: #232019; margin-left: 12px; }
.v1-chmeta { font-size: 12.5px; color: #7a7160; margin-top: 4px; }
.v1-chmeta b { color: #437742; }
.v1-controls { display: flex; gap: 9px; margin-top: 13px; flex-wrap: wrap; align-items: center; }
.v1-btn { border: 1px solid #232019; background: #232019; color: #f6efdc; border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer; font-family: inherit; }
.v1-btn.o { background: transparent; color: #232019; }
.v1-part { margin: 20px 0 12px; padding: 10px 16px; border-left: 3px solid #d96629; background: #f3ead2; border-radius: 0 8px 8px 0; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
.v1-part .no { font-weight: 700; }
.v1-part .range { font-size: 12.5px; color: #5d5647; margin-left: 10px; }
.v1-part .cnt { font-size: 12.5px; color: #437742; font-weight: 700; margin-left: 10px; }
.v1-partbtns { display: flex; gap: 7px; }
.v1-ptick { border: 1px solid #437742; color: #437742; background: transparent; border-radius: 4px; padding: 4px 10px; font-size: 11.5px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.4px; font-family: inherit; }
.v1-ptick[data-on] { background: #437742; color: #fcf7e9; }
.v1-pplay { border: 1px solid #232019; background: #232019; color: #f6efdc; border-radius: 4px; padding: 4px 10px; font-size: 11.5px; cursor: pointer; font-family: inherit; }
.v1-verse { background: #fcf7e9; border: 1px solid #e6dab9; border-radius: 10px; padding: 15px 18px; margin-bottom: 9px; }
.v1-verse.mem { border-left: 3px solid #437742; }
.v1-vtop { display: flex; align-items: center; gap: 9px; }
.v1-vplay { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #c9b98d; background: transparent; cursor: pointer; color: #5d5647; font-size: 12px; font-family: inherit; }
.v1-vtick { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #c9b98d; background: transparent; color: #c9b98d; cursor: pointer; font-size: 13px; font-family: inherit; }
.v1-vtick[data-on] { background: #437742; border-color: #437742; color: #fcf7e9; }
.v1-vref { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: #a08c5f; }
.v1-var { font-size: 29px; line-height: 2.1; text-align: right; margin: 8px 0 2px; color: #1d1a13; }
.v1-ven { font-size: 15px; color: #4a4436; line-height: 1.55; }
.v1-verse.playing { box-shadow: 0 0 0 2px #d96629; }

/* ============ V2 NIGHT TILAWAH — dark recitation (Wada #344/#211: Deep Indigo / Cinnamon Buff / Apricot Orange) ============ */
.v2 { background: #081227; color: #e8ecf8; padding-bottom: 80px; }
.v2-top { background: #0a1630; border-bottom: 1px solid #1d2d55; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.v2-brand { font-size: 19px; font-weight: 700; color: #fdc57e; }
.v2-sub { font-size: 11.5px; color: #8fa0c8; margin-top: 2px; }
.v2-chips { display: flex; gap: 7px; flex-wrap: wrap; }
.v2-chip { background: rgba(253, 197, 126, 0.07); border: 1px solid #26385f; border-radius: 999px; padding: 4px 11px; font-size: 12px; color: #aab6d8; }
.v2-chip .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
.v2-main { max-width: 1080px; margin: 0 auto; padding: 26px 22px; }
.v2-filters { display: flex; gap: 7px; margin-bottom: 20px; flex-wrap: wrap; }
.v2-filter { border: 1px solid #26385f; background: transparent; color: #aab6d8; border-radius: 999px; padding: 5px 13px; font-size: 12.5px; cursor: pointer; font-family: inherit; }
.v2-filter[data-active] { background: #fdc57e; color: #081227; border-color: #fdc57e; font-weight: 600; }
.v2-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 12px; }
.v2-card { background: #0e1b3a; border: 1px solid #1d2d55; border-radius: 14px; padding: 13px 15px 11px; cursor: pointer; border-left: 4px solid #1d2d55; }
.v2-card[data-status=done] { border-left-color: #7fd6ae; }
.v2-card[data-status=next] { border-left-color: #f6a45c; }
.v2-card[data-status=partial] { border-left-color: #f2a0be; }
.v2-card[data-status=later] { border-left-color: #93b1f2; }
.v2-card-top { display: flex; justify-content: space-between; align-items: center; }
.v2-num { width: 27px; height: 27px; border-radius: 50%; border: 1px solid #3a4d7c; color: #aab6d8; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.v2-cardar { font-size: 19px; color: #f3e3bd; }
.v2-name { font-size: 16.5px; font-weight: 700; margin-top: 6px; }
.v2-meta { font-size: 12px; color: #8fa0c8; margin-top: 2px; }
.v2-meta .tick { color: #7fd6ae; font-weight: 700; }
.v2-pill { margin-top: 9px; border-radius: 999px; padding: 4px 11px; font-size: 11.5px; cursor: pointer; background: #12234a; border: 1px solid #26385f; color: #8fa0c8; font-family: inherit; }
.v2-pill[data-status=done] { color: #7fd6ae; border-color: #2f6b55; }
.v2-pill[data-status=next] { color: #f6a45c; border-color: #7a4c2a; }
.v2-pill[data-status=partial] { color: #f2a0be; border-color: #74415c; }
.v2-pill[data-status=later] { color: #93b1f2; border-color: #35497e; }
.v2-sec { margin-top: 42px; }
.v2-crumb { color: #8fa0c8; font-size: 13px; text-decoration: none; }
.v2-chhead { background: #0e1b3a; border: 1px solid #1d2d55; border-radius: 14px; padding: 18px 20px; }
.v2-chtitle { font-size: 23px; color: #fdc57e; }
.v2-chtitle .ar { font-size: 27px; color: #f3e3bd; margin-left: 12px; }
.v2-chmeta { font-size: 12.5px; color: #8fa0c8; margin-top: 4px; }
.v2-chmeta b { color: #7fd6ae; }
.v2-controls { display: flex; gap: 9px; margin-top: 13px; flex-wrap: wrap; align-items: center; }
.v2-btn { border: none; background: #fdc57e; color: #081227; border-radius: 8px; padding: 8px 15px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.v2-btn.o { background: transparent; color: #e8ecf8; border: 1px solid #3a4d7c; font-weight: 400; }
.v2-part { margin: 20px 0 12px; padding: 11px 16px; background: linear-gradient(90deg, rgba(253,197,126,0.12), rgba(253,197,126,0.03)); border: 1px solid #3d335c; border-radius: 12px; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
.v2-part .no { font-weight: 700; color: #fdc57e; }
.v2-part .range { font-size: 12.5px; color: #aab6d8; margin-left: 10px; }
.v2-part .cnt { font-size: 12.5px; color: #7fd6ae; font-weight: 700; margin-left: 10px; }
.v2-partbtns { display: flex; gap: 7px; }
.v2-ptick { border: 1px solid #2f6b55; color: #7fd6ae; background: transparent; border-radius: 999px; padding: 4px 11px; font-size: 11.5px; cursor: pointer; font-family: inherit; }
.v2-ptick[data-on] { background: #7fd6ae; color: #081227; font-weight: 600; }
.v2-pplay { border: 1px solid #fdc57e; color: #fdc57e; background: transparent; border-radius: 999px; padding: 4px 11px; font-size: 11.5px; cursor: pointer; font-family: inherit; }
.v2-verse { background: #0e1b3a; border: 1px solid #1d2d55; border-radius: 14px; padding: 15px 18px; margin-bottom: 10px; }
.v2-verse.mem { border-left: 3px solid #7fd6ae; background: #0f2145; }
.v2-vtop { display: flex; align-items: center; gap: 9px; }
.v2-vplay { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #3a4d7c; background: transparent; color: #fdc57e; cursor: pointer; font-size: 12px; font-family: inherit; }
.v2-vtick { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #3a4d7c; background: transparent; color: #43537d; cursor: pointer; font-size: 13px; font-family: inherit; }
.v2-vtick[data-on] { background: #7fd6ae; border-color: #7fd6ae; color: #081227; }
.v2-vref { font-size: 11px; letter-spacing: 1px; color: #6374a3; }
.v2-var { font-size: 29px; line-height: 2.1; text-align: right; margin: 8px 0 2px; color: #f6e7c2; }
.v2-ven { font-size: 15px; color: #b9c4e2; line-height: 1.55; }
.v2-verse.playing { box-shadow: 0 0 0 2px #fdc57e, 0 0 24px rgba(253,197,126,0.25); }

/* ============ V3 KACHO — botanical bright (Wada #300: Grenadine Pink / Cream Yellow / Turquoise Green / Calamine Blue) ============ */
.v3 { background: #ffffff; color: #23312e; padding-bottom: 80px; }
.v3-top { background: #fff; border-bottom: 2px solid #ffe9e3; padding: 15px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.v3-brand { font-size: 20px; font-weight: 800; color: #e96a4b; }
.v3-sub { font-size: 11.5px; color: #97a8a2; margin-top: 2px; }
.v3-chips { display: flex; gap: 7px; flex-wrap: wrap; }
.v3-chip { border-radius: 999px; padding: 5px 12px; font-size: 12px; font-weight: 600; }
.v3-chip .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
.v3-main { max-width: 1080px; margin: 0 auto; padding: 26px 22px; }
.v3-filters { display: flex; gap: 7px; margin-bottom: 20px; flex-wrap: wrap; }
.v3-filter { border: 2px solid #eef3f1; background: #fff; color: #97a8a2; border-radius: 999px; padding: 5px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; }
.v3-filter[data-active] { background: #23312e; color: #fff; border-color: #23312e; }
.v3-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
.v3-card { background: #f7faf8; border: 2px solid #e3efe9; border-radius: 18px; padding: 15px 16px 13px; cursor: pointer; transition: transform 180ms cubic-bezier(0.22, 1.4, 0.36, 1), box-shadow 180ms ease-out; }
.v3-card:hover { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(35, 49, 46, 0.10); }
.v3-card[data-status=done] { background: #e2f5ee; border-color: #b5decc; }
.v3-card[data-status=next] { background: #ffece5; border-color: #ffd0c2; }
.v3-card[data-status=partial] { background: #fdeef0; border-color: #f8d3da; }
.v3-card[data-status=later] { background: #e9f6f8; border-color: #c5e6eb; }
.v3-card-top { display: flex; justify-content: space-between; align-items: center; }
.v3-num { width: 30px; height: 30px; border-radius: 11px; background: #23312e; color: #fff; font-size: 12.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.v3-cardar { font-size: 20px; color: #2aa08a; }
.v3-name { font-size: 17px; font-weight: 800; margin-top: 7px; }
.v3-meta { font-size: 12px; color: #7d948d; margin-top: 2px; }
.v3-meta .tick { color: #1f8f74; font-weight: 800; }
.v3-pill { margin-top: 10px; border: none; border-radius: 999px; padding: 5px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; background: #e3efe9; color: #7d948d; font-family: inherit; }
.v3-pill[data-status=done] { background: #2aa08a; color: #fff; }
.v3-pill[data-status=next] { background: #f48067; color: #fff; }
.v3-pill[data-status=partial] { background: #f8b6ba; color: #7c3a44; }
.v3-pill[data-status=later] { background: #78cdd0; color: #0f4c53; }
.v3-sec { margin-top: 42px; }
.v3-crumb { color: #97a8a2; font-size: 13px; text-decoration: none; font-weight: 600; }
.v3-chhead { background: #fff7ee; border: 2px solid #fbe3c4; border-radius: 20px; padding: 19px 21px; }
.v3-chtitle { font-size: 24px; }
.v3-chtitle .ar { font-size: 28px; color: #2aa08a; margin-left: 12px; }
.v3-chmeta { font-size: 12.5px; color: #97a8a2; margin-top: 4px; }
.v3-chmeta b { color: #1f8f74; }
.v3-controls { display: flex; gap: 9px; margin-top: 13px; flex-wrap: wrap; align-items: center; }
.v3-btn { border: none; background: #f48067; color: #fff; border-radius: 999px; padding: 9px 17px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 4px 12px rgba(244,128,103,0.35); }
.v3-btn.o { background: #fff; color: #23312e; border: 2px solid #e3efe9; box-shadow: none; }
.v3-part { margin: 20px 0 12px; padding: 12px 17px; background: #e2f5ee; border-radius: 16px; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
.v3-part .no { font-weight: 800; color: #1f8f74; }
.v3-part .range { font-size: 12.5px; color: #55716a; margin-left: 10px; }
.v3-part .cnt { font-size: 12.5px; color: #1f8f74; font-weight: 800; margin-left: 10px; }
.v3-partbtns { display: flex; gap: 7px; }
.v3-ptick { border: none; color: #1f8f74; background: #fff; border-radius: 999px; padding: 5px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.v3-ptick[data-on] { background: #2aa08a; color: #fff; }
.v3-pplay { border: none; background: #23312e; color: #fff; border-radius: 999px; padding: 5px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.v3-verse { background: #fff; border: 2px solid #edf3f0; border-radius: 18px; padding: 16px 19px; margin-bottom: 11px; }
.v3-verse.mem { background: #f2fbf7; border-color: #b5decc; }
.v3-vtop { display: flex; align-items: center; gap: 9px; }
.v3-vplay { width: 32px; height: 32px; border-radius: 12px; border: none; background: #e2f5ee; color: #1f8f74; cursor: pointer; font-size: 12px; font-family: inherit; }
.v3-vtick { width: 32px; height: 32px; border-radius: 12px; border: 2px solid #dbe6e2; background: #fff; color: #c9d6d1; cursor: pointer; font-size: 13px; font-family: inherit; }
.v3-vtick[data-on] { background: #2aa08a; border-color: #2aa08a; color: #fff; }
.v3-vref { font-size: 11px; letter-spacing: 0.8px; color: #97a8a2; font-weight: 700; }
.v3-var { font-size: 29px; line-height: 2.1; text-align: right; margin: 8px 0 2px; color: #1d2b28; }
.v3-ven { font-size: 15px; color: #4c5f59; line-height: 1.55; }
.v3-verse.playing { box-shadow: 0 0 0 3px #f48067; border-color: #f48067; }

/* ============ V4 LEDGER — dense typographic (Wada #221: Black / Neutral Gray / Carmine Red) ============ */
.v4 { background: #fbfbfa; color: #141414; padding-bottom: 80px; }
.v4-top { background: #fff; border-bottom: 1px solid #e3e3e0; padding: 12px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.v4-brand { font-size: 16px; font-weight: 800; letter-spacing: -0.2px; }
.v4-brand .mark { color: #a62c37; }
.v4-sub { font-size: 10.5px; color: #8b8b87; letter-spacing: 1.4px; text-transform: uppercase; margin-top: 2px; }
.v4-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.v4-chip { font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase; color: #5c5c58; border-left: 3px solid #b6bfc1; padding: 1px 8px; font-variant-numeric: tabular-nums; }
.v4-main { max-width: 980px; margin: 0 auto; padding: 22px 22px; }
.v4-filters { display: flex; gap: 0; margin-bottom: 18px; border-bottom: 1px solid #141414; }
.v4-filter { border: none; background: transparent; padding: 7px 14px 8px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #8b8b87; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; font-family: inherit; }
.v4-filter[data-active] { color: #141414; border-bottom-color: #a62c37; font-weight: 700; }
.v4-list { display: flex; flex-direction: column; }
.v4-row { display: flex; align-items: center; gap: 12px; padding: 9px 6px 9px 0; border-bottom: 1px solid #e9e9e6; cursor: pointer; }
.v4-rail { width: 3px; align-self: stretch; background: #e3e3e0; flex-shrink: 0; }
.v4-row[data-status=done] .v4-rail { background: #3f7d4e; }
.v4-row[data-status=next] .v4-rail { background: #c96f2a; }
.v4-row[data-status=partial] .v4-rail { background: #d5648a; }
.v4-row[data-status=later] .v4-rail { background: #4a6fa5; }
.v4-rnum { width: 26px; text-align: right; font-size: 12.5px; color: #8b8b87; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.v4-rname { font-size: 14px; font-weight: 600; flex: 1; }
.v4-rar { font-size: 17px; color: #141414; }
.v4-rmeta { font-size: 11.5px; color: #8b8b87; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.v4-rmeta .tick { color: #3f7d4e; font-weight: 700; }
.v4-rpill { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; padding: 2px 7px; border-radius: 3px; flex-shrink: 0; cursor: pointer; border: none; background: #efefec; color: #8b8b87; font-family: inherit; font-weight: 700; }
.v4-rpill[data-status=done] { background: #3f7d4e; color: #fff; }
.v4-rpill[data-status=next] { background: #c96f2a; color: #fff; }
.v4-rpill[data-status=partial] { background: #d5648a; color: #fff; }
.v4-rpill[data-status=later] { background: #4a6fa5; color: #fff; }
.v4-sec { margin-top: 40px; }
.v4-crumb { color: #8b8b87; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; text-decoration: none; }
.v4-chhead { border: 1px solid #141414; padding: 0; }
.v4-chhead-top { padding: 14px 18px; display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.v4-chtitle { font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
.v4-chtitle .ar { font-size: 25px; margin-left: 10px; }
.v4-chmeta { font-size: 11.5px; color: #5c5c58; font-variant-numeric: tabular-nums; }
.v4-chmeta b { color: #3f7d4e; }
.v4-controls { border-top: 1px solid #e3e3e0; padding: 10px 18px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.v4-btn { border: 1px solid #141414; background: #141414; color: #fff; border-radius: 4px; padding: 6px 13px; font-size: 12px; letter-spacing: 0.8px; text-transform: uppercase; cursor: pointer; font-family: inherit; font-weight: 700; }
.v4-btn.o { background: transparent; color: #141414; }
.v4-part { margin: 22px 0 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; border-top: 2px solid #141414; border-bottom: 1px solid #e3e3e0; padding: 8px 2px; }
.v4-part .no { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 800; }
.v4-part .no b { color: #a62c37; }
.v4-part .range, .v4-part .cnt { font-size: 11.5px; color: #5c5c58; margin-left: 10px; font-variant-numeric: tabular-nums; }
.v4-part .cnt { color: #3f7d4e; font-weight: 700; }
.v4-partbtns { display: flex; gap: 6px; }
.v4-ptick { border: 1px solid #141414; background: transparent; color: #141414; border-radius: 3px; padding: 3px 9px; font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; font-family: inherit; font-weight: 700; }
.v4-ptick[data-on] { background: #3f7d4e; border-color: #3f7d4e; color: #fff; }
.v4-pplay { border: 1px solid #a62c37; color: #a62c37; background: transparent; border-radius: 3px; padding: 3px 9px; font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; font-family: inherit; font-weight: 700; }
.v4-verse { border-bottom: 1px solid #e9e9e6; padding: 13px 2px; }
.v4-verse.mem .v4-vref { color: #3f7d4e; }
.v4-verse.mem .v4-vtick { background: #3f7d4e; border-color: #3f7d4e; color: #fff; }
.v4-vtop { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.v4-vplay { width: 26px; height: 26px; border-radius: 4px; border: 1px solid #d5d5d1; background: #fff; color: #5c5c58; cursor: pointer; font-size: 11px; font-family: inherit; }
.v4-vtick { width: 26px; height: 26px; border-radius: 4px; border: 1px solid #d5d5d1; background: #fff; color: #cfcfcb; cursor: pointer; font-size: 12px; font-family: inherit; }
.v4-vref { font-size: 12px; color: #a62c37; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.5px; }
.v4-vlen { font-size: 10.5px; color: #b0b0ac; margin-left: auto; letter-spacing: 1px; text-transform: uppercase; }
.v4-var { font-size: 27px; line-height: 2.05; text-align: right; margin: 2px 0; color: #141414; }
.v4-ven { font-size: 14px; color: #3c3c39; line-height: 1.5; }
.v4-verse.playing .v4-var { box-shadow: inset 0 -2px 0 #a62c37; }

/* ============ V5 INK WASH — monochrome severity (Wada colours: White / Black / Pompeian Red) ============ */
.v5 { background: #ffffff; color: #14140f; padding-bottom: 80px; }
.v5-serif { font-family: Georgia, "Times New Roman", serif; }
.v5-top { background: #ffffff; border-bottom: 1px solid #e8e8e4; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.v5-brand { font-size: 22px; font-weight: 700; letter-spacing: 0.3px; }
.v5-brand .mark { color: #ab2439; margin-right: 9px; }
.v5-sub { font-size: 11px; color: #9a9a93; letter-spacing: 1.6px; text-transform: uppercase; margin-top: 3px; }
.v5-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.v5-chip { font-size: 11.5px; letter-spacing: 0.8px; text-transform: uppercase; color: #6d6d66; }
.v5-chip .dot { display: inline-block; width: 7px; height: 7px; border-radius: 0; margin-right: 5px; vertical-align: 1px; }
.v5-main { max-width: 1060px; margin: 0 auto; padding: 28px 24px; }
.v5-filters { display: flex; gap: 14px; margin-bottom: 24px; flex-wrap: wrap; }
.v5-filter { border: none; border-bottom: 1px solid #d8d8d2; background: transparent; padding: 2px 1px 5px; font-size: 12.5px; color: #9a9a93; cursor: pointer; letter-spacing: 0.6px; }
.v5-filter[data-active] { color: #14140f; border-bottom-color: #ab2439; }
.v5-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(226px, 1fr)); gap: 0; border-top: 1px solid #e8e8e4; }
.v5-card { border-bottom: 1px solid #e8e8e4; border-right: 1px solid #e8e8e4; padding: 16px 18px 13px; cursor: pointer; }
.v5-card-top { display: flex; justify-content: space-between; align-items: baseline; }
.v5-num { font-size: 12px; color: #ab2439; font-variant-numeric: tabular-nums; }
.v5-cardar { font-size: 21px; color: #14140f; }
.v5-name { font-size: 17px; margin-top: 8px; }
.v5-meta { font-size: 11.5px; color: #9a9a93; margin-top: 3px; letter-spacing: 0.5px; }
.v5-meta .tick { color: #437742; font-weight: 700; }
.v5-pill { margin-top: 10px; border: none; background: transparent; padding: 0; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: #9a9a93; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; }
.v5-pill .sq { width: 8px; height: 8px; border-radius: 0; display: inline-block; background: #d8d8d2; }
.v5-pill[data-status=done] { color: #14140f; } .v5-pill[data-status=done] .sq { background: #437742; }
.v5-pill[data-status=next] { color: #14140f; } .v5-pill[data-status=next] .sq { background: #c96f2a; }
.v5-pill[data-status=partial] { color: #14140f; } .v5-pill[data-status=partial] .sq { background: #d98a9d; }
.v5-pill[data-status=later] { color: #14140f; } .v5-pill[data-status=later] .sq { background: #5a82b3; }
.v5-sec { margin-top: 52px; }
.v5-crumb { color: #9a9a93; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; text-decoration: none; }
.v5-chhead { border-top: 2px solid #14140f; padding: 16px 2px 0; }
.v5-chtitle { font-size: 26px; }
.v5-chtitle .ar { font-size: 30px; margin-left: 14px; }
.v5-chmeta { font-size: 12px; color: #9a9a93; margin-top: 6px; letter-spacing: 0.5px; }
.v5-chmeta b { color: #437742; }
.v5-controls { display: flex; gap: 16px; margin-top: 14px; flex-wrap: wrap; align-items: center; }
.v5-btn { border: 1px solid #14140f; background: transparent; color: #14140f; border-radius: 0; padding: 7px 16px; font-size: 12px; letter-spacing: 1.2px; text-transform: uppercase; cursor: pointer; font-family: inherit; }
.v5-btn.f { background: #14140f; color: #fff; }
.v5-part { margin: 26px 0 4px; padding: 8px 0 6px; border-top: 1px solid #14140f; border-bottom: 1px solid #e8e8e4; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
.v5-part .no { font-size: 11.5px; letter-spacing: 2px; text-transform: uppercase; }
.v5-part .no b { color: #ab2439; }
.v5-part .range, .v5-part .cnt { font-size: 11.5px; color: #6d6d66; margin-left: 12px; letter-spacing: 0.5px; }
.v5-part .cnt { color: #437742; font-weight: 700; }
.v5-partbtns { display: flex; gap: 10px; }
.v5-ptick { border: none; border-bottom: 1px solid #437742; background: transparent; color: #437742; padding: 2px 1px; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; cursor: pointer; font-family: inherit; }
.v5-ptick[data-on] { color: #437742; font-weight: 700; }
.v5-pplay { border: none; border-bottom: 1px solid #ab2439; background: transparent; color: #ab2439; padding: 2px 1px; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; cursor: pointer; font-family: inherit; }
.v5-verse { padding: 18px 2px 16px; border-bottom: 1px solid #ecece8; }
.v5-verse.mem .v5-vref { color: #437742; }
.v5-vtop { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
.v5-vplay { width: 30px; height: 30px; border-radius: 0; border: 1px solid #d8d8d2; background: transparent; color: #6d6d66; cursor: pointer; font-size: 12px; font-family: inherit; }
.v5-vtick { width: 30px; height: 30px; border-radius: 0; border: 1px solid #d8d8d2; background: transparent; color: #d8d8d2; cursor: pointer; font-size: 13px; font-family: inherit; }
.v5-vtick[data-on] { background: #437742; border-color: #437742; color: #fff; }
.v5-vref { font-size: 11px; letter-spacing: 2px; color: #ab2439; text-transform: uppercase; }
.v5-var { font-size: 31px; line-height: 2.15; text-align: right; margin: 4px 0; color: #14140f; }
.v5-ven { font-size: 14.5px; color: #44443d; line-height: 1.6; font-style: italic; }
.v5-verse.playing .v5-var { box-shadow: inset 0 -3px 0 #ab2439; }

/* ============ V6 KINPAKU — illuminated parchment (Wada #323: Cinnamon Buff / Citron Yellow / Madder Brown / Black) ============ */
.v6 { background: #f6ecd8; color: #3a2a18; padding-bottom: 80px; }
.v6-top { background: linear-gradient(180deg, #f9f1e0, #f4e8cf); border-bottom: 1px solid #e2d3ae; padding: 15px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.v6-brand { font-size: 20px; font-weight: 700; color: #5c3a1e; }
.v6-brand .mark { color: #b8791f; margin-right: 8px; }
.v6-sub { font-size: 11.5px; color: #9a8560; margin-top: 2px; }
.v6-chips { display: flex; gap: 7px; flex-wrap: wrap; }
.v6-chip { background: rgba(253, 197, 126, 0.22); border: 1px solid #e0cd9e; border-radius: 3px; padding: 4px 10px; font-size: 11.5px; color: #7c6740; }
.v6-chip .dot { display: inline-block; width: 8px; height: 8px; border-radius: 0; margin-right: 5px; vertical-align: 0; }
.v6-main { max-width: 1060px; margin: 0 auto; padding: 26px 22px; }
.v6-filters { display: flex; gap: 7px; margin-bottom: 20px; flex-wrap: wrap; }
.v6-filter { border: 1px solid #ddcaa2; background: transparent; color: #7c6740; border-radius: 3px; padding: 5px 12px; font-size: 12px; cursor: pointer; font-family: inherit; }
.v6-filter[data-active] { background: #762c19; color: #f6ecd8; border-color: #762c19; }
.v6-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(228px, 1fr)); gap: 12px; }
.v6-card { background: #fbf4e4; border: 1px solid #e2d3ae; border-top: 3px solid #d9b96a; border-radius: 4px; padding: 14px 15px 12px; cursor: pointer; }
.v6-card[data-status=done] { border-top-color: #6b7a2e; }
.v6-card[data-status=next] { border-top-color: #a44a2a; }
.v6-card[data-status=partial] { border-top-color: #c98a94; }
.v6-card[data-status=later] { border-top-color: #6a7f9e; }
.v6-card-top { display: flex; justify-content: space-between; align-items: center; }
.v6-num { width: 26px; height: 26px; border-radius: 0; background: #762c19; color: #f6ecd8; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.v6-cardar { font-size: 20px; color: #5c3a1e; }
.v6-name { font-size: 16.5px; font-weight: 700; margin-top: 7px; }
.v6-meta { font-size: 11.5px; color: #9a8560; margin-top: 2px; }
.v6-meta .tick { color: #6b7a2e; font-weight: 700; }
.v6-pill { margin-top: 9px; border: 1px solid #d9c493; background: transparent; border-radius: 2px; padding: 3px 9px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #7c6740; cursor: pointer; font-family: inherit; }
.v6-pill[data-status=done] { color: #55631f; border-color: #6b7a2e; }
.v6-pill[data-status=next] { color: #8a3c1e; border-color: #a44a2a; }
.v6-pill[data-status=partial] { color: #a05a66; border-color: #c98a94; }
.v6-pill[data-status=later] { color: #46608a; border-color: #6a7f9e; }
.v6-sec { margin-top: 44px; }
.v6-crumb { color: #9a8560; font-size: 12.5px; text-decoration: none; }
.v6-chhead { background: #fbf4e4; border: 1px solid #e2d3ae; border-radius: 4px; padding: 18px 20px; box-shadow: 0 1px 0 #e2d3ae inset; }
.v6-chtitle { font-size: 23px; color: #5c3a1e; }
.v6-chtitle .ar { font-size: 28px; color: #762c19; margin-left: 12px; }
.v6-chmeta { font-size: 12px; color: #9a8560; margin-top: 4px; }
.v6-chmeta b { color: #55631f; }
.v6-controls { display: flex; gap: 9px; margin-top: 13px; flex-wrap: wrap; align-items: center; }
.v6-btn { border: 1px solid #762c19; background: #762c19; color: #f6ecd8; border-radius: 3px; padding: 8px 15px; font-size: 12.5px; letter-spacing: 0.6px; cursor: pointer; font-family: inherit; }
.v6-btn.o { background: transparent; color: #5c3a1e; }
.v6-part { margin: 20px 0 12px; padding: 10px 16px; background: linear-gradient(90deg, #f3dfae, #f7e8c4); border: 1px solid #ddc488; border-radius: 3px; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
.v6-part .no { font-weight: 800; color: #762c19; }
.v6-part .range { font-size: 12px; color: #7c6740; margin-left: 10px; }
.v6-part .cnt { font-size: 12px; color: #55631f; font-weight: 700; margin-left: 10px; }
.v6-partbtns { display: flex; gap: 7px; }
.v6-ptick { border: 1px solid #6b7a2e; color: #55631f; background: transparent; border-radius: 2px; padding: 4px 10px; font-size: 11px; letter-spacing: 0.8px; text-transform: uppercase; cursor: pointer; font-family: inherit; }
.v6-ptick[data-on] { background: #6b7a2e; color: #f6ecd8; }
.v6-pplay { border: 1px solid #762c19; color: #762c19; background: transparent; border-radius: 2px; padding: 4px 10px; font-size: 11px; letter-spacing: 0.8px; text-transform: uppercase; cursor: pointer; font-family: inherit; }
.v6-verse { background: #fbf4e4; border: 1px solid #e7d9b8; border-radius: 4px; padding: 15px 18px; margin-bottom: 10px; }
.v6-verse.mem { border-left: 3px solid #6b7a2e; }
.v6-vtop { display: flex; align-items: center; gap: 9px; }
.v6-vplay { width: 30px; height: 30px; border-radius: 2px; border: 1px solid #d9c493; background: transparent; color: #762c19; cursor: pointer; font-size: 12px; font-family: inherit; }
.v6-vtick { width: 30px; height: 30px; border-radius: 2px; border: 1px solid #d9c493; background: transparent; color: #cdbb92; cursor: pointer; font-size: 13px; font-family: inherit; }
.v6-vtick[data-on] { background: #6b7a2e; border-color: #6b7a2e; color: #f6ecd8; }
.v6-vref { font-size: 11px; letter-spacing: 1.4px; color: #b8791f; text-transform: uppercase; }
.v6-var { font-size: 29px; line-height: 2.1; text-align: right; margin: 6px 0 2px; color: #33230f; }
.v6-ven { font-size: 15px; color: #5e4a2c; line-height: 1.55; }
.v6-verse.playing { box-shadow: 0 0 0 2px #b8791f; }

/* ============ V7 ONSEN — cushioned softness (Wada #128: Corinthian Pink / Venice Green / Light Mauve) ============ */
.v7 { background: #fbf2f2; color: #43343a; padding-bottom: 80px; }
.v7-top { background: #fffafc; border-bottom: 1px solid #f2e0e2; padding: 15px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.v7-brand { font-size: 20px; font-weight: 800; color: #43343a; }
.v7-brand .mark { color: #d98a94; margin-right: 8px; }
.v7-sub { font-size: 11.5px; color: #a38e94; margin-top: 2px; }
.v7-chips { display: flex; gap: 7px; flex-wrap: wrap; }
.v7-chip { background: #fff; border: 1px solid #f2e0e2; border-radius: 999px; padding: 5px 12px; font-size: 12px; color: #7d6a70; box-shadow: 0 1px 3px rgba(120, 80, 90, 0.06); }
.v7-chip .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
.v7-main { max-width: 1060px; margin: 0 auto; padding: 26px 22px; }
.v7-filters { display: flex; gap: 7px; margin-bottom: 20px; flex-wrap: wrap; }
.v7-filter { border: none; background: #fff; color: #a38e94; border-radius: 999px; padding: 6px 15px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: 0 1px 4px rgba(120, 80, 90, 0.08); }
.v7-filter[data-active] { background: #2e9a8f; color: #fff; }
.v7-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(228px, 1fr)); gap: 14px; }
.v7-card { background: #fff; border: 1px solid #f2e0e2; border-radius: 22px; padding: 16px 17px 14px; cursor: pointer; box-shadow: 0 2px 10px rgba(120, 80, 90, 0.06); border-left: 6px solid #efe3e5; }
.v7-card[data-status=done] { border-left-color: #2e9a8f; }
.v7-card[data-status=next] { border-left-color: #e0896c; }
.v7-card[data-status=partial] { border-left-color: #e39aa4; }
.v7-card[data-status=later] { border-left-color: #8a86c9; }
.v7-card-top { display: flex; justify-content: space-between; align-items: center; }
.v7-num { width: 28px; height: 28px; border-radius: 50%; background: #fdf0f1; color: #b06a75; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.v7-cardar { font-size: 20px; color: #2e9a8f; }
.v7-name { font-size: 16.5px; font-weight: 700; margin-top: 7px; }
.v7-meta { font-size: 11.5px; color: #a38e94; margin-top: 2px; }
.v7-meta .tick { color: #2e9a8f; font-weight: 700; }
.v7-pill { margin-top: 10px; border: none; background: #fdf0f1; border-radius: 999px; padding: 5px 12px; font-size: 11.5px; font-weight: 700; color: #7d6a70; cursor: pointer; font-family: inherit; }
.v7-pill[data-status=done] { background: #d9f0ed; color: #1f7a70; }
.v7-pill[data-status=next] { background: #fbe4d8; color: #b05a2e; }
.v7-pill[data-status=partial] { background: #fbdfe3; color: #a55563; }
.v7-pill[data-status=later] { background: #e4e3f5; color: #5d5aa0; }
.v7-sec { margin-top: 44px; }
.v7-crumb { color: #a38e94; font-size: 13px; text-decoration: none; font-weight: 600; }
.v7-chhead { background: #fff; border: 1px solid #f2e0e2; border-radius: 24px; padding: 19px 21px; box-shadow: 0 2px 12px rgba(120, 80, 90, 0.07); }
.v7-chtitle { font-size: 23px; }
.v7-chtitle .ar { font-size: 27px; color: #2e9a8f; margin-left: 12px; }
.v7-chmeta { font-size: 12.5px; color: #a38e94; margin-top: 4px; }
.v7-chmeta b { color: #1f7a70; }
.v7-controls { display: flex; gap: 9px; margin-top: 13px; flex-wrap: wrap; align-items: center; }
.v7-btn { border: none; background: #2e9a8f; color: #fff; border-radius: 999px; padding: 9px 17px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 3px 10px rgba(46, 154, 143, 0.25); }
.v7-btn.o { background: #fdf0f1; color: #7d6a70; box-shadow: none; }
.v7-part { margin: 20px 0 12px; padding: 11px 17px; background: #e8f4f2; border-radius: 18px; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
.v7-part .no { font-weight: 800; color: #1f7a70; }
.v7-part .range { font-size: 12px; color: #6f8a86; margin-left: 10px; }
.v7-part .cnt { font-size: 12px; color: #1f7a70; font-weight: 800; margin-left: 10px; }
.v7-partbtns { display: flex; gap: 7px; }
.v7-ptick { border: none; background: #fff; color: #1f7a70; border-radius: 999px; padding: 5px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.v7-ptick[data-on] { background: #2e9a8f; color: #fff; }
.v7-pplay { border: none; background: #43343a; color: #fff; border-radius: 999px; padding: 5px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.v7-verse { background: #fff; border: 1px solid #f2e0e2; border-radius: 20px; padding: 16px 19px; margin-bottom: 11px; }
.v7-verse.mem { background: #f0f9f7; border-color: #cbe8e4; }
.v7-vtop { display: flex; align-items: center; gap: 9px; }
.v7-vplay { width: 31px; height: 31px; border-radius: 50%; border: none; background: #e8f4f2; color: #1f7a70; cursor: pointer; font-size: 12px; font-family: inherit; }
.v7-vtick { width: 31px; height: 31px; border-radius: 50%; border: none; background: #fdf0f1; color: #d9b8bd; cursor: pointer; font-size: 13px; font-family: inherit; }
.v7-vtick[data-on] { background: #2e9a8f; color: #fff; }
.v7-vref { font-size: 11px; letter-spacing: 1px; color: #b39aa0; font-weight: 700; }
.v7-var { font-size: 29px; line-height: 2.1; text-align: right; margin: 7px 0 2px; color: #3c2f34; }
.v7-ven { font-size: 15px; color: #6d5a60; line-height: 1.55; }
.v7-verse.playing { box-shadow: 0 0 0 3px #e39aa4; }

/* ============ V8 TANZAKU — strip rhythm (Wada #30: Pompeian Red / Mineral Gray) ============ */
.v8 { background: #fafbfb; color: #22262a; padding-bottom: 80px; }
.v8-top { background: #fafbfb; border-bottom: 2px solid #22262a; padding: 13px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.v8-brand { font-size: 17px; font-weight: 800; letter-spacing: 0.6px; }
.v8-brand .mark { color: #ab2439; }
.v8-sub { font-size: 10.5px; color: #8b98a0; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
.v8-chips { display: flex; gap: 10px; flex-wrap: wrap; }
.v8-chip { font-size: 11px; color: #5c6a72; border-left: 2px solid #a2b0ad; padding-left: 7px; letter-spacing: 0.8px; text-transform: uppercase; }
.v8-main { max-width: 920px; margin: 0 auto; padding: 26px 24px; }
.v8-filters { display: flex; gap: 0; margin-bottom: 16px; }
.v8-filter { border: none; background: transparent; padding: 6px 13px; font-size: 12px; letter-spacing: 1.2px; text-transform: uppercase; color: #8b98a0; cursor: pointer; font-family: inherit; }
.v8-filter[data-active] { color: #ab2439; font-weight: 800; }
.v8-list { border-left: 2px solid #22262a; }
.v8-row { display: flex; align-items: center; gap: 14px; padding: 11px 4px 11px 18px; cursor: pointer; border-bottom: 1px solid #e7ebed; position: relative; }
.v8-row::before { content: ""; position: absolute; left: -2px; top: 0; bottom: 0; width: 2px; background: transparent; }
.v8-row[data-status=done]::before { background: #3f7d4e; }
.v8-row[data-status=next]::before { background: #c96f2a; }
.v8-row[data-status=partial]::before { background: #d5648a; }
.v8-row[data-status=later]::before { background: #4a6fa5; }
.v8-rnum { font-size: 11px; color: #a2b0ad; font-variant-numeric: tabular-nums; width: 24px; flex-shrink: 0; }
.v8-rname { font-size: 14px; font-weight: 600; flex-shrink: 0; }
.v8-rar { font-size: 26px; color: #22262a; flex: 1; text-align: right; line-height: 1.4; }
.v8-rmeta { font-size: 11px; color: #8b98a0; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.v8-rmeta .tick { color: #3f7d4e; font-weight: 700; }
.v8-rpill { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; padding: 2px 8px; border: none; border-radius: 0; background: transparent; color: #8b98a0; cursor: pointer; font-family: inherit; font-weight: 700; border-left: 2px solid #a2b0ad; }
.v8-rpill[data-status=done] { color: #3f7d4e; border-left-color: #3f7d4e; }
.v8-rpill[data-status=next] { color: #c96f2a; border-left-color: #c96f2a; }
.v8-rpill[data-status=partial] { color: #d5648a; border-left-color: #d5648a; }
.v8-rpill[data-status=later] { color: #4a6fa5; border-left-color: #4a6fa5; }
.v8-sec { margin-top: 46px; }
.v8-crumb { color: #8b98a0; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; text-decoration: none; }
.v8-chhead { border-left: 2px solid #22262a; padding: 4px 0 4px 22px; }
.v8-chtitle { font-size: 25px; font-weight: 800; }
.v8-chtitle .ar { font-size: 30px; color: #ab2439; margin-left: 12px; }
.v8-chmeta { font-size: 12px; color: #5c6a72; margin-top: 5px; font-variant-numeric: tabular-nums; }
.v8-chmeta b { color: #3f7d4e; }
.v8-controls { display: flex; gap: 12px; margin-top: 14px; flex-wrap: wrap; align-items: center; }
.v8-btn { border: none; background: transparent; color: #ab2439; border-bottom: 2px solid #ab2439; padding: 3px 2px; font-size: 12px; letter-spacing: 1.6px; text-transform: uppercase; cursor: pointer; font-family: inherit; font-weight: 800; }
.v8-btn.g { color: #22262a; border-bottom-color: #22262a; }
.v8-part { margin: 24px 0 6px; padding: 7px 0 5px; border-top: 1px solid #22262a; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
.v8-part .no { font-size: 11px; letter-spacing: 2.2px; text-transform: uppercase; font-weight: 800; color: #ab2439; }
.v8-part .range { font-size: 11.5px; color: #5c6a72; margin-left: 12px; font-variant-numeric: tabular-nums; }
.v8-part .cnt { font-size: 11.5px; color: #3f7d4e; font-weight: 800; margin-left: 12px; }
.v8-partbtns { display: flex; gap: 12px; }
.v8-ptick { border: none; background: transparent; color: #3f7d4e; padding: 2px 1px; font-size: 10.5px; letter-spacing: 1.6px; text-transform: uppercase; cursor: pointer; font-family: inherit; border-bottom: 1px solid #3f7d4e; font-weight: 700; }
.v8-ptick[data-on] { font-weight: 800; }
.v8-pplay { border: none; background: transparent; color: #ab2439; padding: 2px 1px; font-size: 10.5px; letter-spacing: 1.6px; text-transform: uppercase; cursor: pointer; font-family: inherit; border-bottom: 1px solid #ab2439; font-weight: 700; }
.v8-verse { display: flex; gap: 18px; padding: 16px 0 14px; border-bottom: 1px solid #e7ebed; align-items: flex-start; }
.v8-verse.mem .v8-vtick { background: #3f7d4e; color: #fff; border-color: #3f7d4e; }
.v8-verse.mem .v8-bignum { color: #3f7d4e; }
.v8-vtools { display: flex; flex-direction: column; gap: 7px; flex-shrink: 0; padding-top: 6px; }
.v8-vplay { width: 28px; height: 28px; border-radius: 0; border: 1px solid #c9d4da; background: transparent; color: #5c6a72; cursor: pointer; font-size: 11px; font-family: inherit; }
.v8-vtick { width: 28px; height: 28px; border-radius: 0; border: 1px solid #c9d4da; background: transparent; color: #c9d4da; cursor: pointer; font-size: 12px; font-family: inherit; }
.v8-bignum { font-size: 34px; font-weight: 800; color: #dbe3e7; line-height: 1; font-variant-numeric: tabular-nums; flex-shrink: 0; padding-top: 4px; width: 46px; }
.v8-vbody { flex: 1; }
.v8-var { font-size: 28px; line-height: 2.05; text-align: right; color: #22262a; }
.v8-ven { font-size: 13.5px; color: #4c5a62; line-height: 1.55; margin-top: 3px; }
.v8-verse.playing .v8-bignum { color: #ab2439; }
.rise { animation: protoRise 260ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.rise-1 { animation-delay: 30ms; } .rise-2 { animation-delay: 60ms; } .rise-3 { animation-delay: 90ms; }
@keyframes protoRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .rise, .rise-1, .rise-2, .rise-3 { animation: none; }
  .v3-card { transition: none; }
}
</style>
</head>
<body>
<div id="stage"></div>

<nav class="proto-picker" aria-label="Prototype variants">
  <span class="proto-picker-highlight" aria-hidden="true"></span>
  <button class="proto-picker-item" data-active aria-current="true">Ink Wash</button>
  <button class="proto-picker-item">Kinpaku</button>
  <button class="proto-picker-item">Onsen</button>
  <button class="proto-picker-item">Tanzaku</button>
  <span class="proto-picker-divider" aria-hidden="true"></span>
  <button class="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)">&#8635;</button>
</nav>

<style>
.proto-picker {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.82);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 8px 24px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;
}
.proto-picker-highlight {
  position: absolute;
  top: 4px;
  left: 0;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  will-change: transform;
}
.proto-picker[data-ready] .proto-picker-highlight {
  transition:
    transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
    width 250ms cubic-bezier(0.23, 1, 0.32, 1);
}
@media (prefers-reduced-motion: reduce) {
  .proto-picker[data-ready] .proto-picker-highlight { transition: none; }
}
.proto-picker-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font: inherit;
  cursor: pointer;
  transition: color 150ms ease-out;
}
.proto-picker-item:hover { color: rgba(255, 255, 255, 0.85); }
.proto-picker-item:active { transform: scale(0.97); }
.proto-picker-item:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.4); outline-offset: 2px; }
.proto-picker-item[data-active] { color: #fff; }
.proto-picker-divider { width: 1px; height: 16px; margin: 0 4px; background: rgba(255, 255, 255, 0.12); }
.proto-picker-replay { padding: 0 10px; font-size: 14px; }
.proto-picker[data-position="top"] { bottom: auto; top: 24px; }
</style>

<script>
const DATA = __DATA_JSON__;

const STATUSES = [
  { id: "", label: "Not set" },
  { id: "done", label: "Memorised" },
  { id: "partial", label: "Partial" },
  { id: "next", label: "Next" },
  { id: "later", label: "Later" },
];
const statusInfo = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];
const AUDIO = "https://files.alislam.cloud/audio/tilawat/ashiq/002-";
const pad3 = (n) => String(n).padStart(3, "0");
const audioUrl = (v) => AUDIO + pad3(v) + "-AR.mp3";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// demo state, reset on each mount
let state = null;
function freshState() {
  return {
    status: { ...DATA.demoStatus },
    ticked: { 2: new Set([1, 2]) },
    filter: "all",
  };
}

function chipRow(cls, dotColor) {
  const counts = { done: 0, partial: 0, next: 0, later: 0 };
  let vDone = 0;
  for (const s of DATA.surahs) {
    const st = state.status[s.ch];
    if (counts[st] !== undefined) { counts[st]++; if (st === "done") vDone += s.verses; }
  }
  return `
  <div class="${cls}-chips">
    <span class="${cls}-chip"><span class="dot" style="background:#3f7d4e"></span>Memorised ${counts.done} · ${vDone.toLocaleString()} v</span>
    <span class="${cls}-chip"><span class="dot" style="background:#d5648a"></span>Partial ${counts.partial}</span>
    <span class="${cls}-chip"><span class="dot" style="background:#c96f2a"></span>Next ${counts.next}</span>
    <span class="${cls}-chip"><span class="dot" style="background:#4a6fa5"></span>Later ${counts.later}</span>
  </div>`;
}

function visibleSurahs() {
  if (state.filter === "all") return DATA.surahs;
  if (state.filter === "unset") return DATA.surahs.filter((s) => !state.status[s.ch]);
  return DATA.surahs.filter((s) => state.status[s.ch] === state.filter);
}

/* ============ variant renderers ============ */

function renderWashi() {
  const cards = visibleSurahs().map((s, i) => {
    const st = state.status[s.ch] || "";
    const t = DATA.demoTicked[s.ch] || 0;
    return `
    <div class="v1-card rise ${i < 4 ? "rise-" + (i % 3 + 1) : ""}" data-status="${st}" data-ch="${s.ch}">
      <div class="v1-card-top"><span class="v1-num">${s.ch}</span><span class="v1-cardar ar">${esc(s.ar)}</span></div>
      <div class="v1-serif v1-name">${esc(s.name)}</div>
      <div class="v1-meta">${s.verses} verses${t ? ` · <span class="tick">${t}✓</span>` : ""}</div>
      <button class="v1-pill p-status" data-status="${st}" data-ch="${s.ch}">${statusInfo(st).label}</button>
    </div>`;
  }).join("");
  const verses = DATA.verses.map((v) => verseRow("v1", v)).join("");
  return `
  <div class="v1">
    <header class="v1-top rise">
      <div><div class="v1-serif v1-brand"><span class="mark">۞</span>Quran Memoriser</div><div class="v1-sub">Washi — Ivory Buff · English Red · Black (Wada 190)</div></div>
      ${chipRow("v1")}
    </header>
    <main class="v1-main">
      <div class="v1-filters rise-1">${filters("v1")}</div>
      <div class="v1-grid rise-2">${cards}</div>
      <section class="v1-sec">
        <a class="v1-crumb" href="#" onclick="return false">← All chapters</a>
        <div class="v1-chhead rise-3">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center">
            <div class="v1-serif v1-chtitle">2. Al-Baqarah <span class="ar">${esc(DATA.surahs[1].ar)}</span></div>
            <button class="v1-pill p-status" data-status="${state.status[2]}" data-ch="2">${statusInfo(state.status[2]).label}</button>
          </div>
          <div class="v1-chmeta">287 verses · <b>14/287 verses memorised</b></div>
          <div class="v1-controls">
            <button class="v1-btn p-playpart">▶ Play part</button>
            <button class="v1-btn o">Maulawi Sher Ali</button>
          </div>
        </div>
        ${partHeader("v1")}
        ${verses}
      </section>
    </main>
  </div>`;
}

function renderNight() {
  const cards = visibleSurahs().map((s, i) => {
    const st = state.status[s.ch] || "";
    const t = DATA.demoTicked[s.ch] || 0;
    return `
    <div class="v2-card rise ${i < 4 ? "rise-" + (i % 3 + 1) : ""}" data-status="${st}" data-ch="${s.ch}">
      <div class="v2-card-top"><span class="v2-num">${s.ch}</span><span class="v2-cardar ar">${esc(s.ar)}</span></div>
      <div class="v2-name">${esc(s.name)}</div>
      <div class="v2-meta">${s.verses} verses${t ? ` · <span class="tick">${t}✓</span>` : ""}</div>
      <button class="v2-pill p-status" data-status="${st}" data-ch="${s.ch}">${statusInfo(st).label}</button>
    </div>`;
  }).join("");
  const verses = DATA.verses.map((v) => verseRow("v2", v)).join("");
  return `
  <div class="v2">
    <header class="v2-top rise">
      <div><div class="v2-brand">۞ Quran Memoriser</div><div class="v2-sub">Night Tilawah — Deep Indigo · Cinnamon Buff (Wada 344/211)</div></div>
      ${chipRow("v2")}
    </header>
    <main class="v2-main">
      <div class="v2-filters rise-1">${filters("v2")}</div>
      <div class="v2-grid rise-2">${cards}</div>
      <section class="v2-sec">
        <a class="v2-crumb" href="#" onclick="return false">← All chapters</a>
        <div class="v2-chhead rise-3">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center">
            <div class="v2-chtitle">2. Al-Baqarah <span class="ar">${esc(DATA.surahs[1].ar)}</span></div>
            <button class="v2-pill p-status" data-status="${state.status[2]}" data-ch="2">${statusInfo(state.status[2]).label}</button>
          </div>
          <div class="v2-chmeta">287 verses · <b>14/287 verses memorised</b></div>
          <div class="v2-controls">
            <button class="v2-btn p-playpart">▶ Play part</button>
            <button class="v2-btn o">Maulawi Sher Ali</button>
          </div>
        </div>
        ${partHeader("v2")}
        ${verses}
      </section>
    </main>
  </div>`;
}

function renderKacho() {
  const cards = visibleSurahs().map((s, i) => {
    const st = state.status[s.ch] || "";
    const t = DATA.demoTicked[s.ch] || 0;
    return `
    <div class="v3-card rise ${i < 4 ? "rise-" + (i % 3 + 1) : ""}" data-status="${st}" data-ch="${s.ch}">
      <div class="v3-card-top"><span class="v3-num">${s.ch}</span><span class="v3-cardar ar">${esc(s.ar)}</span></div>
      <div class="v3-name">${esc(s.name)}</div>
      <div class="v3-meta">${s.verses} verses${t ? ` · <span class="tick">${t}✓</span>` : ""}</div>
      <button class="v3-pill p-status" data-status="${st}" data-ch="${s.ch}">${statusInfo(st).label}</button>
    </div>`;
  }).join("");
  const verses = DATA.verses.map((v) => verseRow("v3", v)).join("");
  return `
  <div class="v3">
    <header class="v3-top rise">
      <div><div class="v3-brand">۞ Quran Memoriser</div><div class="v3-sub">Kacho — Grenadine Pink · Turquoise Green · Calamine Blue (Wada 300)</div></div>
      ${chipRow("v3")}
    </header>
    <main class="v3-main">
      <div class="v3-filters rise-1">${filters("v3")}</div>
      <div class="v3-grid rise-2">${cards}</div>
      <section class="v3-sec">
        <a class="v3-crumb" href="#" onclick="return false">← All chapters</a>
        <div class="v3-chhead rise-3">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center">
            <div class="v3-chtitle">2. Al-Baqarah <span class="ar">${esc(DATA.surahs[1].ar)}</span></div>
            <button class="v3-pill p-status" data-status="${state.status[2]}" data-ch="2">${statusInfo(state.status[2]).label}</button>
          </div>
          <div class="v3-chmeta">287 verses · <b>14/287 verses memorised</b></div>
          <div class="v3-controls">
            <button class="v3-btn p-playpart">▶ Play part</button>
            <button class="v3-btn o">Maulawi Sher Ali</button>
          </div>
        </div>
        ${partHeader("v3")}
        ${verses}
      </section>
    </main>
  </div>`;
}

function renderLedger() {
  const rows = visibleSurahs().map((s, i) => {
    const st = state.status[s.ch] || "";
    const t = DATA.demoTicked[s.ch] || 0;
    return `
    <div class="v4-row rise ${i < 4 ? "rise-" + (i % 3 + 1) : ""}" data-status="${st}" data-ch="${s.ch}">
      <span class="v4-rail"></span>
      <span class="v4-rnum">${String(s.ch).padStart(3, "0")}</span>
      <span class="v4-rname">${esc(s.name)}</span>
      <span class="v4-rar ar">${esc(s.ar)}</span>
      <span class="v4-rmeta">${s.verses} v${t ? ` · <span class="tick">${t}✓</span>` : ""}</span>
      <button class="v4-rpill p-status" data-status="${st}" data-ch="${s.ch}">${statusInfo(st).label}</button>
    </div>`;
  }).join("");
  const verses = DATA.verses.map((v) => verseRow("v4", v)).join("");
  return `
  <div class="v4">
    <header class="v4-top rise">
      <div><div class="v4-brand"><span class="mark">۞</span> QURAN MEMORISER</div><div class="v4-sub">Ledger — Black · Neutral Gray · Carmine Red (Wada 221)</div></div>
      ${chipRow("v4")}
    </header>
    <main class="v4-main">
      <div class="v4-filters rise-1">${filters("v4")}</div>
      <div class="v4-list rise-2">${rows}</div>
      <section class="v4-sec">
        <a class="v4-crumb" href="#" onclick="return false">← ALL CHAPTERS</a>
        <div class="v4-chhead rise-3">
          <div class="v4-chhead-top">
            <div class="v4-chtitle">2. Al-Baqarah <span class="ar">${esc(DATA.surahs[1].ar)}</span></div>
            <button class="v4-rpill p-status" data-status="${state.status[2]}" data-ch="2">${statusInfo(state.status[2]).label}</button>
          </div>
          <div class="v4-chmeta" style="padding:0 18px 10px">287 verses · <b>14/287 verses memorised</b></div>
          <div class="v4-controls">
            <button class="v4-btn p-playpart">▶ Play part</button>
            <button class="v4-btn o">Sher Ali</button>
          </div>
        </div>
        ${partHeader("v4")}
        ${verses}
      </section>
    </main>
  </div>`;
}

/* ---- round 2: riff around Washi ---- */

function scaffold(cls, subtitle, titleHTML, headExtra) {
  return `
  <header class="${cls}-top rise">
    <div><div class="${cls}-brand">۞ Quran Memoriser</div><div class="${cls}-sub">${subtitle}</div></div>
    ${chipRow(cls)}
  </header>
  <main class="${cls}-main">
    <div class="${cls}-filters rise-1">${filters(cls)}</div>
    ${headExtra}
  </main>`;
}

function renderInkWash() {
  const cards = visibleSurahs().map((s, i) => `
    <div class="v5-card rise ${i < 4 ? "rise-" + (i % 3 + 1) : ""}" data-status="${state.status[s.ch] || ""}" data-ch="${s.ch}">
      <div class="v5-card-top"><span class="v5-num">${String(s.ch).padStart(3, "0")}</span><span class="v5-cardar ar">${esc(s.ar)}</span></div>
      <div class="v5-serif v5-name">${esc(s.name)}</div>
      <div class="v5-meta">${s.verses} VERSES${DATA.demoTicked[s.ch] ? ` · <span class="tick">${DATA.demoTicked[s.ch]}✓</span>` : ""}</div>
      <button class="v5-pill p-status" data-status="${state.status[s.ch] || ""}" data-ch="${s.ch}"><span class="sq"></span>${statusInfo(state.status[s.ch] || "").label}</button>
    </div>`).join("");
  const verses = DATA.verses.map((v) => verseRow("v5", v)).join("");
  return `
  <div class="v5">
    <header class="v5-top rise">
      <div><div class="v5-serif v5-brand"><span class="mark">۞</span>Quran Memoriser</div><div class="v5-sub">Ink Wash — White · Black · Pompeian Red (Wada)</div></div>
      ${chipRow("v5")}
    </header>
    <main class="v5-main">
      <div class="v5-filters rise-1">${filters("v5")}</div>
      <div class="v5-grid rise-2">${cards}</div>
      <section class="v5-sec">
        <a class="v5-crumb" href="#" onclick="return false">← All chapters</a>
        <div class="v5-chhead rise-3">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center">
            <div class="v5-serif v5-chtitle">2. Al-Baqarah <span class="ar">${esc(DATA.surahs[1].ar)}</span></div>
            <button class="v5-pill p-status" data-status="${state.status[2]}" data-ch="2"><span class="sq"></span>${statusInfo(state.status[2]).label}</button>
          </div>
          <div class="v5-chmeta">287 verses · <b>14/287 verses memorised</b></div>
          <div class="v5-controls">
            <button class="v5-btn f p-playpart">▶ Play part</button>
            <button class="v5-btn">Sher Ali</button>
          </div>
        </div>
        ${partHeader("v5")}
        ${verses}
      </section>
    </main>
  </div>`;
}

function renderKinpaku() {
  const cards = visibleSurahs().map((s, i) => `
    <div class="v6-card rise ${i < 4 ? "rise-" + (i % 3 + 1) : ""}" data-status="${state.status[s.ch] || ""}" data-ch="${s.ch}">
      <div class="v6-card-top"><span class="v6-num">${s.ch}</span><span class="v6-cardar ar">${esc(s.ar)}</span></div>
      <div class="v6-name">${esc(s.name)}</div>
      <div class="v6-meta">${s.verses} verses${DATA.demoTicked[s.ch] ? ` · <span class="tick">${DATA.demoTicked[s.ch]}✓</span>` : ""}</div>
      <button class="v6-pill p-status" data-status="${state.status[s.ch] || ""}" data-ch="${s.ch}">${statusInfo(state.status[s.ch] || "").label}</button>
    </div>`).join("");
  const verses = DATA.verses.map((v) => verseRow("v6", v)).join("");
  return `
  <div class="v6">
    <header class="v6-top rise">
      <div><div class="v6-brand"><span class="mark">۞</span>Quran Memoriser</div><div class="v6-sub">Kinpaku — Cinnamon Buff · Madder Brown · Gold leaf (Wada 323)</div></div>
      ${chipRow("v6")}
    </header>
    <main class="v6-main">
      <div class="v6-filters rise-1">${filters("v6")}</div>
      <div class="v6-grid rise-2">${cards}</div>
      <section class="v6-sec">
        <a class="v6-crumb" href="#" onclick="return false">← All chapters</a>
        <div class="v6-chhead rise-3">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center">
            <div class="v6-chtitle">2. Al-Baqarah <span class="ar">${esc(DATA.surahs[1].ar)}</span></div>
            <button class="v6-pill p-status" data-status="${state.status[2]}" data-ch="2">${statusInfo(state.status[2]).label}</button>
          </div>
          <div class="v6-chmeta">287 verses · <b>14/287 verses memorised</b></div>
          <div class="v6-controls">
            <button class="v6-btn p-playpart">▶ Play part</button>
            <button class="v6-btn o">Sher Ali</button>
          </div>
        </div>
        ${partHeader("v6")}
        ${verses}
      </section>
    </main>
  </div>`;
}

function renderOnsen() {
  const cards = visibleSurahs().map((s, i) => `
    <div class="v7-card rise ${i < 4 ? "rise-" + (i % 3 + 1) : ""}" data-status="${state.status[s.ch] || ""}" data-ch="${s.ch}">
      <div class="v7-card-top"><span class="v7-num">${s.ch}</span><span class="v7-cardar ar">${esc(s.ar)}</span></div>
      <div class="v7-name">${esc(s.name)}</div>
      <div class="v7-meta">${s.verses} verses${DATA.demoTicked[s.ch] ? ` · <span class="tick">${DATA.demoTicked[s.ch]}✓</span>` : ""}</div>
      <button class="v7-pill p-status" data-status="${state.status[s.ch] || ""}" data-ch="${s.ch}">${statusInfo(state.status[s.ch] || "").label}</button>
    </div>`).join("");
  const verses = DATA.verses.map((v) => verseRow("v7", v)).join("");
  return `
  <div class="v7">
    <header class="v7-top rise">
      <div><div class="v7-brand"><span class="mark">۞</span>Quran Memoriser</div><div class="v7-sub">Onsen — Corinthian Pink · Venice Green · Light Mauve (Wada 128)</div></div>
      ${chipRow("v7")}
    </header>
    <main class="v7-main">
      <div class="v7-filters rise-1">${filters("v7")}</div>
      <div class="v7-grid rise-2">${cards}</div>
      <section class="v7-sec">
        <a class="v7-crumb" href="#" onclick="return false">← All chapters</a>
        <div class="v7-chhead rise-3">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center">
            <div class="v7-chtitle">2. Al-Baqarah <span class="ar">${esc(DATA.surahs[1].ar)}</span></div>
            <button class="v7-pill p-status" data-status="${state.status[2]}" data-ch="2">${statusInfo(state.status[2]).label}</button>
          </div>
          <div class="v7-chmeta">287 verses · <b>14/287 verses memorised</b></div>
          <div class="v7-controls">
            <button class="v7-btn p-playpart">▶ Play part</button>
            <button class="v7-btn o">Sher Ali</button>
          </div>
        </div>
        ${partHeader("v7")}
        ${verses}
      </section>
    </main>
  </div>`;
}

function verseRowTanzaku(v) {
  const on = state.ticked[2].has(v.n);
  return `
  <div class="v8-verse ${on ? "mem" : ""}" data-v="${v.n}">
    <div class="v8-vtools">
      <button class="v8-vplay p-play" data-v="${v.n}" title="Play 2:${v.n}">▶</button>
      <button class="v8-vtick p-tick" data-v="${v.n}" ${on ? "data-on" : ""} title="Mark memorised">✓</button>
    </div>
    <span class="v8-bignum">${String(v.n).padStart(2, "0")}</span>
    <div class="v8-vbody">
      <div class="v8-var ar">${esc(v.ar)}</div>
      <div class="v8-ven">${esc(v.en)}</div>
    </div>
  </div>`;
}

function renderTanzaku() {
  const rows = visibleSurahs().map((s, i) => `
    <div class="v8-row rise ${i < 4 ? "rise-" + (i % 3 + 1) : ""}" data-status="${state.status[s.ch] || ""}" data-ch="${s.ch}">
      <span class="v8-rnum">${String(s.ch).padStart(3, "0")}</span>
      <span class="v8-rname">${esc(s.name)}</span>
      <span class="v8-rar ar">${esc(s.ar)}</span>
      <span class="v8-rmeta">${s.verses} v${DATA.demoTicked[s.ch] ? ` · <span class="tick">${DATA.demoTicked[s.ch]}✓</span>` : ""}</span>
      <button class="v8-rpill p-status" data-status="${state.status[s.ch] || ""}" data-ch="${s.ch}">${statusInfo(state.status[s.ch] || "").label}</button>
    </div>`).join("");
  const verses = DATA.verses.map((v) => verseRowTanzaku(v)).join("");
  return `
  <div class="v8">
    <header class="v8-top rise">
      <div><div class="v8-brand"><span class="mark">۞</span> QURAN MEMORISER</div><div class="v8-sub">Tanzaku — Pompeian Red · Mineral Gray (Wada 30)</div></div>
      ${chipRow("v8")}
    </header>
    <main class="v8-main">
      <div class="v8-filters rise-1">${filters("v8")}</div>
      <div class="v8-list rise-2">${rows}</div>
      <section class="v8-sec">
        <a class="v8-crumb" href="#" onclick="return false">← ALL CHAPTERS</a>
        <div class="v8-chhead rise-3">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center">
            <div class="v8-chtitle">2. Al-Baqarah <span class="ar">${esc(DATA.surahs[1].ar)}</span></div>
            <button class="v8-rpill p-status" data-status="${state.status[2]}" data-ch="2">${statusInfo(state.status[2]).label}</button>
          </div>
          <div class="v8-chmeta">287 verses · <b>14/287 verses memorised</b></div>
          <div class="v8-controls">
            <button class="v8-btn p-playpart">▶ Play part</button>
            <button class="v8-btn g">Sher Ali</button>
          </div>
        </div>
        ${partHeader("v8")}
        ${verses}
      </section>
    </main>
  </div>`;
}

function filters(cls) {
  const defs = [["all", "All"], ["done", "Memorised"], ["partial", "Partial"], ["next", "Next"], ["later", "Later"], ["unset", "Not set"]];
  return defs.map(([id, label]) =>
    `<button class="${cls}-filter p-filter" data-f="${id}" ${state.filter === id ? "data-active" : ""}>${label}</button>`).join("");
}

function verseRow(cls, v) {
  const on = state.ticked[2].has(v.n);
  return `
  <div class="${cls}-verse ${on ? "mem" : ""}" data-v="${v.n}">
    <div class="${cls}-vtop">
      <button class="${cls}-vplay p-play" data-v="${v.n}" title="Play 2:${v.n}">▶</button>
      <button class="${cls}-vtick p-tick" data-v="${v.n}" ${on ? "data-on" : ""} title="Mark memorised">✓</button>
      <span class="${cls}-vref">2 : ${v.n}</span>
    </div>
    <div class="${cls}-var ar">${esc(v.ar)}</div>
    <div class="${cls}-ven">${esc(v.en)}</div>
  </div>`;
}

function partHeader(cls) {
  const total = 14, done = state.ticked[2].size;
  const on = done === total;
  return `
  <div class="${cls}-part">
    <div><span class="no">Part 1 of 42</span><span class="range">verses 2:1–14 · 159 words</span><span class="cnt p-partcount">${done}/${total} verses ✓</span></div>
    <div class="${cls}-partbtns">
      <button class="${cls}-ptick p-parttick" ${on ? "data-on" : ""}>${on ? "✓ Memorised" : "Mark memorised"}</button>
      <button class="${cls}-pplay p-playpart">▶ Play part</button>
    </div>
  </div>`;
}

/* ============ interactions (delegated, wired after each mount) ============ */

let audio = null;
function stopAudio() {
  if (audio) { audio.pause(); audio = null; }
  document.querySelectorAll(".playing").forEach((n) => n.classList.remove("playing"));
}

function playVerse(v) {
  stopAudio();
  audio = new Audio(audioUrl(v));
  audio.addEventListener("ended", stopAudio);
  audio.play().catch(() => {});
  const row = document.querySelector(`.verse[data-v="${v}"], [class*="-verse"][data-v="${v}"]`);
  if (row) row.classList.add("playing");
}

function wireInteractions(root) {
  root.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.classList.contains("p-status")) {
      const order = ["", "done", "partial", "next", "later"];
      const ch = String(t.dataset.ch);
      const next = order[(order.indexOf(t.dataset.status || "") + 1) % order.length];
      state.status[ch] = next;
      t.dataset.status = next;
      t.textContent = statusInfo(next).label;
      const card = root.querySelector(`[data-ch="${ch}"]`);
      if (card && card !== t) card.dataset.status = next;
      const chips = root.querySelector('[class*="-chips"]');
      if (chips) chips.outerHTML = chipRow(chips.className.split("-")[0]);
      return;
    }
    if (t.classList.contains("p-tick")) {
      const v = +t.dataset.v;
      const set = state.ticked[2];
      if (set.has(v)) { set.delete(v); t.removeAttribute("data-on"); }
      else { set.add(v); t.setAttribute("data-on", ""); }
      const row = t.closest('[class*="-verse"]');
      if (row) row.classList.toggle("mem", set.has(v));
      const cnt = root.querySelector(".p-partcount");
      if (cnt) cnt.textContent = `${set.size}/14 verses ✓`;
      const ptick = root.querySelector(".p-parttick");
      if (ptick) {
        const on = set.size === 14;
        ptick.toggleAttribute("data-on", on);
        ptick.textContent = on ? "✓ Memorised" : "Mark memorised";
      }
      return;
    }
    if (t.classList.contains("p-parttick")) {
      const set = state.ticked[2];
      const on = set.size !== 14;
      set.clear();
      if (on) DATA.verses.forEach((v) => set.add(v.n));
      root.querySelectorAll(".p-tick").forEach((b) => {
        b.toggleAttribute("data-on", set.has(+b.dataset.v));
        const row = b.closest('[class*="-verse"]');
        if (row) row.classList.toggle("mem", set.has(+b.dataset.v));
      });
      const cnt = root.querySelector(".p-partcount");
      if (cnt) cnt.textContent = `${set.size}/14 verses ✓`;
      t.toggleAttribute("data-on", set.size === 14);
      t.textContent = set.size === 14 ? "✓ Memorised" : "Mark memorised";
      return;
    }
    if (t.classList.contains("p-play")) { playVerse(+t.dataset.v); return; }
    if (t.classList.contains("p-playpart")) {
      stopAudio();
      const order = [...DATA.verses.map((v) => v.n)];
      let i = 0;
      const playNext = () => {
        if (i >= order.length) return stopAudio();
        const v = order[i++];
        stopAudio();
        audio = new Audio(audioUrl(v));
        audio.addEventListener("ended", playNext);
        audio.play().catch(() => {});
        const row = document.querySelector(`[class*="-verse"][data-v="${v}"]`);
        if (row) { document.querySelectorAll(".playing").forEach((n) => n.classList.remove("playing")); row.classList.add("playing"); }
      };
      playNext();
      return;
    }
    if (t.classList.contains("p-filter")) {
      state.filter = t.dataset.f;
      remount();
    }
  });
}

const variants = [renderInkWash, renderKinpaku, renderOnsen, renderTanzaku];
const stage = document.getElementById("stage");
const picker = document.querySelector(".proto-picker");
const highlight = picker.querySelector(".proto-picker-highlight");
const allItems = [...picker.querySelectorAll(".proto-picker-item")].filter((b) => !b.classList.contains("proto-picker-replay"));
const replayBtn = picker.querySelector(".proto-picker-replay");
let current = 0;
let wired = false;

function moveHighlight() {
  const el = allItems[current];
  highlight.style.width = el.offsetWidth + "px";
  highlight.style.transform = `translateX(${el.offsetLeft}px)`;
}

function remount() {
  stage.innerHTML = "";
  requestAnimationFrame(() => {
    state = freshState();
    const html = variants[current]();
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const node = holder.firstElementChild;
    stage.appendChild(node);
    if (!wired) { wireInteractions(stage); wired = true; }
  });
}

function setActive(i) {
  if (i < 0 || i >= variants.length) return;
  current = i;
  allItems.forEach((el, j) => {
    el.toggleAttribute("data-active", j === i);
    if (j === i) el.setAttribute("aria-current", "true");
    else el.removeAttribute("aria-current");
  });
  moveHighlight();
  try {
    const url = new URL(location);
    url.searchParams.set("v", i + 1);
    history.replaceState(null, "", url);
  } catch {}
  remount();
}

allItems.forEach((el, i) => el.addEventListener("click", () => setActive(i)));
replayBtn?.addEventListener("click", () => remount());
window.addEventListener("resize", moveHighlight);

document.addEventListener("keydown", (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= variants.length) setActive(num - 1);
  else if (e.key === "ArrowRight") setActive((current + 1) % variants.length);
  else if (e.key === "ArrowLeft") setActive((current - 1 + variants.length) % variants.length);
  else if (e.key === "r" || e.key === "R") remount();
});

setActive((parseInt(new URLSearchParams(location.search).get("v"), 10) || 1) - 1);
requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute("data-ready", "")));
</script>
</body>
</html>
"""

out = HTML.replace("__DATA_JSON__", json.dumps(DATA, ensure_ascii=False))
(ROOT / "prototype.html").write_text(out, encoding="utf-8")
print("wrote prototype.html", len(out), "bytes")
