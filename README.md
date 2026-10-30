# Quran Memoriser

A local web app for tracking Quran memorisation, built on alislam.org's Quran assets.

**Live:** https://drhammadkhan.github.io/quran-memoriser/ — open on your phone and Add to Home Screen to install it as a fully offline app.

## Run it

```bash
cd quran-memoriser
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765

## Install as an app (phone/tablet)

The app is a PWA (manifest + service worker). Served over **HTTPS** (or localhost), the service worker caches the app shell and font, and on first launch the app saves all 114 chapters (text, translation, transliteration) to the device in the background — resumably, so a closed app picks up where it left off. After that it runs entirely on the device, offline, launched from a home-screen icon. When online, code updates apply on the next launch and changed data files are re-downloaded automatically (via `data/manifest.json`):

- **Android (Chrome):** open the site → menu → *Add to Home screen / Install app*.
- **iPhone/iPad (Safari):** open the site → Share → *Add to Home Screen*.
- Use the in-app **Offline audio** panel to store reciters on the device too (HTTPS enables this).

Easiest HTTPS hosting: drag the `quran-memoriser` folder onto [Netlify Drop](https://app.netlify.com/drop) (free account keeps the site), or publish to GitHub Pages / Cloudflare Pages. Hosting on the LAN keeps it private but the service worker, offline audio and install prompt need HTTPS — plain `http://<lan-ip>` gives text + streaming audio only.

## Features

- **Home page** — a card for every one of the 114 chapters (English + Arabic name, verse count).
- **Three-state tracking** — every chapter has a colour button that cycles:
  🟢 **Memorised** → 🩷 **Partial** → 🟠 **Next** → 🔵 **Later** → Not set.
  Saved in your browser (localStorage) and filterable from the toolbar; the header shows running progress.
- **Chapter ↔ verse rules** — the chapter status and its verse ticks are one state seen from two levels, and each level moves the other. Marking a chapter Memorised ticks all of its verses; clearing it back to Not set unticks them; stopping on Partial/Next/Later leaves the ticks untouched (a coarse claim). From the verse side, ticking any verses marks the chapter Partial, ticking them all marks it Memorised, and unticking your last ticked verse returns it to Not set. Cycling through a status without stopping on it never touches the verses.
- **Chapter view** — every verse in Arabic (Manzoor Naskh font, as used by alislam.org's own Quran app) with the English translation by Maulawi Sher Ali, plus per-verse **word meanings** and **Latin transliteration** toggles across all 114 chapters.
- **Backup & transfer** — the "⇪ Backup" button exports your progress as a snapshot: share it as a file (iOS share sheet), copy it to the clipboard, or paste a snapshot back to import. Importing merges — the newer state of each chapter and verse wins, and un-ticks carry over. No accounts, no servers; your data stays in each device's browser unless you move it.
- **Practice mode (active memorisation)** — the "◔ Practice" button on a chapter (or "◔ Practice part" on any part header) hides the Arabic behind tap-to-reveal masks so you recite from memory and check yourself. The prompt level is adjustable: fully blank, or **first letters of every Arabic word** (the classic hifz prompt). Combined with the **Recite pause** setting (2–10s) and **Repeat ×N**, the verse or part player becomes a listen-and-repeat drill: hear the verse, the app falls silent for your pause while you recite, then it plays again.
- **Verse-level tracking** — every verse has a ✓ button. Tick verses as you memorise them; the chapter status follows the rules above. Unticking a verse un-completes its part. Ticking a part marks all its verses in one go. The chapter page shows live "n/N verses memorised", and chapter cards on the home page show their ticked-verse count.
- **Memorisation parts** — long surahs (30+ verses) are auto-split into parts of ~150 Arabic words each (about half a mushaf page — one memorisation sitting), always snapped to verse boundaries. Al-Baqarah becomes 42 parts. Each part has a tick (✓ memorised, tracked per part in your browser), a "Play part" button that recites just that part, and the strip at the top shows your part-by-part progress.
- **Audio** — verse-by-verse Arabic recitation streamed from files.alislam.cloud, with a choice of 5 reciters (Qari Muhammad Ashiq, Maulana Feroz Alam, Aiman Almaliki, Mishary Rashid AlAfasy, Idir Iken). Play a single verse or the whole chapter continuously, with an optional repeat count (1×/2×/3×/5×) for memorisation.
- **About page** — the "ⓘ About" link in the toolbar (`#/about`) explains tracking, practice mode, audio, installing on a phone, and backup, with full source credits.

- **Offline audio** — the "⤓ Offline audio" button in the header opens a panel where you can download any of the 5 reciters (about 1.5 GB each) into this browser's storage. Downloads show live progress, can be cancelled and resumed, and removed again. Once a reciter is downloaded, its audio plays with no internet connection; anything not downloaded still streams from files.alislam.cloud on demand.

## Where the data comes from

| Asset | Source |
|---|---|
| Arabic text + Sher Ali English translation | `api.readquran.app` — the API behind alislam.org's official Quran app ([alislam.org/quran/app](https://alislam.org/quran/app/1?options=en)) |
| Recitation audio (per verse) | `files.alislam.cloud/audio/tilawat/<reciter>/<chapter>-<verse>-AR.mp3` |
| Manzoor Naskh font | alislam.org's Quran app assets |

Verse numbering follows alislam.org's Quran (6,348 verses — in their numbering the Bismillah is verse 1 of each chapter except At-Tawbah; e.g. Al-Baqarah has 287 verses). This matches the audio files exactly.

## Files

- `index.html` / `styles.css` / `app.js` — the app (no build step, no dependencies)
- `data/surahs.json` — 114 chapter metadata records
- `data/chapters/1.json … 114.json` — verses (Arabic, English, word glosses), downloaded by `download-data.py`
- `data/translit/1.json … 114.json` — Latin transliteration for all 114 chapters
- `assets/ManzoorNaskh.ttf` — Arabic font from alislam.org

To re-download or refresh the text data: `python3 download-data.py`

After editing anything in `data/` by hand, run `python3 build-manifest.py` before pushing. It writes `data/manifest.json` (a hash per data file); installed apps compare it with the copies saved on the device and re-download only the files that changed.
