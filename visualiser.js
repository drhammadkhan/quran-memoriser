/* 3D Quran Cosmos Visualiser (visualiser.js)
 * Renders all 114 chapters and 6,348 verses in an interactive 3D environment
 * with Platonic/Archimedean polyhedra, dynamic sizing, status colours,
 * orbital physics, and per-verse audio/memorisation exploration.
 */
(() => {
  "use strict";

  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };

  function buildMesh(rawVerts, faces) {
    const verts = rawVerts.map(norm);
    const edgeSet = new Set();
    const edges = [];
    const addEdge = (a, b) => {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!edgeSet.has(k)) { edgeSet.add(k); edges.push([a, b]); }
    };
    const faceData = faces.map((f) => {
      for (let i = 0; i < f.length; i++) addEdge(f[i], f[(i + 1) % f.length]);
      const v0 = verts[f[0]], v1 = verts[f[1]], v2 = verts[f[2]];
      const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
      const vx = v2[0] - v0[0], vy = v2[1] - v0[1], vz = v2[2] - v0[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const cx = (v0[0] + v1[0] + v2[0]) / 3;
      const cy = (v0[1] + v1[1] + v2[1]) / 3;
      const cz = (v0[2] + v1[2] + v2[2]) / 3;
      const sign = (nx * cx + ny * cy + nz * cz) < 0 ? -1 : 1;
      return { idx: f, normal: norm([nx * sign, ny * sign, nz * sign]) };
    });
    return { verts, edges, faces: faceData };
  }

  const phi = (1 + Math.sqrt(5)) / 2;
  const POLYHEDRA = {
    // Merkaba (Star Tetrahedron: two interlocking tetrahedra) -> Memorised
    done: buildMesh(
      [
        [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1],
        [-1, -1, -1], [-1, 1, 1], [1, -1, 1], [1, 1, -1],
      ],
      [
        [0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2],
        [4, 5, 6], [4, 6, 7], [4, 7, 5], [5, 7, 6],
      ]
    ),
    // Icosahedron (20 faces) -> Partial
    partial: buildMesh(
      [
        [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
        [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
        [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
      ],
      [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
      ]
    ),
    // Octahedron (8 faces) -> Next & Unset
    next: buildMesh(
      [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
      [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]
    ),
    // Cuboctahedron -> Later
    later: buildMesh(
      [
        [1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0],
        [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
        [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1],
      ],
      [
        [0, 4, 8], [0, 9, 5], [1, 10, 4], [1, 5, 11],
        [2, 8, 6], [2, 7, 9], [3, 6, 10], [3, 11, 7],
        [0, 8, 2], [2, 9, 0], [1, 4, 0], [0, 5, 1],
      ]
    ),
  };
  POLYHEDRA.unset = POLYHEDRA.next;

  const PALETTE = {
    done:    { hex: "#38d989", core: "#ffe28a", rgb: [56, 217, 137], label: "Memorised", shapeName: "Merkaba Star" },
    partial: { hex: "#f06284", core: "#38d989", rgb: [240, 98, 132], label: "Partial", shapeName: "Icosahedron" },
    next:    { hex: "#f79d42", core: "#ffd599", rgb: [247, 157, 66], label: "Next", shapeName: "Octahedron" },
    later:   { hex: "#68a4ff", core: "#b8d4ff", rgb: [104, 164, 255], label: "Later", shapeName: "Cuboctahedron" },
    unset:   { hex: "#b5a686", core: "#dfd5be", rgb: [181, 166, 134], label: "Remaining", shapeName: "Crystal Frame" },
  };

  let activeCleanup = null;

  function stopActiveVisualiser() {
    if (typeof activeCleanup === "function") {
      activeCleanup();
      activeCleanup = null;
    }
  }

  function mountVisualiser(ctxApp, initialCh = null) {
    stopActiveVisualiser();
    const {
      surahs, statusStore, verseStore, chapterCache, translitCache,
      fetchJSON, loadTranslit, playVerse, stopPlayback, startContinuous,
      rollupChapterStatus, renderChips, getLast21, toggleLast21, getPlayingState, el, esc,
    } = ctxApp;

    stopPlayback();
    const view = document.getElementById("view");
    view.innerHTML = "";

    const wrap = el("div", "cosmos-wrap");
    const canvas = el("canvas", "cosmos-canvas");
    const ctx = canvas.getContext("2d");
    const tooltip = el("div", "cosmos-tooltip");

    let mode = initialCh ? "chapter" : "macro"; // 'macro' | 'chapter'
    let formation = "spiral"; // 'spiral' | 'sphere' | 'helix' | 'verses'
    let statusFilter = "all"; // 'all' | 'done' | 'partial' | 'next' | 'later' | 'unset'
    let activeCh = initialCh || null;
    let activeVerse = 1;
    let autoRotate = true;
    let tourTimer = null;
    let hoveredItem = null;
    let screenTargets = [];

    const cam = {
      yaw: 0.45, pitch: 0.28, dist: 640,
      tx: 0, ty: 0, tz: 0,
      targetYaw: 0.45, targetPitch: 0.28, targetDist: 640,
      targetTx: 0, targetTy: 0, targetTz: 0,
      velYaw: 0, velPitch: 0,
    };

    const bgStars = Array.from({ length: 190 }, (_, i) => {
      const u = ((i * 1.6180339) % 1) * 2 - 1;
      const th = i * 2.3999632;
      const r = 880 + (i % 7) * 140;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      return {
        x: r * s * Math.cos(th),
        y: r * u,
        z: r * s * Math.sin(th),
        size: 0.65 + (i % 5) * 0.35,
        phase: i * 0.73,
      };
    });

    const bursts = [];
    function spawnBurst(x, y, z, rgb = [56, 217, 137]) {
      for (let i = 0; i < 36; i++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const sp = 1.8 + Math.random() * 4.8;
        bursts.push({
          x, y, z,
          vx: Math.sin(ph) * Math.cos(th) * sp,
          vy: Math.cos(ph) * sp,
          vz: Math.sin(ph) * Math.sin(th) * sp,
          life: 1.0,
          rgb: i % 3 === 0 ? [255, 226, 138] : rgb,
          size: 2.0 + Math.random() * 2.6,
        });
      }
    }

    let macroNodes = [];
    let allVersePoints = [];
    let verseNodes = [];

    function getStatusKey(ch) {
      const s = statusStore.get(ch);
      if (s === "done" || s === "partial" || s === "next" || s === "later") return s;
      return verseStore.count(ch) > 0 ? "partial" : "unset";
    }

    function computeMacroTargets() {
      const isLast21 = getLast21();
      const list = isLast21 ? surahs.filter((s) => s.ch >= 94) : surahs;
      const N = list.length || 1;
      const map = statusStore.read();

      if (macroNodes.length !== N || macroNodes[0]?.ch !== list[0]?.ch) {
        macroNodes = list.map((s, idx) => ({
          ch: s.ch,
          meta: s,
          idx,
          x: (Math.random() - 0.5) * 320,
          y: (Math.random() - 0.5) * 320,
          z: (Math.random() - 0.5) * 320,
          tx: 0, ty: 0, tz: 0,
          radius: 10,
          rotSpeed: (0.0045 + (s.ch % 7) * 0.0012) * (s.ch % 2 === 0 ? 1 : -1),
          rotPhase: s.ch * 0.53,
        }));
      }

      const scaleBoost = isLast21 ? 1.55 : 1.0;
      macroNodes.forEach((node, i) => {
        const s = node.meta;
        const st = getStatusKey(s.ch);
        const ticked = st === "done" ? s.verses : verseStore.count(s.ch);
        node.status = st;
        node.ticked = ticked;
        node.ratio = s.verses ? Math.min(1, ticked / s.verses) : 0;
        node.radius = (8.5 + 24 * Math.pow(s.verses / 287, 0.42)) * scaleBoost;

        if (formation === "sphere") {
          const phiA = Math.acos(1 - (2 * (i + 0.5)) / N);
          const theta = Math.PI * (1 + Math.sqrt(5)) * i;
          const R = isLast21 ? 205 : 270;
          node.tx = R * Math.sin(phiA) * Math.cos(theta);
          node.ty = R * Math.cos(phiA);
          node.tz = R * Math.sin(phiA) * Math.sin(theta);
        } else if (formation === "helix") {
          const t = i / Math.max(1, N - 1);
          const angle = i * (isLast21 ? 0.65 : 0.36);
          const R = isLast21 ? 160 : 205 + 32 * Math.sin(i * 0.15);
          node.tx = R * Math.cos(angle);
          node.ty = (0.5 - t) * (isLast21 ? 350 : 520);
          node.tz = R * Math.sin(angle);
        } else {
          const angle = i * 2.399963229728653;
          const r = (isLast21 ? 38 : 25.5) * Math.sqrt(i + 1.2);
          node.tx = r * Math.cos(angle);
          node.ty = Math.sin(i * 0.25) * 26 - (i / N - 0.5) * (isLast21 ? 85 : 145);
          node.tz = r * Math.sin(angle);
        }
      });

      allVersePoints = [];
      const rawVerses = verseStore.readAllRaw();
      list.forEach((s, sIdx) => {
        const st = map[s.ch] || (verseStore.count(s.ch) > 0 ? "partial" : "");
        const chRaw = rawVerses[s.ch] || {};
        const armAngle = sIdx * 2.3999632;
        const baseR = (isLast21 ? 32 : 21.5) * Math.sqrt(sIdx + 1);
        const cx = baseR * Math.cos(armAngle);
        const cz = baseR * Math.sin(armAngle);
        const baseY = (0.5 - sIdx / N) * 135;

        for (let v = 1; v <= s.verses; v++) {
          const isMem = st === "done" || (chRaw[v] !== undefined && chRaw[v] >= 0);
          const localAngle = armAngle + v * 0.29;
          const localR = 6 + Math.sqrt(v) * (isLast21 ? 5.0 : 3.1);
          const vx = cx + localR * Math.cos(localAngle);
          const vz = cz + localR * Math.sin(localAngle);
          const vy = baseY + (isMem ? 26 + (v % 7) * 3 : -16 - (v % 5) * 2.5);
          const vStatus = isMem ? "done" : (st || "unset");
          allVersePoints.push({ ch: s.ch, v, x: vx, y: vy, z: vz, isMem, status: vStatus });
        }
      });
    }

    function computeChapterVerseTargets(ch) {
      const meta = surahs.find((s) => s.ch === ch);
      if (!meta) return;
      const total = meta.verses;
      const st = statusStore.get(ch);
      const vMap = verseStore.read(ch);
      const chData = chapterCache[ch];

      if (verseNodes.length !== total || verseNodes[0]?.ch !== ch) {
        verseNodes = Array.from({ length: total }, (_, idx) => ({
          ch,
          v: idx + 1,
          x: (Math.random() - 0.5) * 90,
          y: (Math.random() - 0.5) * 90,
          z: (Math.random() - 0.5) * 90,
          tx: 0, ty: 0, tz: 0,
          radius: 12,
          words: 8,
          rotSpeed: (0.0065 + (idx % 5) * 0.002) * (idx % 2 === 0 ? 1 : -1),
          rotPhase: idx * 0.71,
        }));
      }

      const densityScale = total <= 15 ? 1.55 : total <= 45 ? 1.2 : total <= 100 ? 0.95 : 0.76;
      verseNodes.forEach((vn, i) => {
        const vNum = i + 1;
        const verseObj = chData?.verses?.[i];
        const wordCount = verseObj ? verseObj.ar.trim().split(/\s+/).length : 8;
        vn.words = wordCount;
        vn.isMem = st === "done" || !!vMap[vNum];
        vn.status = vn.isMem ? "done" : (st && st !== "done" ? st : "unset");
        vn.radius = (7.5 + 14 * Math.pow(Math.min(wordCount, 85) / 85, 0.45)) * densityScale;

        if (formation === "sphere") {
          const phiA = Math.acos(1 - (2 * (i + 0.5)) / total);
          const theta = Math.PI * (1 + Math.sqrt(5)) * i;
          const R = total <= 12 ? 145 : total <= 50 ? 205 : 260;
          vn.tx = R * Math.sin(phiA) * Math.cos(theta);
          vn.ty = R * Math.cos(phiA);
          vn.tz = R * Math.sin(phiA) * Math.sin(theta);
        } else if (formation === "helix") {
          const t = total > 1 ? i / (total - 1) : 0.5;
          const angle = i * (total <= 20 ? 0.7 : 0.42);
          const R = total <= 20 ? 140 : 190;
          vn.tx = R * Math.cos(angle);
          vn.ty = (0.5 - t) * Math.min(500, Math.max(190, total * 9));
          vn.tz = R * Math.sin(angle);
        } else {
          if (total <= 12) {
            const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
            const R = 135;
            vn.tx = R * Math.cos(angle);
            vn.ty = Math.sin(i * 0.9) * 16;
            vn.tz = R * Math.sin(angle);
          } else {
            const angle = i * 2.3999632;
            const r = (total <= 40 ? 31 : 20.5) * Math.sqrt(i + 1.2);
            vn.tx = r * Math.cos(angle);
            vn.ty = (vn.isMem ? 14 : -10) + Math.sin(i * 0.35) * 16 - (i / total - 0.5) * 115;
            vn.tz = r * Math.sin(angle);
          }
        }
      });
    }

    // ---------- HUD Construction ----------
    const hudTop = el("div", "cosmos-hud-top");
    const bar1 = el("div", "cosmos-bar");
    const leftGroup = el("div", "cosmos-bar-group");

    const backBtn = el("button", "cosmos-btn", "← Quran");
    backBtn.addEventListener("click", () => {
      if (mode === "chapter") {
        exitChapterToMacro();
      } else {
        location.hash = "#/";
      }
    });

    const scopeBtn = el("button", "cosmos-btn");
    const syncScopeBtn = () => {
      const l21 = getLast21();
      scopeBtn.classList.toggle("active", l21);
      scopeBtn.textContent = l21 ? "★ Last 21 (94–114)" : "All 114 Chapters";
      scopeBtn.title = "Toggle between Last 21 chapters and Whole Quran";
    };
    scopeBtn.addEventListener("click", () => {
      toggleLast21();
    });

    const chSelect = el("select", "cosmos-select");
    function populateChapterSelect() {
      const isLast21 = getLast21();
      const list = isLast21 ? surahs.filter((s) => s.ch >= 94) : surahs;
      chSelect.innerHTML = `<option value="">✦ Dive into chapter…</option>`;
      for (const s of list) {
        const st = getStatusKey(s.ch);
        const mark = st === "done" ? "✓ " : st === "partial" ? "◐ " : "";
        const opt = el("option", null, `${mark}${s.ch}. ${s.name} (${s.verses}v)`);
        opt.value = s.ch;
        chSelect.append(opt);
      }
      if (mode === "chapter" && activeCh) chSelect.value = String(activeCh);
    }
    chSelect.addEventListener("change", () => {
      const val = parseInt(chSelect.value, 10);
      if (val) enterChapterMode(val, 1);
      else exitChapterToMacro();
    });

    leftGroup.append(backBtn, scopeBtn, chSelect);

    const formGroup = el("div", "cosmos-bar-group");
    formGroup.append(el("span", "cosmos-label", "3D Form:"));
    const formButtons = {};
    const makeFormBtn = (id, label) => {
      const b = el("button", "cosmos-btn" + (formation === id ? " active" : ""), label);
      b.addEventListener("click", () => {
        formation = id;
        Object.entries(formButtons).forEach(([k, btn]) => btn.classList.toggle("active", k === formation));
        if (mode === "chapter") computeChapterVerseTargets(activeCh);
        else computeMacroTargets();
      });
      formButtons[id] = b;
      return b;
    };
    formGroup.append(
      makeFormBtn("spiral", "✦ Spiral"),
      makeFormBtn("sphere", "🌐 Sphere"),
      makeFormBtn("helix", "🧬 Helix"),
      makeFormBtn("verses", "✨ 6,348 Verses")
    );

    const camGroup = el("div", "cosmos-bar-group");
    const orbitBtn = el("button", "cosmos-btn active", "⟳ Orbit");
    orbitBtn.addEventListener("click", () => {
      autoRotate = !autoRotate;
      orbitBtn.classList.toggle("active", autoRotate);
    });

    const tourBtn = el("button", "cosmos-btn", "✦ Auto-Tour");
    function stopTour() {
      if (tourTimer) { clearInterval(tourTimer); tourTimer = null; }
      tourBtn.classList.remove("active");
      tourBtn.textContent = "✦ Auto-Tour";
    }
    tourBtn.addEventListener("click", () => {
      if (tourTimer) {
        stopTour();
        return;
      }
      tourBtn.classList.add("active");
      tourBtn.textContent = "■ Stop Tour";
      const stepTour = () => {
        if (mode === "chapter") {
          const meta = surahs.find((s) => s.ch === activeCh);
          if (!meta) return;
          const nextV = (activeVerse % meta.verses) + 1;
          selectVerseIn3D(nextV, false);
        } else {
          if (!macroNodes.length) return;
          const pick = macroNodes[Math.floor(Math.random() * macroNodes.length)];
          if (pick) {
            cam.targetTx = pick.x;
            cam.targetTy = pick.y;
            cam.targetTz = pick.z;
            cam.targetDist = Math.max(220, pick.radius * 12);
            spawnBurst(pick.x, pick.y, pick.z, PALETTE[pick.status]?.rgb || [255, 226, 138]);
          }
        }
      };
      stepTour();
      tourTimer = setInterval(stepTour, 3200);
    });

    const resetCamBtn = el("button", "cosmos-btn", "⌖ Reset");
    resetCamBtn.title = "Reset 3D camera position";
    resetCamBtn.addEventListener("click", () => {
      stopTour();
      cam.targetTx = 0; cam.targetTy = 0; cam.targetTz = 0;
      cam.targetPitch = 0.28;
      cam.targetDist = mode === "chapter" ? 430 : 640;
    });

    const fsBtn = el("button", "cosmos-btn", "⛶");
    fsBtn.title = "Toggle Fullscreen 3D view";
    fsBtn.addEventListener("click", () => {
      wrap.classList.toggle("is-fullscreen");
      fsBtn.classList.toggle("active", wrap.classList.contains("is-fullscreen"));
      resizeCanvas();
    });

    camGroup.append(orbitBtn, tourBtn, resetCamBtn, fsBtn);
    bar1.append(leftGroup, formGroup, camGroup);

    // Status spotlight filter bar
    const bar2 = el("div", "cosmos-bar");
    const filterGroup = el("div", "cosmos-bar-group");
    filterGroup.append(el("span", "cosmos-label", "Spotlight:"));
    const filterBtns = {};
    const makeStatusFilterBtn = (id, label, hex) => {
      const b = el("button", "cosmos-btn" + (statusFilter === id ? " active" : ""));
      b.innerHTML = (hex ? `<span class="cosmos-dot" style="background:${hex}"></span>` : "") + esc(label);
      b.addEventListener("click", () => {
        statusFilter = id;
        Object.entries(filterBtns).forEach(([k, btn]) => btn.classList.toggle("active", k === statusFilter));
      });
      filterBtns[id] = b;
      return b;
    };
    filterGroup.append(
      makeStatusFilterBtn("all", "All"),
      makeStatusFilterBtn("done", "Memorised (Merkaba)", PALETTE.done.hex),
      makeStatusFilterBtn("partial", "Partial (Icosahedron)", PALETTE.partial.hex),
      makeStatusFilterBtn("next", "Next (Octahedron)", PALETTE.next.hex),
      makeStatusFilterBtn("later", "Later (Cubocta)", PALETTE.later.hex),
      makeStatusFilterBtn("unset", "Remaining (Crystal)", PALETTE.unset.hex)
    );
    const hintPill = el("span", "cosmos-label", "Drag to rotate 3D · Pinch/scroll to zoom · Tap any shape to explore verses");
    bar2.append(filterGroup, hintPill);

    hudTop.append(bar1, bar2);

    // Bottom HUD: Telemetry + Verse Inspector
    const hudBottom = el("div", "cosmos-hud-bottom");
    const telemetryEl = el("div", "cosmos-telemetry");
    const inspectorEl = el("div", "cosmos-inspector");
    inspectorEl.style.display = "none";
    hudBottom.append(inspectorEl, telemetryEl);

    wrap.append(canvas, tooltip, hudTop, hudBottom);
    view.append(wrap);

    function updateTelemetry() {
      const isLast21 = getLast21();
      const scopeList = isLast21 ? surahs.filter((s) => s.ch >= 94) : surahs;
      const map = statusStore.read();
      let vDone = 0, vPartial = 0, vNext = 0, vLater = 0, vTotal = 0;
      let chDone = 0;
      for (const s of scopeList) {
        vTotal += s.verses;
        const st = map[s.ch];
        const ticked = verseStore.count(s.ch);
        const memV = st === "done" ? s.verses : ticked;
        vDone += memV;
        if (st === "done" || ticked === s.verses) chDone++;
        else if (st === "partial" || ticked > 0) vPartial += Math.max(0, s.verses - memV);
        else if (st === "next") vNext += s.verses;
        else if (st === "later") vLater += s.verses;
      }
      const vRem = Math.max(0, vTotal - vDone);
      const pct = vTotal ? ((vDone / vTotal) * 100).toFixed(1) : "0.0";
      const pDone = vTotal ? (vDone / vTotal) * 100 : 0;
      const pPart = vTotal ? (vPartial / vTotal) * 100 : 0;
      const pNext = vTotal ? (vNext / vTotal) * 100 : 0;
      const pLater = vTotal ? (vLater / vTotal) * 100 : 0;

      telemetryEl.innerHTML = `
        <div class="cosmos-telemetry-row">
          <div class="cosmos-telemetry-title">
            <span>✦ ${isLast21 ? "Last 21 Chapters" : "Holy Quran"}Progress</span>
            <span style="color:#38d989">${vDone.toLocaleString()} / ${vTotal.toLocaleString()} verses memorised (${pct}%)</span>
            <span style="color:#b7aa8e">· ${vRem.toLocaleString()} verses remaining</span>
          </div>
          <div class="cosmos-telemetry-stats">
            <span class="cosmos-stat-pill"><span class="cosmos-dot" style="background:${PALETTE.done.hex}"></span><b>${chDone}/${scopeList.length}</b> chapters complete</span>
            <span class="cosmos-stat-pill"><span class="cosmos-dot" style="background:${PALETTE.partial.hex}"></span><b>${vPartial.toLocaleString()}v</b> in partial</span>
            <span class="cosmos-stat-pill"><span class="cosmos-dot" style="background:${PALETTE.next.hex}"></span><b>${vNext.toLocaleString()}v</b> next</span>
          </div>
        </div>
        <div class="cosmos-multibar">
          <div class="cosmos-multibar-seg" style="width:${pDone}%;background:${PALETTE.done.hex}"></div>
          <div class="cosmos-multibar-seg" style="width:${pPart}%;background:${PALETTE.partial.hex}"></div>
          <div class="cosmos-multibar-seg" style="width:${pNext}%;background:${PALETTE.next.hex}"></div>
          <div class="cosmos-multibar-seg" style="width:${pLater}%;background:${PALETTE.later.hex}"></div>
        </div>`;
    }

    async function ensureChapterLoaded(ch) {
      if (!chapterCache[ch]) {
        try {
          chapterCache[ch] = await fetchJSON(`data/chapters/${ch}.json`);
        } catch {}
      }
      if (!translitCache[ch]) {
        try { await loadTranslit(ch); } catch {}
      }
      if (mode === "chapter" && activeCh === ch) {
        computeChapterVerseTargets(ch);
        renderInspectorCard();
      }
    }

    function enterChapterMode(ch, vNum = 1) {
      const meta = surahs.find((s) => s.ch === ch);
      if (!meta) return;
      stopTour();
      mode = "chapter";
      activeCh = ch;
      activeVerse = Math.max(1, Math.min(meta.verses, vNum || 1));
      if (formation === "verses") {
        formation = "spiral";
        Object.entries(formButtons).forEach(([k, btn]) => btn.classList.toggle("active", k === formation));
      }
      formButtons.verses.style.display = "none";
      backBtn.textContent = "← All Chapters (3D)";
      chSelect.value = String(ch);

      computeChapterVerseTargets(ch);
      ensureChapterLoaded(ch);

      const targetNode = verseNodes[activeVerse - 1];
      if (targetNode) {
        cam.targetTx = targetNode.tx * 0.35;
        cam.targetTy = targetNode.ty * 0.35;
        cam.targetTz = targetNode.tz * 0.35;
      } else {
        cam.targetTx = 0; cam.targetTy = 0; cam.targetTz = 0;
      }
      cam.targetDist = meta.verses <= 15 ? 360 : meta.verses <= 50 ? 450 : 540;
      spawnBurst(0, 0, 0, PALETTE[getStatusKey(ch)]?.rgb || [255, 226, 138]);
      renderInspectorCard();
    }

    function exitChapterToMacro() {
      stopTour();
      stopPlayback();
      mode = "macro";
      activeCh = null;
      formButtons.verses.style.display = "";
      backBtn.textContent = "← Quran";
      chSelect.value = "";
      inspectorEl.style.display = "none";
      computeMacroTargets();
      cam.targetTx = 0; cam.targetTy = 0; cam.targetTz = 0;
      cam.targetDist = 640;
    }

    function selectVerseIn3D(vNum, playAudioNow = false) {
      if (mode !== "chapter" || !activeCh) return;
      const meta = surahs.find((s) => s.ch === activeCh);
      if (!meta) return;
      activeVerse = Math.max(1, Math.min(meta.verses, vNum));
      const vn = verseNodes[activeVerse - 1];
      if (vn) {
        cam.targetTx = vn.x;
        cam.targetTy = vn.y;
        cam.targetTz = vn.z;
        cam.targetDist = Math.max(210, Math.min(370, vn.radius * 18));
      }
      renderInspectorCard();
      if (playAudioNow) {
        playVerse(activeCh, activeVerse, { continuous: false });
      }
    }

    function renderInspectorCard() {
      if (mode !== "chapter" || !activeCh) {
        inspectorEl.style.display = "none";
        return;
      }
      const meta = surahs.find((s) => s.ch === activeCh);
      if (!meta) return;
      inspectorEl.style.display = "flex";

      const st = statusStore.get(activeCh);
      const isMem = st === "done" || verseStore.get(activeCh, activeVerse);
      const doneCount = st === "done" ? meta.verses : verseStore.count(activeCh);
      const chData = chapterCache[activeCh];
      const vObj = chData?.verses?.[activeVerse - 1];
      const tlText = translitCache[activeCh]?.byVerse?.[activeVerse] || "";
      const playing = getPlayingState();
      const isThisPlaying = playing.currentCh === activeCh && playing.currentV === activeVerse;

      inspectorEl.innerHTML = "";
      const head = el("div", "cosmos-inspector-head");
      const titleBox = el("div", "cosmos-inspector-title");
      titleBox.innerHTML = `
        <span class="en">${meta.ch}. ${esc(meta.name)}</span>
        <span class="ar">${esc(meta.ar)}</span>
        <span class="cosmos-inspector-meta">Verse <b>${activeVerse}</b> of ${meta.verses} · ${doneCount}/${meta.verses} memorised</span>`;

      const actGroup = el("div", "cosmos-bar-group");

      const prevVBtn = el("button", "cosmos-btn", "‹ Prev");
      prevVBtn.addEventListener("click", () => {
        const prev = activeVerse > 1 ? activeVerse - 1 : meta.verses;
        selectVerseIn3D(prev, false);
      });

      const nextVBtn = el("button", "cosmos-btn", "Next ›");
      nextVBtn.addEventListener("click", () => {
        const nxt = (activeVerse % meta.verses) + 1;
        selectVerseIn3D(nxt, false);
      });

      const playVBtn = el("button", "cosmos-btn" + (isThisPlaying ? " active" : ""), isThisPlaying ? "■ Stop Audio" : "▶ Listen Verse");
      playVBtn.addEventListener("click", () => {
        const curPlay = getPlayingState();
        if (curPlay.currentCh === activeCh && curPlay.currentV === activeVerse) {
          stopPlayback();
          renderInspectorCard();
        } else {
          playVerse(activeCh, activeVerse, { continuous: false });
        }
      });

      const playAllBtn = el("button", "cosmos-btn" + (playing.continuous && playing.currentCh === activeCh ? " active" : ""),
        playing.continuous && playing.currentCh === activeCh ? "■ Stop Journey" : "▶ Play Chapter in 3D");
      playAllBtn.addEventListener("click", async () => {
        const curPlay = getPlayingState();
        if (curPlay.continuous && curPlay.currentCh === activeCh) {
          stopPlayback();
          renderInspectorCard();
          return;
        }
        await ensureChapterLoaded(activeCh);
        startContinuous(activeCh, Math.max(0, activeVerse - 1));
      });

      const memBtn = el("button", "cosmos-btn" + (isMem ? " emerald-active" : ""), isMem ? "✓ Memorised" : "○ Mark Memorised");
      memBtn.addEventListener("click", () => {
        if (statusStore.get(activeCh) === "done" && isMem) {
          // If whole chapter was marked done, seed all other verses true and untick this one
          const all = verseStore.readAllRaw();
          const m = all[activeCh] || {};
          const now = Date.now();
          for (let i = 1; i <= meta.verses; i++) m[i] = i === activeVerse ? -now : now;
          all[activeCh] = m;
          verseStore.writeAllRaw(all);
        } else {
          verseStore.set(activeCh, activeVerse, !isMem);
        }
        rollupChapterStatus(activeCh);
        renderChips();
        computeChapterVerseTargets(activeCh);
        updateTelemetry();
        populateChapterSelect();
        const vn = verseNodes[activeVerse - 1];
        if (vn && !isMem) spawnBurst(vn.x, vn.y, vn.z, [56, 217, 137]);
        renderInspectorCard();
      });

      const openReaderBtn = el("a", "cosmos-btn", "📖 Reader →");
      openReaderBtn.href = `#/ch/${activeCh}`;

      actGroup.append(prevVBtn, nextVBtn, playVBtn, playAllBtn, memBtn, openReaderBtn);
      head.append(titleBox, actGroup);
      inspectorEl.append(head);

      const body = el("div", "cosmos-verse-body");
      if (vObj) {
        body.append(el("div", "cosmos-verse-ar", esc(vObj.ar)));
        if (tlText) body.append(el("div", "cosmos-verse-tl", esc(tlText)));
        if (vObj.en) body.append(el("div", "cosmos-verse-en", esc(vObj.en)));
      } else {
        body.append(el("div", "cosmos-inspector-meta", "Loading verse text…"));
      }
      inspectorEl.append(body);
    }

    // ---------- Canvas Sizing & Pointer / Touch Controls ----------
    let width = 800, height = 600, dpr = 1;
    function resizeCanvas() {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(300, rect.width);
      height = Math.max(350, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    window.addEventListener("resize", resizeCanvas);

    const pointers = new Map();
    let dragStartX = 0, dragStartY = 0, totalDragDist = 0;
    let lastPinchDist = 0;

    function hitTestScreen(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      let best = null;
      let bestDist = Infinity;
      for (let i = screenTargets.length - 1; i >= 0; i--) {
        const t = screenTargets[i];
        const d = Math.hypot(sx - t.sx, sy - t.sy);
        if (d <= Math.max(15, t.sr * 1.25) && d < bestDist) {
          best = t;
          bestDist = d;
        }
      }
      return { hit: best, sx, sy };
    }

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        totalDragDist = 0;
        cam.velYaw = 0;
        cam.velPitch = 0;
      } else if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) {
        const { hit, sx, sy } = hitTestScreen(e.clientX, e.clientY);
        hoveredItem = hit;
        if (hit) {
          canvas.style.cursor = "pointer";
          tooltip.style.left = `${sx}px`;
          tooltip.style.top = `${sy}px`;
          tooltip.innerHTML = hit.tooltipHtml;
          tooltip.classList.add("visible");
        } else {
          canvas.style.cursor = "grab";
          tooltip.classList.remove("visible");
        }
        return;
      }

      const prev = pointers.get(e.pointerId);
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        totalDragDist += Math.hypot(dx, dy);
        cam.velYaw = -dx * 0.0065;
        cam.velPitch = dy * 0.0065;
        cam.targetYaw += cam.velYaw;
        cam.targetPitch = Math.max(-1.35, Math.min(1.35, cam.targetPitch + cam.velPitch));
        tooltip.classList.remove("visible");
      } else if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastPinchDist > 0) {
          const scale = lastPinchDist / Math.max(20, dist);
          cam.targetDist = Math.max(140, Math.min(1350, cam.targetDist * scale));
        }
        lastPinchDist = dist;
      }
    });

    const onPointerUp = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) lastPinchDist = 0;

      if (totalDragDist < 8) {
        const { hit } = hitTestScreen(e.clientX, e.clientY);
        if (hit) {
          if (hit.type === "chapter") {
            enterChapterMode(hit.ch, 1);
          } else if (hit.type === "verse") {
            if (mode !== "chapter" || activeCh !== hit.ch) {
              enterChapterMode(hit.ch, hit.v);
            } else {
              selectVerseIn3D(hit.v, true);
            }
          }
        }
      }
    };
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.09 : 0.91;
      cam.targetDist = Math.max(140, Math.min(1350, cam.targetDist * factor));
    }, { passive: false });

    // ---------- 3D Projection & Polyhedral Rendering Loop ----------
    let rafId = null;
    let clock = 0;

    function projectPoint(wx, wy, wz, cosY, sinY, cosP, sinP, fov, cx, cy) {
      const rx = wx - cam.tx;
      const ry = wy - cam.ty;
      const rz = wz - cam.tz;

      const x1 = rx * cosY - rz * sinY;
      const z1 = rx * sinY + rz * cosY;

      const y2 = ry * cosP - z1 * sinP;
      const z2 = ry * sinP + z1 * cosP + cam.dist;

      if (z2 < 18) return null;
      const scale = fov / z2;
      return { sx: cx + x1 * scale, sy: cy + y2 * scale, z: z2, scale };
    }

    function drawPolyhedron(p, radius, statusKey, rotA, rotB, alpha, ratio = 1, isSelected = false, isPlaying = false) {
      const mesh = POLYHEDRA[statusKey] || POLYHEDRA.unset;
      const pal = PALETTE[statusKey] || PALETTE.unset;
      const [r, g, b] = pal.rgb;
      const screenR = radius * p.scale;

      // Volumetric outer glow
      const glowR = Math.max(6, screenR * (isSelected || isPlaying ? 3.1 : 2.1));
      const grad = ctx.createRadialGradient(p.sx, p.sy, screenR * 0.1, p.sx, p.sy, glowR);
      const glowAlpha = (statusKey === "unset" ? 0.18 : 0.42) * alpha;
      grad.addColorStop(0, `rgba(${r},${g},${b},${Math.min(0.95, glowAlpha * 1.5)})`);
      grad.addColorStop(0.45, `rgba(${r},${g},${b},${glowAlpha * 0.55})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // If tiny on screen, render as a crisp glowing crystal jewel
      if (screenR < 4.2) {
        ctx.fillStyle = `rgba(${r},${g},${b},${0.88 * alpha})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, Math.max(1.8, screenR), 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      const cA = Math.cos(rotA), sA = Math.sin(rotA);
      const cB = Math.cos(rotB), sB = Math.sin(rotB);

      const tVerts = mesh.verts.map((v) => {
        const x1 = v[0] * cA - v[2] * sA;
        const z1 = v[0] * sA + v[2] * cA;
        const y2 = v[1] * cB - z1 * sB;
        const z2 = v[1] * sB + z1 * cB;
        return {
          sx: p.sx + x1 * screenR,
          sy: p.sy + y2 * screenR,
          z: z2,
        };
      });

      // Shaded faces (for non-unset or selected shapes)
      if (statusKey !== "unset" || isSelected) {
        const totalFaces = mesh.faces.length;
        mesh.faces.forEach((f, fIdx) => {
          const v0 = tVerts[f.idx[0]], v1 = tVerts[f.idx[1]], v2 = tVerts[f.idx[2]];
          // Backface check in screen space
          const cross = (v1.sx - v0.sx) * (v2.sy - v0.sy) - (v1.sy - v0.sy) * (v2.sx - v0.sx);
          if (cross > 0 && statusKey !== "done") return;

          const light = Math.max(0.25, Math.min(1, 0.6 + (v0.z + v1.z + v2.z) * 0.18));
          let fr = r, fg = g, fb = b;
          if (statusKey === "partial" && fIdx / totalFaces < ratio) {
            // Portion of icosahedron faces lit in Memorised Emerald!
            fr = 56; fg = 217; fb = 137;
          }
          ctx.fillStyle = `rgba(${Math.round(fr * light)},${Math.round(fg * light)},${Math.round(fb * light)},${0.34 * alpha})`;
          ctx.beginPath();
          ctx.moveTo(v0.sx, v0.sy);
          ctx.lineTo(v1.sx, v1.sy);
          ctx.lineTo(v2.sx, v2.sy);
          ctx.closePath();
          ctx.fill();
        });
      }

      // Glowing sacred core for memorised or partial
      if (statusKey === "done" || (statusKey === "partial" && ratio > 0)) {
        const coreR = screenR * (statusKey === "done" ? 0.36 : 0.22 + 0.28 * ratio);
        ctx.fillStyle = statusKey === "done"
          ? `rgba(255, 230, 145, ${0.85 * alpha})`
          : `rgba(56, 217, 137, ${0.75 * alpha})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, coreR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Wireframe edges
      ctx.strokeStyle = statusKey === "done"
        ? `rgba(255, 236, 175, ${0.82 * alpha})`
        : `rgba(${r},${g},${b},${(statusKey === "unset" ? 0.52 : 0.85) * alpha})`;
      ctx.lineWidth = isSelected ? 1.8 : 1.05;
      ctx.beginPath();
      for (const [a, bIdx] of mesh.edges) {
        ctx.moveTo(tVerts[a].sx, tVerts[a].sy);
        ctx.lineTo(tVerts[bIdx].sx, tVerts[bIdx].sy);
      }
      ctx.stroke();

      // Partial progress arc or Memorised orbital ring
      if (statusKey === "partial" && ratio > 0 && screenR > 8) {
        const ringR = screenR * 1.28;
        ctx.strokeStyle = `rgba(240, 98, 132, ${0.35 * alpha})`;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, ringR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(56, 217, 137, ${0.95 * alpha})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.stroke();
      } else if (statusKey === "done" && screenR > 8) {
        ctx.save();
        ctx.translate(p.sx, p.sy);
        ctx.rotate(rotA * 0.7);
        ctx.strokeStyle = `rgba(255, 226, 138, ${0.55 * alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, screenR * 1.38, screenR * 0.52, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Selection / Playing sonic wave rings
      if (isSelected || isPlaying) {
        const pulse = (clock * 2.4) % 1;
        ctx.strokeStyle = isPlaying
          ? `rgba(56, 217, 137, ${(1 - pulse) * 0.9})`
          : `rgba(255, 220, 130, 0.9)`;
        ctx.lineWidth = isPlaying ? 2.2 : 1.6;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, screenR * (1.45 + (isPlaying ? pulse * 1.4 : 0.15 * Math.sin(clock * 5))), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function renderFrame() {
      rafId = requestAnimationFrame(renderFrame);
      clock += 0.016;

      // Camera physics & orbital damping
      if (pointers.size === 0) {
        if (autoRotate && !tourTimer) {
          cam.targetYaw += mode === "chapter" ? 0.0022 : 0.0018;
        } else {
          cam.targetYaw += cam.velYaw;
          cam.targetPitch = Math.max(-1.35, Math.min(1.35, cam.targetPitch + cam.velPitch));
          cam.velYaw *= 0.92;
          cam.velPitch *= 0.92;
        }
      }
      cam.yaw += (cam.targetYaw - cam.yaw) * 0.12;
      cam.pitch += (cam.targetPitch - cam.pitch) * 0.12;
      cam.dist += (cam.targetDist - cam.dist) * 0.12;
      cam.tx += (cam.targetTx - cam.tx) * 0.1;
      cam.ty += (cam.targetTy - cam.ty) * 0.1;
      cam.tz += (cam.targetTz - cam.tz) * 0.1;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const fov = Math.min(width, height) * 0.92;
      const cosY = Math.cos(cam.yaw), sinY = Math.sin(cam.yaw);
      const cosP = Math.cos(cam.pitch), sinP = Math.sin(cam.pitch);

      // 1. Background 3D Starfield
      for (const st of bgStars) {
        const sp = projectPoint(st.x + cam.tx, st.y + cam.ty, st.z + cam.tz, cosY, sinY, cosP, sinP, fov, cx, cy);
        if (!sp) continue;
        const tw = 0.35 + 0.45 * Math.sin(clock * 1.8 + st.phase);
        ctx.fillStyle = `rgba(245, 232, 200, ${tw})`;
        ctx.beginPath();
        ctx.arc(sp.sx, sp.sy, st.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Subtle 3D Celestial Astrolabe Rings
      ctx.strokeStyle = "rgba(217, 160, 94, 0.08)";
      ctx.lineWidth = 1;
      for (const ringR of [160, 270, 390]) {
        ctx.beginPath();
        let started = false;
        for (let a = 0; a <= 64; a++) {
          const th = (a / 64) * Math.PI * 2;
          const pt = projectPoint(Math.cos(th) * ringR, 0, Math.sin(th) * ringR, cosY, sinY, cosP, sinP, fov, cx, cy);
          if (!pt) continue;
          if (!started) { ctx.moveTo(pt.sx, pt.sy); started = true; }
          else ctx.lineTo(pt.sx, pt.sy);
        }
        ctx.stroke();
      }

      screenTargets = [];
      const playing = getPlayingState();

      if (mode === "macro" && formation === "verses") {
        // ---------- All 6,348 Verses Galaxy Nebula ----------
        const projectedVerses = [];
        for (const vp of allVersePoints) {
          const matchFilter = statusFilter === "all" || vp.status === statusFilter;
          const pr = projectPoint(vp.x, vp.y, vp.z, cosY, sinY, cosP, sinP, fov, cx, cy);
          if (!pr) continue;
          projectedVerses.push({ vp, pr, alpha: matchFilter ? 1 : 0.12 });
        }
        projectedVerses.sort((a, b) => b.pr.z - a.pr.z);

        for (const item of projectedVerses) {
          const { vp, pr, alpha } = item;
          const pal = PALETTE[vp.status] || PALETTE.unset;
          const [r, g, b] = pal.rgb;
          const rad = Math.max(1.3, (vp.isMem ? 3.8 : 2.2) * pr.scale);
          if (vp.isMem && rad > 2.2 && alpha > 0.5) {
            ctx.fillStyle = `rgba(56, 217, 137, ${0.24 * alpha})`;
            ctx.beginPath();
            ctx.arc(pr.sx, pr.sy, rad * 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = `rgba(${r},${g},${b},${(vp.isMem ? 0.95 : 0.62) * alpha})`;
          ctx.beginPath();
          ctx.arc(pr.sx, pr.sy, rad, 0, Math.PI * 2);
          ctx.fill();

          if (alpha > 0.4) {
            const sMeta = surahs[vp.ch - 1];
            screenTargets.push({
              type: "verse",
              ch: vp.ch,
              v: vp.v,
              sx: pr.sx,
              sy: pr.sy,
              sr: Math.max(8, rad * 1.5),
              tooltipHtml: `<b>${vp.ch}:${vp.v} · ${esc(sMeta ? sMeta.name : "")}</b><br/><span style="color:${pal.hex}">${vp.isMem ? "✓ Verse Memorised" : "Remaining Verse"}</span> · Tap to inspect`,
            });
          }
        }
      } else if (mode === "macro") {
        // ---------- Macro Mode: 114 Chapters as 3D Polyhedra ----------
        const projectedNodes = [];
        for (const node of macroNodes) {
          node.x += (node.tx - node.x) * 0.1;
          node.y += (node.ty - node.y) * 0.1;
          node.z += (node.tz - node.z) * 0.1;
          const pr = projectPoint(node.x, node.y, node.z, cosY, sinY, cosP, sinP, fov, cx, cy);
          if (pr) projectedNodes.push({ node, pr });
        }

        // Golden chronological filament connecting Surah 1 -> 114
        if (projectedNodes.length > 1) {
          ctx.strokeStyle = "rgba(217, 160, 94, 0.16)";
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          projectedNodes.forEach((item, idx) => {
            if (idx === 0) ctx.moveTo(item.pr.sx, item.pr.sy);
            else ctx.lineTo(item.pr.sx, item.pr.sy);
          });
          ctx.stroke();
        }

        projectedNodes.sort((a, b) => b.pr.z - a.pr.z);

        for (const { node, pr } of projectedNodes) {
          const matchFilter = statusFilter === "all" || node.status === statusFilter;
          const alpha = matchFilter ? 1.0 : 0.14;
          const isHovered = hoveredItem?.type === "chapter" && hoveredItem.ch === node.ch;
          const rotA = clock * node.rotSpeed * 60 + node.rotPhase;
          const rotB = clock * node.rotSpeed * 42 + node.rotPhase * 0.7;

          drawPolyhedron(pr, node.radius, node.status, rotA, rotB, alpha, node.ratio, isHovered, playing.currentCh === node.ch);

          const sr = node.radius * pr.scale;
          if (sr > 11 && alpha > 0.5) {
            ctx.fillStyle = `rgba(255, 248, 231, ${Math.min(0.95, (sr - 9) / 14)})`;
            ctx.font = `600 ${Math.max(9, Math.min(13, Math.round(sr * 0.48)))}px -apple-system, BlinkMacSystemFont, sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(`${node.ch}. ${node.meta.name}`, pr.sx, pr.sy + sr + 13);
          }

          if (alpha > 0.3) {
            const pal = PALETTE[node.status] || PALETTE.unset;
            const rem = Math.max(0, node.meta.verses - node.ticked);
            screenTargets.push({
              type: "chapter",
              ch: node.ch,
              sx: pr.sx,
              sy: pr.sy,
              sr: Math.max(12, sr),
              tooltipHtml: `<b>${node.ch}. ${esc(node.meta.name)} (${esc(node.meta.ar)})</b><br/>` +
                `<span style="color:${pal.hex}">● ${pal.label} (${pal.shapeName})</span><br/>` +
                `${node.ticked}/${node.meta.verses} verses memorised · ${rem} remaining<br/>` +
                `<span style="color:#d6b87c">Tap to explore all ${node.meta.verses} verses in 3D →</span>`,
            });
          }
        }
      } else {
        // ---------- Micro Mode: Chapter Verse Constellation in 3D ----------
        const projectedVerses = [];
        for (const vn of verseNodes) {
          vn.x += (vn.tx - vn.x) * 0.11;
          vn.y += (vn.ty - vn.y) * 0.11;
          vn.z += (vn.tz - vn.z) * 0.11;
          const pr = projectPoint(vn.x, vn.y, vn.z, cosY, sinY, cosP, sinP, fov, cx, cy);
          if (pr) projectedVerses.push({ vn, pr });
        }

        // Constellation light thread connecting Verse 1 -> 2 -> ... -> N
        if (projectedVerses.length > 1) {
          for (let i = 0; i < projectedVerses.length - 1; i++) {
            const a = projectedVerses[i], b = projectedVerses[i + 1];
            const bothMem = a.vn.isMem && b.vn.isMem;
            ctx.strokeStyle = bothMem ? "rgba(56, 217, 137, 0.48)" : "rgba(217, 160, 94, 0.22)";
            ctx.lineWidth = bothMem ? 1.8 : 1.1;
            ctx.beginPath();
            ctx.moveTo(a.pr.sx, a.pr.sy);
            ctx.lineTo(b.pr.sx, b.pr.sy);
            ctx.stroke();
          }
        }

        projectedVerses.sort((a, b) => b.pr.z - a.pr.z);

        for (const { vn, pr } of projectedVerses) {
          const matchFilter = statusFilter === "all" || vn.status === statusFilter;
          const alpha = matchFilter ? 1.0 : 0.15;
          const isSel = vn.v === activeVerse;
          const isPlay = playing.currentCh === vn.ch && playing.currentV === vn.v;
          const rotA = clock * vn.rotSpeed * 60 + vn.rotPhase;
          const rotB = clock * vn.rotSpeed * 45 + vn.rotPhase * 0.6;

          drawPolyhedron(pr, vn.radius, vn.status, rotA, rotB, alpha, vn.isMem ? 1 : 0, isSel, isPlay);

          const sr = vn.radius * pr.scale;
          if (sr > 7 && alpha > 0.4) {
            ctx.fillStyle = isSel ? "#ffe28a" : vn.isMem ? "#d2fbe6" : "rgba(243, 233, 207, 0.85)";
            ctx.font = `700 ${Math.max(9, Math.min(13, Math.round(sr * 0.55)))}px -apple-system, BlinkMacSystemFont, sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(`v${vn.v}`, pr.sx, pr.sy + sr + 12);
          }

          if (alpha > 0.3) {
            const pal = PALETTE[vn.status] || PALETTE.unset;
            screenTargets.push({
              type: "verse",
              ch: vn.ch,
              v: vn.v,
              sx: pr.sx,
              sy: pr.sy,
              sr: Math.max(13, sr),
              tooltipHtml: `<b>Verse ${vn.ch}:${vn.v}</b> (${vn.words} Arabic words)<br/>` +
                `<span style="color:${pal.hex}">${vn.isMem ? "✓ Memorised (Merkaba)" : "○ Remaining Verse"}</span> · Tap to listen &amp; inspect`,
            });
          }
        }
      }

      // 3. Render 3D Celebration Particle Bursts
      for (let i = bursts.length - 1; i >= 0; i--) {
        const pt = bursts[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.z += pt.vz;
        pt.vx *= 0.96; pt.vy *= 0.96; pt.vz *= 0.96;
        pt.life -= 0.022;
        if (pt.life <= 0) {
          bursts.splice(i, 1);
          continue;
        }
        const pr = projectPoint(pt.x, pt.y, pt.z, cosY, sinY, cosP, sinP, fov, cx, cy);
        if (!pr) continue;
        const [r, g, b] = pt.rgb;
        ctx.fillStyle = `rgba(${r},${g},${b},${pt.life})`;
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, Math.max(1.2, pt.size * pr.scale * pt.life), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // Hook external scope & playback events
    const onScopeUpdated = () => {
      syncScopeBtn();
      populateChapterSelect();
      updateTelemetry();
      if (mode === "macro") computeMacroTargets();
    };

    const onPlaybackUpdated = (ch, v) => {
      if (mode === "chapter" && ch === activeCh && v) {
        activeVerse = v;
        const vn = verseNodes[v - 1];
        if (vn) {
          cam.targetTx = vn.x;
          cam.targetTy = vn.y;
          cam.targetTz = vn.z;
        }
        renderInspectorCard();
      } else if (mode === "chapter") {
        renderInspectorCard();
      }
    };

    // Initial boot of visualiser
    syncScopeBtn();
    populateChapterSelect();
    updateTelemetry();
    computeMacroTargets();
    resizeCanvas();
    if (initialCh) {
      enterChapterMode(initialCh, 1);
    }
    rafId = requestAnimationFrame(renderFrame);

    activeCleanup = () => {
      stopTour();
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resizeCanvas);
    };

    return { onScopeUpdated, onPlaybackUpdated };
  }

  window.QuranVisualiser = {
    mount: mountVisualiser,
    unmount: stopActiveVisualiser,
  };
})();
