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
    repeatLeft: 0,
    continuous: false,
    currentCh: null,
    currentV: null,
    objectUrl: null,
  };

  const statusStore = {
    key: "qm.status.v1",
    read() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } },
    write(m) { localStorage.setItem(this.key, JSON.stringify(m)); renderChips(); },
    get(ch) { return this.read()[ch] || ""; },
    cycle(ch) {
      const map = this.read();
      const order = ["", "done", "partial", "next", "later"];
      map[ch] = order[(order.indexOf(map[ch] || "") + 1) % order.length];
      if (!map[ch]) delete map[ch];
      this.write(map);
      return map[ch] || "";
    },
    set(ch, val) {
      const map = this.read();
      if (val) map[ch] = val; else delete map[ch];
      this.write(map);
    },
  };

  const prefs = {
    key: "qm.prefs.v1",
    read() {
      try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; }
    },
    write(p) { localStorage.setItem(this.key, JSON.stringify(p)); },
    get(k, d) { return this.read()[k] ?? d; },
    set(k, v) { const p = this.read(); p[k] = v; this.write(p); },
  };

  // Per-part "memorised" ticks inside long surahs, e.g. { "2": { "3": true } }
  const partStore = {
    key: "qm.parts.v1",
    read(ch) {
      try { return (JSON.parse(localStorage.getItem(this.key)) || {})[ch] || {}; } catch { return {}; }
    },
    write(ch, m) {
      let all = {};
      try { all = JSON.parse(localStorage.getItem(this.key)) || {}; } catch {}
      if (Object.keys(m).length) all[ch] = m; else delete all[ch];
      localStorage.setItem(this.key, JSON.stringify(all));
    },
    toggle(ch, idx) {
      const m = this.read(ch);
      if (m[idx]) delete m[idx]; else m[idx] = true;
      this.write(ch, m);
      return !!m[idx];
    },
    set(ch, idx, on) {
      const m = this.read(ch);
      if (on) m[idx] = true; else delete m[idx];
      this.write(ch, m);
      return on;
    },
  };

  // Per-verse memorisation ticks, e.g. { "2": { "1": true } }
  const verseStore = {
    key: "qm.verses.v1",
    read(ch) {
      try { return (JSON.parse(localStorage.getItem(this.key)) || {})[ch] || {}; } catch { return {}; }
    },
    write(ch, m) {
      let all = {};
      try { all = JSON.parse(localStorage.getItem(this.key)) || {}; } catch {}
      if (Object.keys(m).length) all[ch] = m; else delete all[ch];
      localStorage.setItem(this.key, JSON.stringify(all));
    },
    get(ch, v) { return !!this.read(ch)[v]; },
    set(ch, v, on) {
      const m = this.read(ch);
      if (on) m[v] = true; else delete m[v];
      this.write(ch, m);
    },
    count(ch) { return Object.keys(this.read(ch)).length; },
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
  let downloadJobs = {}; // reciter -> { cancelled, done, failed, bytes, previously, total }
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
    if (downloadJobs[reciter]) return;
    try { await navigator.storage?.persist?.(); } catch {}
    const job = { cancelled: false, done: 0, failed: 0, bytes: 0, previously: 0, total: 0 };
    downloadJobs[reciter] = job;
    try {
      const cache = await caches.open(cacheName(reciter));
      const urls = allVerseUrls(reciter);
      job.total = urls.length;
      const missing = [];
      for (const u of urls) {
        if (await cache.match(u)) job.previously++;
        else missing.push(u);
      }
      let idx = 0;
      const CONCURRENCY = 4;
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (!job.cancelled && idx < missing.length) {
          const u = missing[idx++];
          try {
            const r = await fetch(u);
            if (!r.ok) throw new Error("HTTP " + r.status);
            job.bytes += parseInt(r.headers.get("content-length") || "0", 10);
            await cache.put(u, r);
            job.done++;
          } catch { job.failed++; }
          rowUpdate(job);
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
    rowUpdate(job, true);
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
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
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

    const state = audioState.read();
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
        actions.innerHTML = "";
        const st = audioState.read()[id];
        fill.style.width = "0%";
        bar.style.display = "none";
        if (job && !finished) {
          const doneAll = job.previously + job.done;
          status.textContent = `Downloading… ${doneAll.toLocaleString()} / ${job.total.toLocaleString()} (${fmtPct(doneAll, job.total)})${job.failed ? " · " + job.failed + " failed" : ""}`;
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
    document.querySelectorAll(`.card[data-ch="${ch}"] .status-btn, .chapter-head[data-ch="${ch}"] .status-btn`)
      .forEach((b) => {
        b.dataset.status = st;
        b.innerHTML = `<span class="dot"></span>${esc(info.label)}`;
      });
    document.querySelectorAll(`.card[data-ch="${ch}"]`).forEach((c) => (c.dataset.status = st));
    renderChips();
  }

  // ---------- audio ----------
  function detachAudio() {
    if (player.objectUrl) {
      URL.revokeObjectURL(player.objectUrl);
      player.objectUrl = null;
    }
    if (player.audio) {
      player.audio.pause();
      player.audio = null;
    }
  }

  function stopPlayback() {
    detachAudio();
    player.continuous = false;
    player.chapter = null;
    player.verseIndex = -1;
    player.endIndex = -1;
    player.currentCh = null;
    player.currentV = null;
    document.querySelectorAll(".verse.playing").forEach((n) => n.classList.remove("playing"));
    const btn = document.getElementById("play-chapter-btn");
    if (btn) {
      btn.textContent = "▶ Play chapter";
      btn.classList.replace("btn-stop", "btn-play");
    }
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
    const token = ++playToken;
    const reciter = prefs.get("reciter", "ashiq");
    const resolved = await resolveAudioUrl(ch, n, reciter);
    if (token !== playToken) {
      if (resolved.objectUrl) URL.revokeObjectURL(resolved.url);
      return;
    }
    const audio = new Audio(resolved.url);
    player.audio = audio;
    player.objectUrl = resolved.objectUrl ? resolved.url : null;
    player.continuous = continuous;
    player.currentCh = ch;
    player.currentV = n;
    audio.addEventListener("waiting", () => highlightVerse(ch, n));
    audio.addEventListener("playing", () => highlightVerse(ch, n));
    // ignore events from an audio element we have already replaced
    const isCurrent = () => player.audio === audio;
    audio.addEventListener("ended", () => {
      if (!isCurrent()) return;
      if (player.continuous) advanceContinuous();
      else stopPlayback();
    });
    audio.addEventListener("error", () => {
      if (!isCurrent()) return;
      if (player.continuous) advanceContinuous();
      else stopPlayback();
    });
    audio.play().catch(() => {});
    highlightVerse(ch, n);
  }

  function startContinuous(ch, fromIndex = 0, endIndex = null) {
    const data = chapterCache[ch];
    if (!data || !data.verses.length) return;
    player.chapter = ch;
    player.verseIndex = fromIndex;
    player.endIndex = endIndex === null ? data.verses.length - 1 : endIndex;
    player.repeatLeft = repeats();
    playVerse(ch, data.verses[fromIndex].n, { continuous: true });
    const btn = document.getElementById("play-chapter-btn");
    if (btn) {
      btn.textContent = "■ Stop";
      btn.classList.replace("btn-play", "btn-stop");
    }
  }

  function repeats() {
    return parseInt(prefs.get("repeats", "1"), 10) || 1;
  }

  function advanceContinuous() {
    const data = chapterCache[player.chapter];
    if (!data) return stopPlayback();
    if (player.repeatLeft > 1) {
      player.repeatLeft -= 1;
      const cur = data.verses[player.verseIndex];
      if (cur) return playVerse(player.chapter, cur.n, { continuous: true });
    }
    player.verseIndex += 1;
    player.repeatLeft = repeats();
    const next = data.verses[player.verseIndex];
    if (!next || player.verseIndex > player.endIndex) return stopPlayback();
    playVerse(player.chapter, next.n, { continuous: true });
  }

  // ---------- shared components ----------
  function statusButton(ch, { small = false } = {}) {
    const cur = statusStore.get(ch);
    const info = statusInfo(cur);
    const btn = el("button", "status-btn" + (small ? " small" : ""));
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
    });
    return btn;
  }

  function renderChips() {
    const holder = document.getElementById("progress-chips");
    const map = statusStore.read();
    const counts = { done: 0, partial: 0, next: 0, later: 0 };
    let vDone = 0, vPartial = 0, vNext = 0, vLater = 0;
    for (const s of surahs) {
      const st = map[s.ch];
      if (st && counts[st] !== undefined) {
        counts[st]++;
        if (st === "done") vDone += s.verses;
        if (st === "partial") vPartial += s.verses;
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
  function renderGrid() {
    stopPlayback();
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

    controls.append(reciterLabel, repeatLabel, playBtn, wordsBtn);
    head.append(controls);

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
      const done = data.verses.slice(p.start, p.end + 1).filter((v) => verseStore.get(ch, v.n)).length;
      const on = done === partVerseCount(p);
      partStore.set(ch, p.i, on);
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
        const fresh = partStore.read(ch);
        const dn = parts.filter((q) => fresh[q.i]).length;
        partProgress.innerHTML = `Memorisation parts: <b>${dn}/${parts.length}</b> done · ~${PART_TARGET_WORDS} words each`;
      }
    };
    const applyChapterRollup = () => {
      const done = verseStore.count(ch);
      const cur = statusStore.get(ch);
      if (done === totalVerses) {
        if (cur !== "done") statusStore.set(ch, "done");
      } else if (cur === "done") {
        statusStore.set(ch, "partial");
      }
      syncStatusButtons(ch);
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
        playPart.addEventListener("click", () => {
          if (player.continuous && player.verseIndex >= p.start && player.verseIndex <= p.end && player.chapter === ch) {
            stopPlayback();
            return;
          }
          startContinuous(ch, p.start, p.end);
        });
        actions.append(tick, playPart);
        ph.append(label, actions);
        view.append(ph);
      }

      const row = el("div", "verse");
      row.dataset.v = v.n;
      row.dataset.ch = ch;
      if (verseStore.get(ch, v.n)) row.classList.add("memorised");

      const top = el("div", "verse-top");
      const tickBtn = el("button", "verse-tick" + (verseStore.get(ch, v.n) ? " on" : ""), "✓");
      tickBtn.title = verseStore.get(ch, v.n) ? "Memorised — click to clear" : "Mark this verse memorised";
      tickBtn.addEventListener("click", () => toggleVerseMemorised(v, row));

      const play = el("button", "verse-play", "▶");
      play.title = `Play ${ch}:${v.n}`;
      play.addEventListener("click", () => {
        if (player.audio && player.currentCh === ch && player.currentV === v) {
          stopPlayback();
          return;
        }
        playVerse(ch, v.n);
        play.classList.add("loading");
        const clear = () => play.classList.remove("loading");
        if (player.audio) { player.audio.addEventListener("playing", clear, { once: true }); player.audio.addEventListener("error", clear, { once: true }); }
      });
      top.append(play, tickBtn, el("span", "verse-ref", `${ch}:${v.n}`));
      row.append(top);

      row.append(el("div", "verse-ar", esc(v.ar)));
      row.append(el("div", "verse-en", v.en ? rich(v.en) : "—"));
      const words = (v.w || []).filter(Boolean);
      if (words.length) row.append(el("div", "verse-words", esc(words.join(" · "))));
      view.append(row);
    }
    renderChips();
  }

  // ---------- router ----------
  function route() {
    const m = location.hash.match(/^#\/ch\/(\d+)$/);
    if (m) renderChapter(parseInt(m[1], 10));
    else renderGrid();
  }

  window.addEventListener("hashchange", route);
  window.addEventListener("beforeunload", stopPlayback);

  // ---------- boot ----------
  const offlineBtn = document.getElementById("offline-audio-btn");
  if (offlineBtn) offlineBtn.addEventListener("click", renderOfflinePanel);
  window.__qm = { resolveAudioUrl }; // small debug/verification hook

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
