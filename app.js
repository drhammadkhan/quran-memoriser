/* Quran Memoriser
 * Text/translation: api.readquran.app (the API behind alislam.org's Quran app)
 * Recitation audio:  files.alislam.cloud/audio/tilawat/<reciter>/<ch>-<verse>-AR.mp3
 * Statuses are stored in localStorage.
 */
(() => {
  "use strict";

  const AUDIO_BASE = "https://files.alislam.cloud/audio/tilawat/";
  const RECITERS = {
    ashiq: "Qari Muhammad Ashiq",
    feroz: "Maulana Feroz Alam",
    aiman: "Aiman Almaliki",
    rashid: "Mishary Rashid AlAfasy",
    "idir-iken": "Idir Iken",
  };
  const STATUSES = [
    { id: "", label: "Not set" },
    { id: "done", label: "Memorised", dot: "var(--green)" },
    { id: "partial", label: "Partial", dot: "var(--pink)" },
    { id: "next", label: "Next", dot: "var(--orange)" },
    { id: "later", label: "Later", dot: "var(--blue)" },
  ];

  // ---------- state ----------
  let surahs = [];
  let chapterCache = {};
  let filter = "all";
  let player = {
    audio: null,
    chapter: null,      // chapter number during continuous play
    verseIndex: -1,     // index into verses of current chapter
    endIndex: -1,       // last verse index to play (part boundary or whole chapter)
    partIndex: null,    // part index when playing a specific part
    repeatLeft: 0,
    continuous: false,
    currentCh: null,
    currentV: null,
    objectUrl: null,
    gapTimer: null,
    errorStreak: 0,
  };

  // Chapter statuses, stored with timestamps for cross-device merging:
  // { "2": { "s": "partial", "t": <ms> } }. Empty string "s": "" is a tombstone
  // ("cleared to Not set at <ms>"). The plain-string format from before sync is
  // migrated on read (treated as t=0, i.e. oldest).
  const statusStore = {
    key: "qm.status.v1",
    readRaw() {
      let m = {};
      try { m = JSON.parse(localStorage.getItem(this.key)) || {}; } catch {}
      const out = {};
      for (const [ch, v] of Object.entries(m)) {
        if (typeof v === "string") { if (v) out[ch] = { s: v, t: 0 }; }
        else if (v && typeof v === "object" && typeof v.s === "string") out[ch] = { s: v.s, t: v.t || 0 };
      }
      return out;
    },
    writeRaw(m) { localStorage.setItem(this.key, JSON.stringify(m)); renderChips(); },
    read() {
      const out = {};
      for (const [ch, v] of Object.entries(this.readRaw())) if (v.s) out[ch] = v.s;
      return out;
    },
    get(ch) { return (this.readRaw()[ch] || {}).s || ""; },
    set(ch, val) {
      const m = this.readRaw();
      m[ch] = { s: val || "", t: Date.now() };
      this.writeRaw(m);
      return val || "";
    },
    cycle(ch) {
      const order = ["", "done", "partial", "next", "later"];
      const next = order[(order.indexOf(this.get(ch)) + 1) % order.length];
      return this.set(ch, next);
    },
  };

  // ---------- modal helper ----------
  function bindModalEscape(overlay) {
    const onKey = (e) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
  }

  // ---------- export / import snapshot ----------
  // Snapshots carry timestamps, so importing always merges: the newer state
  // of each chapter status / verse tick wins. Un-ticks and status clears are tombstones.
  const snapshots = {
    build() {
      return {
        app: "quran-memoriser", v: 1, exportedAt: new Date().toISOString(),
        status: statusStore.readRaw(), verses: verseStore.readAllRaw(),
      };
    },
    mergeInto(localRaw, snapRaw) {
      const pickStatus = (a, b) => {
        const aOk = a && typeof a === "object" && typeof a.s === "string";
        const bOk = b && typeof b === "object" && typeof b.s === "string";
        if (!aOk && !bOk) return null;
        if (!aOk) return { s: b.s, t: b.t || 0 };
        if (!bOk) return { s: a.s, t: a.t || 0 };
        return (b.t || 0) >= (a.t || 0) ? { s: b.s, t: b.t || 0 } : { s: a.s, t: a.t || 0 };
      };
      const pickVerses = (a = {}, b = {}) => {
        const out = { ...a };
        for (const [k, bv] of Object.entries(b)) {
          if (typeof bv !== "number") continue;
          const av = out[k];
          if (av === undefined || Math.abs(bv) >= Math.abs(av)) out[k] = bv;
        }
        return out;
      };
      const status = {}, verses = {};
      const chs = new Set([...Object.keys(localRaw.status || {}), ...Object.keys(snapRaw.status || {})]);
      for (const ch of chs) {
        const m = pickStatus(localRaw.status?.[ch], snapRaw.status?.[ch]);
        if (m) status[ch] = m;
      }
      const vchs = new Set([...Object.keys(localRaw.verses || {}), ...Object.keys(snapRaw.verses || {})]);
      for (const ch of vchs) {
        const m = pickVerses(localRaw.verses?.[ch], snapRaw.verses?.[ch]);
        if (Object.keys(m).length) verses[ch] = m;
      }
      return { status, verses };
    },
    apply(snap) {
      if (!snap || typeof snap !== "object") throw new Error("Invalid snapshot");
      const merged = this.mergeInto(
        { status: statusStore.readRaw(), verses: verseStore.readAllRaw() },
        { status: snap.status || {}, verses: snap.verses || {} }
      );
      statusStore.writeRaw(merged.status);
      verseStore.writeAllRaw(merged.verses);
      // Reconcile chapter statuses with merged verse ticks
      const touched = new Set([
        ...Object.keys(merged.status || {}),
        ...Object.keys(merged.verses || {}),
      ]);
      for (const chStr of touched) {
        const ch = parseInt(chStr, 10);
        const meta = surahs.find((s) => s.ch === ch);
        if (!meta) continue;
        const done = verseStore.count(ch);
        const cur = statusStore.get(ch);
        if (done === meta.verses && cur !== "done") {
          statusStore.set(ch, "done");
        } else if (done > 0 && done < meta.verses && (cur === "" || cur === "done")) {
          statusStore.set(ch, "partial");
        }
      }
    },
  };

  function renderExportPanel() {
    const existing = document.getElementById("export-panel");
    if (existing) { existing.remove(); return; }
    const overlay = el("div", "modal-overlay");
    overlay.id = "export-panel";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    bindModalEscape(overlay);
    const card = el("div", "modal-card");
    const close = el("button", "modal-close", "✕");
    close.addEventListener("click", () => overlay.remove());
    card.append(el("h2", "modal-title", "Backup & transfer"), close);
    card.append(el("div", "modal-note",
      "Move your progress between devices: export a snapshot on one, import it on the other. " +
      "Importing merges — the newer state of each chapter and verse wins, and un-ticks carry over."));

    const row = el("div", "reciter-actions");
    row.style.margin = "12px 0";

    const shareBtn = el("button", "btn btn-play", "⇪ Share / save file");
    shareBtn.addEventListener("click", async () => {
      const data = JSON.stringify(snapshots.build(), null, 1);
      const file = new File([data], "quran-memoriser-backup.json", { type: "application/json" });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "Quran Memoriser backup" }); return; }
        catch (err) { if (err?.name === "AbortError") return; }
      }
      const blobUrl = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "quran-memoriser-backup.json";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      shareBtn.textContent = "Saved ✓";
      setTimeout(() => (shareBtn.textContent = "⇪ Share / save file"), 2000);
    });

    const copyBtn = el("button", "btn btn-ghost", "Copy to clipboard");
    copyBtn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(snapshots.build())); copyBtn.textContent = "Copied ✓"; }
      catch { copyBtn.textContent = "Copy failed — use the box below"; }
      setTimeout(() => (copyBtn.textContent = "Copy to clipboard"), 2000);
    });
    row.append(shareBtn, copyBtn);
    card.append(row);

    card.append(el("div", "modal-note", "…or import a backup file / paste a snapshot here:"));
    const area = el("textarea");
    area.placeholder = '{"app":"quran-memoriser", …}';
    area.style.cssText = "width:100%;height:84px;margin:8px 0;padding:8px 10px;border:1px solid var(--border-strong);border-radius:6px;background:var(--surface);color:var(--ink);font-size:12px";

    const importRow = el("div", "reciter-actions");
    const importBtn = el("button", "btn btn-play", "Import snapshot");
    const runImport = (text, statusTarget) => {
      const orig = statusTarget.textContent;
      try {
        snapshots.apply(JSON.parse(text));
        route();
        renderChips();
        statusTarget.textContent = "Imported ✓";
      } catch {
        statusTarget.textContent = "Invalid snapshot";
      }
      setTimeout(() => (statusTarget.textContent = orig), 2000);
    };
    importBtn.addEventListener("click", () => runImport(area.value, importBtn));

    const fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.style.display = "none";
    const fileBtn = el("button", "btn btn-ghost", "Choose backup file…");
    fileBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        const text = await f.text();
        area.value = text;
        runImport(text, fileBtn);
      } catch {
        fileBtn.textContent = "Could not read file";
        setTimeout(() => (fileBtn.textContent = "Choose backup file…"), 2000);
      }
      fileInput.value = "";
    });
    importRow.append(importBtn, fileBtn, fileInput);
    card.append(area, importRow);

    overlay.append(card);
    document.body.append(overlay);
  }

  const prefs = {
    key: "qm.prefs.v1",
    read() {
      try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; }
    },
    write(p) { localStorage.setItem(this.key, JSON.stringify(p)); },
    get(k, d) { return this.read()[k] ?? d; },
    set(k, v) { const p = this.read(); p[k] = v; this.write(p); },
  };

  // Per-verse memorisation ticks with timestamps: { "2": { "1": <ms> } }.
  // Negative timestamps are tombstones ("unticked at <ms>") so un-ticks
  // propagate across devices. Legacy boolean true migrates to t=0.
  const verseStore = {
    key: "qm.verses.v1",
    readAllRaw() {
      let all = {};
      try { all = JSON.parse(localStorage.getItem(this.key)) || {}; } catch {}
      for (const ch of Object.keys(all)) {
        const out = {};
        for (const [v, val] of Object.entries(all[ch])) {
          if (val === true) out[v] = 0;
          else if (typeof val === "number" && val !== 0) out[v] = val;
        }
        if (Object.keys(out).length) all[ch] = out; else delete all[ch];
      }
      return all;
    },
    writeAllRaw(m) { localStorage.setItem(this.key, JSON.stringify(m)); },
    read(ch) {
      const out = {};
      for (const [v, t] of Object.entries(this.readAllRaw()[ch] || {})) if (t >= 0) out[v] = true;
      return out;
    },
    get(ch, v) {
      const t = (this.readAllRaw()[ch] || {})[v];
      return t !== undefined && t >= 0;
    },
    set(ch, v, on) {
      const all = this.readAllRaw();
      const m = all[ch] || {};
      m[v] = on ? Date.now() : -Date.now();
      all[ch] = m;
      this.writeAllRaw(all);
    },
    count(ch) { return Object.values(this.readAllRaw()[ch] || {}).filter((t) => t >= 0).length; },
  };

  // Split a surah into memorisation parts: ~150 Arabic words each (about half a
  // mushaf page — one memorisation sitting), always snapped to verse boundaries.
  // A single verse longer than the target simply becomes its own part.
  const PART_TARGET_WORDS = 150;
  const PART_MIN_SURAH_VERSES = 30;

  function computeParts(verses) {
    if (verses.length < PART_MIN_SURAH_VERSES) return [];
    const parts = [];
    let start = 0, words = 0;
    verses.forEach((v, i) => {
      words += v.ar.trim().split(/\s+/).length;
      if (words >= PART_TARGET_WORDS && i < verses.length - 1) {
        parts.push({ start, end: i, words });
        start = i + 1; words = 0;
      }
    });
    if (start < verses.length) {
      // merge a stub tail into the previous part
      if (parts.length && words < PART_TARGET_WORDS * 0.35) {
        parts[parts.length - 1].end = verses.length - 1;
        parts[parts.length - 1].words += words;
      } else {
        parts.push({ start, end: verses.length - 1, words });
      }
    }
    return parts.map((p, i) => ({ ...p, i, from: verses[p.start].n, to: verses[p.end].n }));
  }

  // ---------- offline audio (per-reciter downloads into CacheStorage) ----------
  const AUDIO_STATE_KEY = "qm.audio.v1";
  const cacheName = (reciter) => `qm-audio-${reciter}`;
  let downloadJobs = {}; // reciter -> { cancelled, checking, done, failed, bytes, previously, total, onUpdate }
  let playToken = 0;

  const audioState = {
    read() { try { return JSON.parse(localStorage.getItem(AUDIO_STATE_KEY)) || {}; } catch { return {}; } },
    write(m) { localStorage.setItem(AUDIO_STATE_KEY, JSON.stringify(m)); },
  };

  function allVerseUrls(reciter) {
    const urls = [];
    for (const s of surahs) {
      for (let v = 1; v <= s.verses; v++) urls.push(audioUrl(s.ch, v, reciter));
    }
    return urls;
  }

  // Serve from the local cache when the reciter has been downloaded, else the CDN.
  async function resolveAudioUrl(ch, v, reciter) {
    const url = audioUrl(ch, v, reciter);
    if (typeof caches !== "undefined") {
      try {
        const hit = await caches.match(url, { cacheName: cacheName(reciter) });
        if (hit) return { url: URL.createObjectURL(await hit.blob()), objectUrl: true };
      } catch {}
    }
    return { url, objectUrl: false };
  }

  async function startReciterDownload(reciter, rowUpdate) {
    if (downloadJobs[reciter]) {
      downloadJobs[reciter].onUpdate = rowUpdate;
      return;
    }
    if (!surahs.length) return;
    try { await navigator.storage?.persist?.(); } catch {}
    const urls = allVerseUrls(reciter);
    const job = {
      cancelled: false,
      checking: true,
      done: 0,
      failed: 0,
      bytes: 0,
      previously: 0,
      total: urls.length,
      onUpdate: rowUpdate,
    };
    downloadJobs[reciter] = job;
    job.onUpdate?.(job, false);
    try {
      const cache = await caches.open(cacheName(reciter));
      const existingReqs = await cache.keys();
      const existingSet = new Set(existingReqs.map((r) => r.url));
      const missing = [];
      for (const u of urls) {
        if (existingSet.has(u)) job.previously++;
        else missing.push(u);
      }
      job.checking = false;
      job.onUpdate?.(job, false);
      let idx = 0;
      const CONCURRENCY = 4;
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (!job.cancelled && idx < missing.length) {
          const u = missing[idx++];
          try {
            const r = await fetch(u);
            if (!r.ok) throw new Error("HTTP " + r.status);
            const len = parseInt(r.headers.get("content-length") || "0", 10);
            if (len > 0) {
              job.bytes += len;
              await cache.put(u, r);
            } else {
              const blob = await r.clone().blob();
              job.bytes += blob.size;
              await cache.put(u, r);
            }
            job.done++;
          } catch { job.failed++; }
          job.onUpdate?.(job, false);
        }
      });
      await Promise.all(workers);
    } finally {
      delete downloadJobs[reciter];
    }
    const st = audioState.read();
    const cached = job.previously + job.done;
    const priorBytes = st[reciter]?.bytes || 0;
    st[reciter] = {
      status: (!job.cancelled && job.failed === 0 && cached === job.total) ? "done" : "partial",
      cached,
      total: job.total,
      bytes: priorBytes + job.bytes,
    };
    audioState.write(st);
    job.onUpdate?.(job, true);
  }

  function cancelReciterDownload(reciter) {
    const job = downloadJobs[reciter];
    if (job) job.cancelled = true;
  }

  async function removeReciterAudio(reciter, rowUpdate) {
    cancelReciterDownload(reciter);
    await caches.delete(cacheName(reciter));
    const st = audioState.read();
    delete st[reciter];
    audioState.write(st);
    if (rowUpdate) rowUpdate(null, true);
  }

  const fmtMB = (bytes) => (bytes / (1024 * 1024)).toFixed(0) + " MB";
  const fmtPct = (n, d) => (d ? Math.round((n / d) * 100) : 0) + "%";

  function renderOfflinePanel() {
    const existing = document.getElementById("offline-panel");
    if (existing) { existing.remove(); return; }
    if (typeof caches === "undefined") {
      alert("Offline audio needs a secure context — serve the app from http://127.0.0.1 or localhost.");
      return;
    }
    const overlay = el("div", "modal-overlay");
    overlay.id = "offline-panel";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    bindModalEscape(overlay);
    const card = el("div", "modal-card");
    const close = el("button", "modal-close", "✕");
    close.addEventListener("click", () => overlay.remove());
    card.append(
      el("h2", "modal-title", "Offline audio"),
      el("div", "modal-note",
        "Download a reciter's verse-by-verse audio into this browser (about 1.5 GB each). " +
        "Downloaded reciters play without an internet connection. Downloads can be cancelled and resumed."),
      close);

    const quotaEl = el("div", "storage-line", "Checking browser storage…");
    card.append(quotaEl);
    navigator.storage?.estimate?.().then((est) => {
      if (quotaEl.isConnected) {
        quotaEl.textContent = `Browser storage: using ${(est.usage / 1073741824).toFixed(2)} GB of ~${(est.quota / 1073741824).toFixed(0)} GB available`;
      }
    }).catch(() => quotaEl.remove());

    for (const [id, name] of Object.entries(RECITERS)) {
      const row = el("div", "reciter-row");
      const info = el("div", "reciter-info");
      const title = el("div", "reciter-name", esc(name));
      const status = el("div", "reciter-status");
      const bar = el("div", "progress-track");
      const fill = el("div", "progress-fill");
      bar.append(fill);
      info.append(title, status);
      const actions = el("div", "reciter-actions");
      row.append(info, actions);
      card.append(row);

      const paint = (job, finished) => {
        if (!row.isConnected) return;
        actions.innerHTML = "";
        const st = audioState.read()[id];
        fill.style.width = "0%";
        bar.style.display = "none";
        if (job && !finished) {
          const doneAll = job.previously + job.done;
          status.textContent = job.checking
            ? "Checking cached verses…"
            : `Downloading… ${doneAll.toLocaleString()} / ${job.total.toLocaleString()} (${fmtPct(doneAll, job.total)})${job.failed ? " · " + job.failed + " failed" : ""}`;
          bar.style.display = "block";
          fill.style.width = fmtPct(doneAll, job.total);
          const cancelBtn = el("button", "btn btn-stop", "Cancel");
          cancelBtn.addEventListener("click", () => cancelReciterDownload(id));
          actions.append(cancelBtn);
        } else if (st?.status === "done") {
          status.textContent = `✓ Downloaded — ${st.cached.toLocaleString()} verses · ~${fmtMB(st.bytes)}`;
          const rm = el("button", "btn btn-ghost", "Remove");
          rm.addEventListener("click", () => removeReciterAudio(id, paint));
          actions.append(rm);
        } else if (st?.status === "partial") {
          status.textContent = `Partially downloaded — ${st.cached.toLocaleString()} of ${st.total.toLocaleString()} verses · ~${fmtMB(st.bytes)}`;
          const dl = el("button", "btn btn-play", "Resume");
          dl.addEventListener("click", () => startReciterDownload(id, paint));
          const rm = el("button", "btn btn-ghost", "Remove");
          rm.addEventListener("click", () => removeReciterAudio(id, paint));
          actions.append(dl, rm);
        } else {
          status.textContent = "Not downloaded";
          const dl = el("button", "btn btn-play", "Download");
          dl.addEventListener("click", () => startReciterDownload(id, paint));
          actions.append(dl);
        }
      };
      if (downloadJobs[id]) downloadJobs[id].onUpdate = paint;
      paint(downloadJobs[id], false);
    }

    overlay.append(card);
    document.body.append(overlay);
  }

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Allow only simple formatting tags from the translation API; drop everything else.
  const rich = (s) => {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(s);
    const ALLOWED = new Set(["I", "B", "EM", "STRONG", "SUP", "SUB", "BR"]);
    const walk = (node) => {
      for (const c of [...node.childNodes]) {
        if (c.nodeType === 3) continue;
        if (c.nodeType === 1 && ALLOWED.has(c.tagName)) walk(c);
        else if (c.nodeType === 1) {
          const frag = document.createDocumentFragment();
          while (c.firstChild) frag.appendChild(c.firstChild);
          c.replaceWith(frag);
          walk(node);
        } else c.remove();
      }
    };
    walk(tpl.content);
    return tpl.innerHTML;
  };
  const pad3 = (n) => String(n).padStart(3, "0");
  const audioUrl = (ch, v, reciter) => `${AUDIO_BASE}${reciter}/${pad3(ch)}-${pad3(v)}-AR.mp3`;
  const statusInfo = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

  // Refresh every on-screen status control for a chapter (grid card + chapter header)
  // after its status changed programmatically.
  function syncStatusButtons(ch) {
    const st = statusStore.get(ch);
    const info = statusInfo(st);
    const meta = surahs.find((s) => s.ch === ch);
    const ticked = verseStore.count(ch);
    document.querySelectorAll(`.card[data-ch="${ch}"] .status-btn, .chapter-head[data-ch="${ch}"] .status-btn`)
      .forEach((b) => {
        b.dataset.status = st;
        b.innerHTML = `<span class="dot"></span>${esc(info.label)}`;
      });
    document.querySelectorAll(`.card[data-ch="${ch}"]`).forEach((c) => {
      c.dataset.status = st;
      if (meta) {
        const metaEl = c.querySelector(".surah-meta");
        if (metaEl) metaEl.innerHTML = `${meta.verses} verses${ticked ? ` · <span class="meta-ticked">${ticked}✓</span>` : ""}`;
      }
    });
    renderChips();
  }

  // ---------- audio ----------
  function detachAudio() {
    document.querySelectorAll(".verse-play.loading").forEach((n) => n.classList.remove("loading"));
    if (player.objectUrl) {
      URL.revokeObjectURL(player.objectUrl);
      player.objectUrl = null;
    }
    if (player.audio) {
      player.audio.pause();
      player.audio = null;
    }
  }

  function syncPartPlayButtons() {
    document.querySelectorAll(".part-play[data-part-play]").forEach((b) => {
      const pIdx = +b.dataset.partPlay;
      const active = player.continuous && player.partIndex === pIdx;
      b.textContent = active ? "■ Stop part" : "▶ Play part";
      b.classList.toggle("btn-stop", active);
    });
  }

  function stopPlayback() {
    ++playToken;
    detachAudio();
    if (player.gapTimer) { clearTimeout(player.gapTimer); player.gapTimer = null; }
    player.continuous = false;
    player.chapter = null;
    player.verseIndex = -1;
    player.endIndex = -1;
    player.partIndex = null;
    player.currentCh = null;
    player.currentV = null;
    player.errorStreak = 0;
    document.querySelectorAll(".verse.playing").forEach((n) => n.classList.remove("playing"));
    const btn = document.getElementById("play-chapter-btn");
    if (btn) {
      btn.textContent = "▶ Play chapter";
      btn.classList.replace("btn-stop", "btn-play");
    }
    syncPartPlayButtons();
  }

  function highlightVerse(ch, n) {
    document.querySelectorAll(".verse.playing").forEach((el2) => el2.classList.remove("playing"));
    const row = document.querySelector(`.verse[data-v="${n}"][data-ch="${ch}"]`);
    if (row) {
      row.classList.add("playing");
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  async function playVerse(ch, n, { continuous = false } = {}) {
    detachAudio();
    if (player.gapTimer) { clearTimeout(player.gapTimer); player.gapTimer = null; }
    const token = ++playToken;
    player.continuous = continuous;
    player.currentCh = ch;
    player.currentV = n;
    const playBtn = document.querySelector(`.verse[data-v="${n}"][data-ch="${ch}"] .verse-play`);
    if (playBtn) playBtn.classList.add("loading");
    const reciter = prefs.get("reciter", "ashiq");
    const resolved = await resolveAudioUrl(ch, n, reciter);
    if (token !== playToken) {
      if (resolved.objectUrl) URL.revokeObjectURL(resolved.url);
      if (playBtn) playBtn.classList.remove("loading");
      return;
    }
    const audio = new Audio(resolved.url);
    player.audio = audio;
    player.objectUrl = resolved.objectUrl ? resolved.url : null;
    const clearLoading = () => { if (playBtn) playBtn.classList.remove("loading"); };
    audio.addEventListener("waiting", () => highlightVerse(ch, n));
    audio.addEventListener("playing", () => {
      clearLoading();
      player.errorStreak = 0;
      highlightVerse(ch, n);
    });
    // ignore events from an audio element we have already replaced
    const isCurrent = () => player.audio === audio;
    audio.addEventListener("ended", () => {
      if (!isCurrent()) return;
      clearLoading();
      if (player.continuous) advanceContinuous();
      else stopPlayback();
    });
    audio.addEventListener("error", () => {
      if (!isCurrent()) return;
      clearLoading();
      player.errorStreak = (player.errorStreak || 0) + 1;
      if (!player.continuous || !navigator.onLine || player.errorStreak >= 3) {
        stopPlayback();
      } else {
        advanceContinuous();
      }
    });
    audio.play().catch(() => {
      if (!isCurrent()) return;
      clearLoading();
      stopPlayback();
    });
    highlightVerse(ch, n);
  }

  function startContinuous(ch, fromIndex = 0, endIndex = null, partIndex = null) {
    const data = chapterCache[ch];
    if (!data || !data.verses.length) return;
    player.chapter = ch;
    player.verseIndex = fromIndex;
    player.endIndex = endIndex === null ? data.verses.length - 1 : endIndex;
    player.partIndex = partIndex;
    player.repeatLeft = repeats();
    player.errorStreak = 0;
    playVerse(ch, data.verses[fromIndex].n, { continuous: true });
    const btn = document.getElementById("play-chapter-btn");
    if (btn) {
      btn.textContent = "■ Stop";
      btn.classList.replace("btn-play", "btn-stop");
    }
    syncPartPlayButtons();
  }

  function repeats() {
    return parseInt(prefs.get("repeats", "1"), 10) || 1;
  }

  function advanceContinuous() {
    const data = chapterCache[player.chapter];
    if (!data) return stopPlayback();
    const step = () => {
      player.gapTimer = null;
      if (!player.continuous) return;
      if (player.repeatLeft > 1) {
        player.repeatLeft -= 1;
        const cur = data.verses[player.verseIndex];
        if (!cur) return stopPlayback();
        return playVerse(player.chapter, cur.n, { continuous: true });
      }
      player.verseIndex += 1;
      player.repeatLeft = repeats();
      const next = data.verses[player.verseIndex];
      if (!next || player.verseIndex > player.endIndex) return stopPlayback();
      playVerse(player.chapter, next.n, { continuous: true });
    };
    const gap = parseInt(prefs.get("repeatGap", "0"), 10) || 0;
    if (gap > 0) {
      // recite pause: silence after each verse play so you can recite the verse yourself
      player.gapTimer = setTimeout(step, gap * 1000);
      return;
    }
    step();
  }

  // ---------- practice mode (recall masking + letter hints) ----------
  // practice = { on, from, to } — scoped to a verse range (part or chapter)
  let practice = { on: false, from: null, to: null };

  // Reduce each Arabic word to its first letter (with diacritics) + a tatweel,
  // the classic hifz prompt between full text and blank. Verse-end markers
  // (﴿١﴾ etc.) are dropped.
  function firstLettersHint(ar) {
    const isBase = (c) => {
      const x = c.codePointAt(0);
      return (x >= 0x0621 && x <= 0x064a) || (x >= 0x0671 && x <= 0x06d3) || x === 0x0640 || x === 0x066e;
    };
    const isMark = (c) => {
      const x = c.codePointAt(0);
      return (x >= 0x064b && x <= 0x065f) || x === 0x0670 || (x >= 0x06d6 && x <= 0x06ed);
    };
    return ar
      .split(/\s+/)
      .map((word) => {
        let out = "";
        let started = false;
        for (const ch of word) {
          if (!started) {
            if (isBase(ch)) { out += ch; started = true; }
          } else if (isMark(ch)) {
            out += ch;
          } else {
            break;
          }
        }
        return started ? out + "ــ" : "";
      })
      .filter(Boolean)
      .join(" ");
  }

  function buildMaskCover(row, v) {
    const cover = el("div", "ar-mask");
    const hintLevel = prefs.get("hintLevel", "hidden");
    if (hintLevel === "letters") {
      cover.append(el("span", "ar-mask-hint ar", esc(firstLettersHint(v.ar))));
    } else {
      cover.append(el("span", "ar-mask-label", "recite from memory — tap to check"));
    }
    cover.addEventListener("click", () => unmaskVerse(row));
    return cover;
  }

  function maskVerse(row) {
    if (row.classList.contains("masked")) return;
    const v = { ar: row.dataset.ar };
    row.classList.add("masked");
    const ar = row.querySelector(".verse-ar");
    ar.style.position = "relative";
    ar.append(buildMaskCover(row, v));
  }

  function unmaskVerse(row) {
    row.classList.remove("masked");
    row.querySelector(".ar-mask")?.remove();
  }

  function applyPracticeToDom() {
    document.body.classList.toggle("practice", practice.on);
    document.querySelectorAll(".verse").forEach((row) => {
      const n = +row.dataset.v;
      const inRange = practice.on && n >= practice.from && n <= practice.to;
      if (inRange) maskVerse(row);
      else unmaskVerse(row);
    });
    const btn = document.getElementById("practice-btn");
    if (btn) {
      btn.textContent = practice.on ? "✕ Exit practice" : "◔ Practice";
      btn.classList.toggle("btn-ghost", !practice.on);
    }
    const tools = document.getElementById("practice-tools");
    if (tools) tools.classList.toggle("hidden", !practice.on);
  }

  function remaskAll() {
    // Re-mask the whole practice range — including verses the user has
    // revealed, which no longer carry the .masked class.
    document.querySelectorAll(".verse").forEach((row) => {
      const n = +row.dataset.v;
      if (practice.on && n >= practice.from && n <= practice.to) {
        unmaskVerse(row);
        maskVerse(row);
      }
    });
  }

  // ---------- transliteration (transliteration.org, lazy-loaded per chapter) ----------
  const translitCache = {}; // ch -> {byVerse: {n: tl}, missing: bool}
  async function loadTranslit(ch) {
    if (translitCache[ch] && !translitCache[ch].missing) return true;
    if (translitCache[ch]?.missing && !navigator.onLine) return false;
    try {
      const r = await fetch(`data/translit/${ch}.json`);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      const byVerse = {};
      for (const v of d.verses || []) byVerse[v.n] = v.tl;
      translitCache[ch] = { byVerse };
      return true;
    } catch {
      translitCache[ch] = { byVerse: {}, missing: true };
      return false;
    }
  }

  function injectTranslitInDom(ch) {
    const map = translitCache[ch]?.byVerse;
    if (!map) return;
    document.querySelectorAll(`.verse[data-ch="${ch}"]`).forEach((row) => {
      if (row.querySelector(".verse-tl")) return;
      const tl = map[+row.dataset.v];
      if (!tl) return;
      const tlEl = el("div", "verse-tl", esc(tl));
      const arEl = row.querySelector(".verse-ar");
      if (arEl) arEl.after(tlEl);
    });
  }

  // ---------- chapter ↔ verse rules ----------
  // The chapter status and its verse ticks are one state seen from two levels:
  //   Memorised ⟺ every verse ticked · Partial ⟺ some ticked (or a coarse
  //   manual claim) · Not set ⟺ nothing ticked and nothing claimed.
  // Each level moves the other: verse ticks roll the status up; resting the
  // button on Memorised / Not set rolls the ticks to match. Cycling through
  // a status never commits — only stopping on one does.
  let activeChapterRefresh = null;

  function rollupChapterStatus(ch) {
    const meta = surahs.find((s) => s.ch === ch);
    const total = meta ? meta.verses : 0;
    const done = verseStore.count(ch);
    const cur = statusStore.get(ch);
    if (done === total) {
      if (cur !== "done") statusStore.set(ch, "done");
    } else if (done > 0) {
      if (cur !== "partial") statusStore.set(ch, "partial");
    } else if (cur === "partial" || cur === "done") {
      statusStore.set(ch, "");
    }
    syncStatusButtons(ch);
  }

  function applyStatusSideEffects(ch) {
    const meta = surahs.find((s) => s.ch === ch);
    if (!meta) return;
    const st = statusStore.get(ch);
    if (st !== "done" && st !== "") return; // partial/next/later leave the verse ticks alone
    const wantOn = st === "done";
    const all = verseStore.readAllRaw();
    const m = all[ch] || {};
    const t = Date.now();
    let changed = false;
    for (let n = 1; n <= meta.verses; n++) {
      const on = m[n] !== undefined && m[n] >= 0;
      if (on !== wantOn) { m[n] = wantOn ? t : -t; changed = true; }
    }
    if (!changed) return;
    if (Object.keys(m).length) all[ch] = m; else delete all[ch];
    verseStore.writeAllRaw(all);
    syncStatusButtons(ch);
    if (currentChapter === ch && activeChapterRefresh) {
      activeChapterRefresh();
    }
  }

  const statusSideEffectTimers = new Map(); // per chapter, so rapid cycling on one never cancels another
  function scheduleStatusSideEffects(ch) {
    clearTimeout(statusSideEffectTimers.get(ch));
    statusSideEffectTimers.set(ch, setTimeout(() => {
      statusSideEffectTimers.delete(ch);
      applyStatusSideEffects(ch);
    }, 800));
  }

  // ---------- shared components ----------
  function statusButton(ch) {
    const cur = statusStore.get(ch);
    const info = statusInfo(cur);
    const btn = el("button", "status-btn");
    btn.dataset.status = cur;
    btn.innerHTML = `<span class="dot"></span>${esc(info.label)}`;
    btn.title = "Cycle: Not set → Memorised → Partial → Next → Later";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = statusStore.cycle(ch);
      btn.dataset.status = next;
      btn.innerHTML = `<span class="dot"></span>${esc(statusInfo(next).label)}`;
      const card = document.querySelector(`.card[data-ch="${ch}"]`);
      if (card) card.dataset.status = next;
      scheduleStatusSideEffects(ch);
    });
    return btn;
  }

  function renderChips() {
    const holder = document.getElementById("progress-chips");
    if (!holder) return;
    const map = statusStore.read();
    const counts = { done: 0, partial: 0, next: 0, later: 0 };
    let vDone = 0, vPartial = 0, vNext = 0, vLater = 0;
    for (const s of surahs) {
      const st = map[s.ch];
      const ticked = verseStore.count(s.ch);
      vDone += st === "done" ? s.verses : ticked;
      if (st && counts[st] !== undefined) {
        counts[st]++;
        if (st === "partial") vPartial += Math.max(0, s.verses - ticked) || s.verses;
        if (st === "next") vNext += s.verses;
        if (st === "later") vLater += s.verses;
      }
    }
    const totalV = surahs.reduce((a, s) => a + s.verses, 0);
    holder.innerHTML = `
      <span class="chip"><span class="dot" style="background:var(--green)"></span>Memorised ${counts.done}/114 · ${vDone.toLocaleString()} verses</span>
      <span class="chip"><span class="dot" style="background:var(--pink)"></span>Partial ${counts.partial} · ${vPartial.toLocaleString()} v</span>
      <span class="chip"><span class="dot" style="background:var(--orange)"></span>Next ${counts.next} · ${vNext.toLocaleString()} v</span>
      <span class="chip"><span class="dot" style="background:var(--blue)"></span>Later ${counts.later} · ${vLater.toLocaleString()} v</span>
      <span class="chip">${totalV.toLocaleString()} verses total</span>`;
  }

  // ---------- views ----------
  function renderGrid(restoreScrollY) {
    stopPlayback();
    activeChapterRefresh = null;
    const view = document.getElementById("view");
    view.innerHTML = "";

    const filterRow = el("div", "filter-row");
    const mkFilter = (id, label, dot) => {
      const b = el("button", "filter-btn" + (filter === id ? " active" : ""));
      b.innerHTML = (dot ? `<span class="dot" style="background:${dot}"></span>` : "") + esc(label);
      b.addEventListener("click", () => { filter = id; renderGrid(); });
      return b;
    };
    filterRow.append(
      el("span", "label", "Show:"),
      mkFilter("all", "All 114"),
      mkFilter("done", "Memorised", "var(--green)"),
      mkFilter("partial", "Partial", "var(--pink)"),
      mkFilter("next", "Next", "var(--orange)"),
      mkFilter("later", "Later", "var(--blue)"),
      mkFilter("unset", "Not set")
    );
    view.append(filterRow);

    const grid = el("div", "grid");
    const map = statusStore.read();
    const visible = surahs.filter((s) => {
      if (filter === "all") return true;
      if (filter === "unset") return !map[s.ch];
      return map[s.ch] === filter;
    });
    if (!visible.length) {
      view.append(el("div", "loading-note", "No chapters in this view yet — use the coloured button on a chapter card to set its status."));
      return;
    }
    for (const s of visible) {
      const ticked = verseStore.count(s.ch);
      const card = el("div", "card");
      card.dataset.ch = s.ch;
      card.dataset.status = map[s.ch] || "";
      card.setAttribute("role", "link");
      card.tabIndex = 0;
      card.innerHTML = `
        <div class="card-top">
          <span class="surah-num">${s.ch}</span>
          <span class="surah-ar">${esc(s.ar)}</span>
        </div>
        <div>
          <div class="surah-name">${esc(s.name)}</div>
          <div class="surah-meta">${s.verses} verses${ticked ? ` · <span class="meta-ticked">${ticked}✓</span>` : ""}</div>
        </div>`;
      card.append(statusButton(s.ch));
      const open = () => { location.hash = `#/ch/${s.ch}`; };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
      grid.append(card);
    }
    view.append(grid);
    renderChips();
    // returning from a chapter restores where you were; fresh views start at the top
    window.scrollTo({ top: typeof restoreScrollY === "number" ? restoreScrollY : 0, behavior: "instant" });
  }

  // ---------- about page ----------
  function renderAbout() {
    stopPlayback();
    activeChapterRefresh = null;
    const view = document.getElementById("view");
    view.innerHTML = "";

    const crumb = el("a", "crumb", "← All chapters");
    crumb.href = "#/";
    view.append(crumb);

    const reciters = Object.values(RECITERS).join(", ");
    const wrap = el("div", "about");
    wrap.innerHTML = `
      <h1 class="about-title">Quran Memoriser</h1>
      <p class="about-lede">A quiet companion for memorising the Quran: all 114 chapters with
      Arabic text, the English translation of Maulawi Sher Ali, per-verse recitation, and
      word-by-word meanings. Everything runs in your browser — no accounts, no servers — and
      once the app has loaded it works entirely offline.</p>

      <section>
        <h2>Tracking</h2>
        <p>Every chapter carries a status button that cycles
        <b style="color:var(--green)">Memorised</b> →
        <b style="color:var(--pink)">Partial</b> →
        <b style="color:var(--orange)">Next</b> →
        <b style="color:var(--blue)">Later</b> → not set.
        Track at whatever granularity suits you: whole chapters, or verse by verse with the ✓
        on each verse. Long chapters are split into <b>parts</b> of about 150 Arabic words —
        roughly half a mushaf page, one memorisation sitting — with their own tick and player.</p>
        <p>Progress joins up on its own, from either level: tick every verse
        of a part and the part completes; complete every part and the chapter
        turns Memorised. Or mark the chapter Memorised directly and every
        verse ticks itself. Unticking walks it all back the same way — your
        last untick returns the chapter to Not set.</p>
      </section>

      <section>
        <h2>Practice mode</h2>
        <p>The ◔ Practice button hides the Arabic behind tap-to-reveal masks so you recite from
        memory and check yourself. Choose a fully blank prompt or the classic hifz prompt — the
        first letters of every word — and drill a single part or the whole chapter. Combined with
        Repeat ×N and the Recite pause, the player becomes a listen-and-repeat exercise: hear the
        verse, recite into the silence, hear it again.</p>
      </section>

      <section>
        <h2>Audio</h2>
        <p>Verse-by-verse recitation by ${esc(reciters)}, streamed from files.alislam.cloud.
        The ⤓ Offline audio panel can store any reciter (about 1.5&nbsp;GB) on the device so it
        plays without a connection; anything not downloaded still streams on demand.</p>
      </section>

      <section>
        <h2>Install it on your phone</h2>
        <p>Open the site in your browser and add it to your home screen —
        <b>Android (Chrome):</b> menu → Add to Home screen;
        <b>iPhone/iPad (Safari):</b> Share → Add to Home Screen.
        The app then precaches its shell, all 114 chapters and the Arabic font, and runs offline
        from its own icon.</p>
      </section>

      <section>
        <h2>Backup &amp; transfer</h2>
        <p>Your progress never leaves the device it was made on unless you move it. The ⇪ Backup
        button exports a snapshot you can share as a file, copy to the clipboard, or paste back
        in on another device. Importing merges: the newer state of each chapter and verse wins.</p>
      </section>

      <section>
        <h2>Sources &amp; credits</h2>
        <ul>
          <li>Arabic text and the English translation (Maulawi Sher Ali) — alislam.org's Quran
          app, served via its data API</li>
          <li>Recitation audio — files.alislam.cloud (Ahmadiyya Muslim Community)</li>
          <li>Latin transliteration, shown for the short surahs — transliteration.org</li>
          <li>Manzoor Naskh Arabic font — alislam.org's Quran app assets</li>
        </ul>
        <p class="note">Verse numbering follows alislam.org's Quran — 6,348 verses, where the
        Bismillah is verse 1 of every chapter except At-Tawbah (so Al-Baqarah has 287 verses).
        This matches the recitation audio exactly.</p>
      </section>`;

    view.append(wrap);
    renderChips();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function renderChapter(ch) {
    const view = document.getElementById("view");
    const meta = surahs.find((s) => s.ch === ch);
    if (!meta) { location.hash = "#/"; return; }

    view.innerHTML = `<div class="loading-note">Loading Surah ${ch}…</div>`;

    let data = chapterCache[ch];
    if (!data) {
      try {
        const r = await fetch(`data/chapters/${ch}.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        data = await r.json();
        chapterCache[ch] = data;
      } catch (e) {
        view.innerHTML = `
          <a class="crumb" href="#/">← All chapters</a>
          <div class="error-note">
            Could not load chapter data (${esc(e.message)}).<br/>
            If data files are still downloading, run <code>python3 download-data.py</code> in the app folder and refresh.
          </div>`;
        return;
      }
    }

    stopPlayback();
    view.innerHTML = "";

    const crumb = el("a", "crumb", "← All chapters");
    crumb.href = "#/";
    view.append(crumb);

    const head = el("div", "chapter-head");
    head.dataset.ch = ch;
    const titleRow = el("div", "chapter-title-row");
    const title = el("div", "chapter-title",
      `<span class="en">${ch}. ${esc(meta.name)}</span><span class="ar">${esc(meta.ar)}</span>`);
    const statusCol = el("div");
    statusCol.append(statusButton(ch));
    titleRow.append(title, statusCol);

    const totalVerses = data.verses.length;
    const chapterMetaEl = el("div", "chapter-meta", "");
    const refreshChapterMeta = () => {
      const done = verseStore.count(ch);
      chapterMetaEl.innerHTML =
        `${meta.verses} verses · alislam.org numbering (verse 1 is the Bismillah where applicable)` +
        (done > 0 ? ` · <b class="verse-progress">${done}/${totalVerses} verses memorised</b>` : "");
    };
    refreshChapterMeta();
    head.append(titleRow, chapterMetaEl);

    const controls = el("div", "controls");

    const reciterLabel = el("label", null, "Reciter ");
    const reciterSel = el("select");
    for (const [id, name] of Object.entries(RECITERS)) {
      const o = el("option", null, esc(name));
      o.value = id;
      reciterSel.append(o);
    }
    reciterSel.value = prefs.get("reciter", "ashiq");
    reciterSel.addEventListener("change", () => { prefs.set("reciter", reciterSel.value); stopPlayback(); });
    reciterLabel.append(reciterSel);

    const repeatLabel = el("label", null, "Repeat each verse ");
    const repeatSel = el("select");
    for (const r of [1, 2, 3, 5]) {
      const o = el("option", null, `${r}×`);
      o.value = r;
      repeatSel.append(o);
    }
    repeatSel.value = prefs.get("repeats", "1");
    repeatSel.addEventListener("change", () => { prefs.set("repeats", repeatSel.value); player.repeatLeft = parseInt(repeatSel.value, 10); });
    repeatLabel.append(repeatSel);

    const gapLabel = el("label", null, "Recite pause ");
    const gapSel = el("select");
    for (const g of [0, 2, 4, 6, 10]) {
      const o = el("option", null, g === 0 ? "off" : g + "s");
      o.value = g;
      gapSel.append(o);
    }
    gapSel.value = prefs.get("repeatGap", "0");
    gapSel.addEventListener("change", () => prefs.set("repeatGap", gapSel.value));
    gapLabel.append(gapSel);

    const playBtn = el("button", "btn btn-play", "▶ Play chapter");
    playBtn.id = "play-chapter-btn";
    playBtn.addEventListener("click", () => {
      if (player.continuous) stopPlayback();
      else startContinuous(ch);
    });

    const wordsBtn = el("button", "btn btn-ghost" + (document.body.classList.contains("show-words") ? " on" : ""), "Word meanings");
    wordsBtn.addEventListener("click", () => {
      document.body.classList.toggle("show-words");
      wordsBtn.classList.toggle("on", document.body.classList.contains("show-words"));
    });

    // Latin transliteration (transliteration.org; covers the short surahs)
    const translitBtn = el("button", "btn btn-ghost" + (document.body.classList.contains("show-translit") ? " on" : ""), "Transliteration");
    if (document.body.classList.contains("show-translit") && translitCache[ch]?.missing) translitBtn.textContent = "Unavailable";
    translitBtn.title = "Latin transliteration (transliteration.org) — available for the short surahs";
    translitBtn.addEventListener("click", async () => {
      document.body.classList.toggle("show-translit");
      const on = document.body.classList.contains("show-translit");
      translitBtn.classList.toggle("on", on);
      if (on) {
        const ok = await loadTranslit(ch);
        if (!ok) {
          translitBtn.textContent = "Unavailable";
        } else {
          translitBtn.textContent = "Transliteration";
          injectTranslitInDom(ch);
        }
      } else {
        translitBtn.textContent = "Transliteration";
      }
    });
    if (document.body.classList.contains("show-translit") && !translitCache[ch]) {
      loadTranslit(ch).then((ok) => {
        if (currentChapter !== ch) return;
        if (!ok) translitBtn.textContent = "Unavailable";
        else injectTranslitInDom(ch);
      });
    }

    // practice: hide the Arabic so you recite from memory, then tap to check
    practice = { on: false, from: null, to: null };
    const practiceBtn = el("button", "btn btn-ghost", "◔ Practice");
    practiceBtn.id = "practice-btn";
    practiceBtn.addEventListener("click", () => {
      practice = practice.on
        ? { on: false, from: null, to: null }
        : { on: true, from: data.verses[0].n, to: data.verses[data.verses.length - 1].n };
      applyPracticeToDom();
    });

    const practiceTools = el("div", "practice-tools hidden");
    practiceTools.id = "practice-tools";
    const hintLabel = el("span", "label", "Prompt:");
    const mkHint = (id, label) => {
      const b = el("button", "filter-btn" + (prefs.get("hintLevel", "hidden") === id ? " active" : ""), label);
      b.addEventListener("click", () => {
        prefs.set("hintLevel", id);
        practiceTools.querySelectorAll(".filter-btn[data-hint]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        remaskAll();
      });
      b.dataset.hint = id;
      return b;
    };
    const resetMasks = el("button", "filter-btn", "Reset masks");
    resetMasks.addEventListener("click", remaskAll);
    practiceTools.append(hintLabel, mkHint("hidden", "Blank"), mkHint("letters", "First letters"), resetMasks);

    controls.append(reciterLabel, repeatLabel, gapLabel, playBtn, wordsBtn, translitBtn, practiceBtn);
    head.append(controls, practiceTools);

    // Memorisation parts (long surahs only): a strip of chips plus a tick per part.
    // Display state always derives from verse ticks so parts and verses agree.
    const parts = computeParts(data.verses);
    const partVerseCount = (p) => p.end - p.start + 1;
    const partComplete = (p) => {
      const m = verseStore.read(ch);
      for (let i = p.start; i <= p.end; i++) if (!m[data.verses[i].n]) return false;
      return true;
    };
    let strip = null;
    let partProgress = null;
    if (parts.length) {
      const stripWrap = el("div", "parts-wrap");
      const doneCount = parts.filter((p) => partComplete(p)).length;
      partProgress = el("div", "parts-progress",
        `Memorisation parts: <b>${doneCount}/${parts.length}</b> done · ~${PART_TARGET_WORDS} words each`);
      strip = el("div", "parts-strip");
      for (const p of parts) {
        const chip = el("button", "part-chip" + (partComplete(p) ? " done" : ""),
          `${partComplete(p) ? "✓ " : ""}${p.from}–${p.to}`);
        chip.title = `Part ${p.i + 1}: verses ${ch}:${p.from}–${p.to} · ${p.words} words`;
        chip.dataset.part = p.i;
        chip.addEventListener("click", () => {
          const header = document.querySelector(`.part-header[data-part="${p.i}"]`);
          if (header) header.scrollIntoView({ block: "start", behavior: "smooth" });
        });
        strip.append(chip);
      }
      stripWrap.append(partProgress, strip);
      head.append(stripWrap);
    }
    view.append(head);

    const headerAt = {};
    for (const p of parts) headerAt[p.start] = p;

    // ---- verse/part/chapter roll-up machinery ----
    const partOfVerse = {};
    for (const p of parts) {
      for (let i = p.start; i <= p.end; i++) partOfVerse[data.verses[i].n] = p;
    }
    const setVerseRowUi = (row, on) => {
      row.classList.toggle("memorised", on);
      const t = row.querySelector(".verse-tick");
      if (t) {
        t.classList.toggle("on", on);
        t.title = on ? "Memorised — click to clear" : "Mark this verse memorised";
      }
    };
    const refreshPartUi = (p) => {
      const m = verseStore.read(ch);
      let done = 0;
      for (let i = p.start; i <= p.end; i++) if (m[data.verses[i].n]) done++;
      const on = done === partVerseCount(p);
      const ph = view.querySelector(`.part-header[data-part="${p.i}"]`);
      if (ph) {
        const tickBtn = ph.querySelector(".part-tick");
        tickBtn.classList.toggle("on", on);
        tickBtn.textContent = on ? "✓ Memorised" : "Mark memorised";
        const countEl = ph.querySelector(".part-verse-count");
        if (countEl) countEl.textContent = `${done}/${partVerseCount(p)} verses ✓`;
      }
      if (strip) {
        const chip = strip.querySelector(`.part-chip[data-part="${p.i}"]`);
        if (chip) {
          chip.classList.toggle("done", on);
          chip.textContent = `${on ? "✓ " : ""}${p.from}–${p.to}`;
        }
      }
      if (partProgress) {
        const dn = parts.filter((q) => partComplete(q)).length;
        partProgress.innerHTML = `Memorisation parts: <b>${dn}/${parts.length}</b> done · ~${PART_TARGET_WORDS} words each`;
      }
    };
    const applyChapterRollup = () => {
      rollupChapterStatus(ch);
      refreshChapterMeta();
    };
    const toggleVerseMemorised = (v, row) => {
      const on = !verseStore.get(ch, v.n);
      verseStore.set(ch, v.n, on);
      setVerseRowUi(row, on);
      const p = partOfVerse[v.n];
      if (p) refreshPartUi(p);
      applyChapterRollup();
    };

    activeChapterRefresh = () => {
      const m = verseStore.read(ch);
      view.querySelectorAll(".verse").forEach((r) => {
        setVerseRowUi(r, !!m[+r.dataset.v]);
      });
      for (const p of parts) refreshPartUi(p);
      refreshChapterMeta();
    };

    for (let idx = 0; idx < data.verses.length; idx++) {
      const v = data.verses[idx];
      const p = headerAt[idx];
      if (p) {
        const ph = el("div", "part-header");
        ph.dataset.part = p.i;
        const initialDone = data.verses.slice(p.start, p.end + 1).filter((q) => verseStore.get(ch, q.n)).length;
        const label = el("div", "part-label",
          `<span class="part-no">Part ${p.i + 1} of ${parts.length}</span>
           <span class="part-range">verses ${ch}:${p.from}–${p.to}</span>
           <span class="part-words">${p.words} words</span>
           <span class="part-verse-count part-words">${initialDone}/${partVerseCount(p)} verses ✓</span>`);
        const actions = el("div", "part-actions");
        const tick = el("button", "part-tick" + (partComplete(p) ? " on" : ""),
          partComplete(p) ? "✓ Memorised" : "Mark memorised");
        tick.addEventListener("click", () => {
          // ticking a part ticks every verse inside it (and vice versa)
          const targetOn = !partComplete(p);
          for (let i = p.start; i <= p.end; i++) {
            const vv = data.verses[i];
            verseStore.set(ch, vv.n, targetOn);
            const r = view.querySelector(`.verse[data-v="${vv.n}"]`);
            if (r) setVerseRowUi(r, targetOn);
          }
          refreshPartUi(p);
          applyChapterRollup();
        });
        const playPart = el("button", "part-play", "▶ Play part");
        playPart.dataset.partPlay = p.i;
        playPart.addEventListener("click", () => {
          if (player.continuous && player.partIndex === p.i && player.chapter === ch) {
            stopPlayback();
            return;
          }
          startContinuous(ch, p.start, p.end, p.i);
        });
        const practicePart = el("button", "part-play", "◔ Practice part");
        practicePart.addEventListener("click", () => {
          practice = { on: true, from: p.from, to: p.to };
          applyPracticeToDom();
          ph.scrollIntoView({ block: "start", behavior: "smooth" });
        });
        actions.append(tick, playPart, practicePart);
        ph.append(label, actions);
        view.append(ph);
      }

      const row = el("div", "verse");
      row.dataset.v = v.n;
      row.dataset.ch = ch;
      row.dataset.ar = v.ar;
      if (verseStore.get(ch, v.n)) row.classList.add("memorised");

      const top = el("div", "verse-top");
      const tickBtn = el("button", "verse-tick" + (verseStore.get(ch, v.n) ? " on" : ""), "✓");
      tickBtn.title = verseStore.get(ch, v.n) ? "Memorised — click to clear" : "Mark this verse memorised";
      tickBtn.addEventListener("click", () => toggleVerseMemorised(v, row));

      const play = el("button", "verse-play", "▶");
      play.title = `Play ${ch}:${v.n}`;
      play.addEventListener("click", () => {
        if ((player.audio || player.gapTimer) && player.currentCh === ch && player.currentV === v.n) {
          stopPlayback();
          return;
        }
        // a single-verse drill session: honours Repeat ×N and the recite pause
        startContinuous(ch, idx, idx, null);
      });
      top.append(play, tickBtn, el("span", "verse-ref", `${ch}:${v.n}`));
      row.append(top);

      row.append(el("div", "verse-ar", esc(v.ar)));
      const tl = translitCache[ch]?.byVerse?.[v.n];
      if (tl) row.append(el("div", "verse-tl", esc(tl)));
      row.append(el("div", "verse-en", v.en ? rich(v.en) : "—"));
      const words = (v.w || []).filter(Boolean);
      if (words.length) row.append(el("div", "verse-words", esc(words.join(" · "))));
      view.append(row);
    }
    // re-entering a chapter returns to where you left it
    window.scrollTo({ top: chapterScrollY[ch] || 0, behavior: "instant" });
    renderChips();
  }

  // ---------- router ----------
  let gridScrollY = 0;          // grid scroll to restore when returning from a chapter
  let chapterScrollY = {};      // per-chapter scroll to restore when re-entering
  let viewIsGrid = true;
  let currentChapter = null;

  function route() {
    const m = location.hash.match(/^#\/ch\/(\d+)$/);
    if (m) {
      if (viewIsGrid) gridScrollY = window.scrollY;
      else if (currentChapter != null) chapterScrollY[currentChapter] = window.scrollY;
      viewIsGrid = false;
      currentChapter = parseInt(m[1], 10);
      renderChapter(currentChapter);
    } else if (location.hash === "#/about") {
      if (viewIsGrid) gridScrollY = window.scrollY;
      else if (currentChapter != null) chapterScrollY[currentChapter] = window.scrollY;
      viewIsGrid = false;
      currentChapter = null;
      renderAbout();
    } else {
      if (!viewIsGrid && currentChapter != null) chapterScrollY[currentChapter] = window.scrollY;
      const y = viewIsGrid ? undefined : gridScrollY;
      viewIsGrid = true;
      currentChapter = null;
      renderGrid(y);
    }
  }

  window.addEventListener("hashchange", route);
  window.addEventListener("beforeunload", stopPlayback);

  // ---------- theme (Auto / Light / Night) ----------
  const themeManager = {
    key: "qm.theme.v1",
    modes: ["auto", "light", "dark"],
    labels: { auto: "◐ Auto", light: "☀ Light", dark: "☾ Night" },
    get() {
      const m = localStorage.getItem(this.key);
      return this.modes.includes(m) ? m : "auto";
    },
    resolved() {
      const mode = this.get();
      return mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark" : "light";
    },
    apply() {
      const dark = this.resolved() === "dark";
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = dark ? "#201b16" : "#f9f3e1";
      const btn = document.getElementById("theme-btn");
      if (btn) btn.textContent = this.labels[this.get()];
    },
    cycle() {
      const order = this.modes;
      localStorage.setItem(this.key, order[(order.indexOf(this.get()) + 1) % order.length]);
      this.apply();
    },
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => themeManager.apply());

  // ---------- boot ----------
  themeManager.apply();
  document.getElementById("theme-btn")?.addEventListener("click", () => themeManager.cycle());
  document.getElementById("export-btn")?.addEventListener("click", renderExportPanel);
  const offlineBtn = document.getElementById("offline-audio-btn");
  if (offlineBtn) offlineBtn.addEventListener("click", renderOfflinePanel);
  window.__qm = { statusStore, verseStore, snapshots }; // debug/verification hook

  // Service worker makes the app installable and fully offline (needs a
  // secure context: https or localhost — silently skipped on plain LAN IPs).
  if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  fetch("data/surahs.json")
    .then((r) => r.json())
    .then((list) => {
      surahs = list;
      renderChips();
      route();
    })
    .catch(() => {
      document.getElementById("view").innerHTML =
        '<div class="error-note">Could not load <code>data/surahs.json</code>.</div>';
    });
})();
