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

The app is a PWA (manifest + service worker). Served over **HTTPS** (or localhost), the service worker precaches the entire app — shell, all 114 chapters and the font — so after the first load it runs entirely on the device, offline, launched from a home-screen icon:

- **Android (Chrome):** open the site → menu → *Add to Home screen / Install app*.
- **iPhone/iPad (Safari):** open the site → Share → *Add to Home Screen*.
- Use the in-app **Offline audio** panel to store reciters on the device too (HTTPS enables this).

Easiest HTTPS hosting: drag the `quran-memoriser` folder onto [Netlify Drop](https://app.netlify.com/drop) (free account keeps the site), or publish to GitHub Pages / Cloudflare Pages. Hosting on the LAN keeps it private but the service worker, offline audio and install prompt need HTTPS — plain `http://<lan-ip>` gives text + streaming audio only.

## Features

- **Home page** — a card for every one of the 114 chapters (English + Arabic name, verse count).
- **Three-state tracking** — every chapter has a colour button that cycles:
  🟢 **Memorised** → 🩷 **Partial** → 🟠 **Next** → 🔵 **Later** → Not set.
  Saved in your browser (localStorage) and filterable from the toolbar; the header shows running progress.
- **Chapter view** — every verse in Arabic (Manzoor Naskh font, as used by alislam.org's own Quran app) with the English translation by Maulawi Sher Ali, plus a per-verse **word meanings** toggle.
- **Verse-level tracking** — every verse has a ✓ button. Tick verses as you memorise them; completing every verse of a part automatically marks the part memorised, and completing every verse of a chapter automatically sets the chapter to Memorised (green). Unticking a verse un-completes its part, and a completed chapter drops to Partial. Ticking a part marks all its verses in one go. The chapter page shows live "n/N verses memorised", and chapter cards on the home page show their ticked-verse count.
- **Memorisation parts** — long surahs (30+ verses) are auto-split into parts of ~150 Arabic words each (about half a mushaf page — one memorisation sitting), always snapped to verse boundaries. Al-Baqarah becomes 42 parts. Each part has a tick (✓ memorised, tracked per part in your browser), a "Play part" button that recites just that part, and the strip at the top shows your part-by-part progress.
- **Audio** — verse-by-verse Arabic recitation streamed from files.alislam.cloud, with a choice of 5 reciters (Qari Muhammad Ashiq, Maulana Feroz Alam, Aiman Almaliki, Mishary Rashid AlAfasy, Idir Iken). Play a single verse or the whole chapter continuously, with an optional repeat count (1×/2×/3×/5×) for memorisation.

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
- `assets/ManzoorNaskh.ttf` — Arabic font from alislam.org

To re-download or refresh the text data: `python3 download-data.py`
