(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Orbit Explorer — Solar System Game
   *  Static, no build step, runs on GitHub Pages.
   * ------------------------------------------------------------------ */

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const SECONDS_PER_YEAR = 12; // real seconds for one Earth year at 1x speed
  const MAX_ORBIT = 380;
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const hash = (n) => {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  const radians = (deg) => (deg * Math.PI) / 180;

  /* ----------------------------- State ----------------------------- */

  const sim = {
    time: 0,
    speed: 1,
    playing: true,
    zoom: 1,
    pan: { x: 0, y: 0 },
    selected: null,
  };

  const launch = {
    targetId: "mars",
    projectile: null,
    angleDeg: 0,
    power: 60,
    hits: 0,
    misses: 0,
    status: "",
  };

  const quiz = {
    active: false,
    questions: [],
    index: 0,
    score: 0,
    answered: false,
    selected: null,
  };

  let mode = "explore";
  let cssW = 0;
  let cssH = 0;
  let fitScale = 1;
  let scale = 1;
  let stars = [];
  let effects = [];
  let muted = false;
  let audioCtx = null;

  // Give every planet a stable starting angle so the system looks alive.
  PLANETS.forEach((p, i) => {
    p.startAngle = (i * 0.72 + 0.15) % TAU;
  });

  /* --------------------------- Planet math -------------------------- */

  function planetPos(p) {
    const angle = p.startAngle + (TAU * sim.time) / (p.periodYears * SECONDS_PER_YEAR);
    return { x: p.orbit * Math.cos(angle), y: p.orbit * Math.sin(angle), angle };
  }

  function earthPos() {
    return planetPos(PLANETS.find((p) => p.id === "earth"));
  }

  function worldToScreen(x, y) {
    return {
      x: cssW / 2 + (x - sim.pan.x) * scale,
      y: cssH / 2 + (y - sim.pan.y) * scale,
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: sim.pan.x + (sx - cssW / 2) / scale,
      y: sim.pan.y + (sy - cssH / 2) / scale,
    };
  }

  /* --------------------------- Resize / stars ----------------------- */

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fitScale = (Math.min(cssW, cssH) / 2 - 18) / (MAX_ORBIT + 30);
    regenerateStars();
  }

  function regenerateStars() {
    const count = Math.floor((cssW * cssH) / 2200);
    stars = Array.from({ length: count }, (_, i) => ({
      x: hash(i) * cssW,
      y: hash(i + 9999) * cssH,
      r: 0.4 + hash(i + 5555) * 1.3,
      tw: 0.3 + hash(i + 1111) * 0.7,
      ph: hash(i + 3333) * TAU,
    }));
  }

  /* ------------------------------ Sound ----------------------------- */

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function beep(freq, dur = 0.12, type = "sine", vol = 0.06) {
    if (muted || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  }

  /* ---------------------------- Navigation -------------------------- */

  document.addEventListener("pointerdown", ensureAudio, { once: true });

  function setMode(next) {
    mode = next;
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === next));
    $("#explore-panel").classList.toggle("hidden", next !== "explore");
    $("#quiz-panel").classList.toggle("hidden", next !== "quiz");
    $("#launch-panel").classList.toggle("hidden", next !== "launch");
    $("#overlay").classList.add("hidden");

    if (next === "explore") {
      sim.playing = true;
      $("#playBtn").textContent = "⏸ Pause";
      if (!sim.selected) toast("Click any planet to learn more!");
    }
    if (next === "quiz") {
      quiz.active = false;
      $("#quizBody").hidden = true;
      $("#quizFinish").hidden = true;
      $("#quizIntro").hidden = false;
      const best = localStorage.getItem("orbit-best-score");
      if (best) {
        $("#bestScore").hidden = false;
        $("#bestScoreVal").textContent = `${best}/10`;
      }
    }
    if (next === "launch") {
      sim.playing = true;
      $("#playBtn").textContent = "⏸ Pause";
      setLaunchStatus("Pick a target and fire when ready.");
      autoAim();
    }
  }

  $$(".tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  $("#muteBtn").addEventListener("click", () => {
    muted = !muted;
    $("#muteBtn").textContent = muted ? "🔇" : "🔊";
    beep(440, 0.08);
  });

  /* ------------------------------ Toast ----------------------------- */

  let toastTimer = null;
  function toast(msg, ms = 2400) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), ms);
  }

  /* --------------------------- Explore UI --------------------------- */

  $("#speedRange").addEventListener("input", (e) => {
    sim.speed = parseFloat(e.target.value);
    $("#speedOut").textContent = sim.speed.toFixed(1) + "×";
  });

  $("#playBtn").addEventListener("click", () => {
    sim.playing = !sim.playing;
    $("#playBtn").textContent = sim.playing ? "⏸ Pause" : "▶ Play";
    beep(sim.playing ? 520 : 320, 0.08);
  });

  $("#resetTimeBtn").addEventListener("click", () => {
    sim.time = 0;
    sim.selected = null;
    $("#infoCard").hidden = true;
    beep(600, 0.1);
  });

  $("#closeInfo").addEventListener("click", () => {
    sim.selected = null;
    $("#infoCard").hidden = true;
  });

  function selectPlanet(p) {
    sim.selected = p;
    $("#infoCard").hidden = false;
    $("#infoEmoji").textContent = p.emoji;
    $("#infoName").textContent = p.name;
    $("#infoType").textContent = p.type;
    $("#infoDistance").textContent = p.distance;
    $("#infoDiameter").textContent = p.diameter;
    $("#infoYear").textContent = p.year;
    $("#infoDay").textContent = p.day;
    $("#infoMoons").textContent = p.moons;
    $("#infoBlurb").textContent = p.blurb;
    beep(600 + configFor(p.id).note, 0.1);
  }

  function configFor(id) {
    const notes = { mercury: 160, venus: 180, earth: 200, mars: 240, jupiter: 300, saturn: 360, uranus: 440, neptune: 520 };
    return { note: notes[id] || 200 };
  }

  /* ------------------------------- Quiz ----------------------------- */

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  $("#startQuizBtn").addEventListener("click", () => startQuiz());
  $("#quizAgainBtn").addEventListener("click", () => startQuiz());
  $("#quizBackBtn").addEventListener("click", () => setMode("explore"));

  function startQuiz() {
    quiz.active = true;
    quiz.score = 0;
    quiz.index = 0;
    quiz.answered = false;
    quiz.questions = shuffle(QUIZ_QUESTIONS).slice(0, 10);
    $("#quizIntro").hidden = true;
    $("#quizFinish").hidden = true;
    $("#quizBody").hidden = false;
    renderQuestion();
  }

  function renderQuestion() {
    const item = quiz.questions[quiz.index];
    quiz.answered = false;
    quiz.selected = null;

    $("#quizQuestionNum").textContent = `Q${quiz.index + 1} / ${quiz.questions.length}`;
    $("#quizScore").textContent = `Score: ${quiz.score}`;
    $("#quizProgress").style.width = `${(quiz.index / quiz.questions.length) * 100}%`;
    $("#quizQuestion").textContent = item.q;
    $("#quizFeedback").textContent = "";
    $("#quizNextBtn").hidden = true;

    const options = item.options.map((text, i) => ({ text, original: i }));
    const shuffled = shuffle(options);

    const box = $("#quizOptions");
    box.innerHTML = "";
    shuffled.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "option";
      b.textContent = opt.text;
      b.dataset.original = String(opt.original);
      b.addEventListener("click", () => answerQuestion(opt.original));
      box.appendChild(b);
    });
  }

  function answerQuestion(originalIdx) {
    if (quiz.answered) return;
    const item = quiz.questions[quiz.index];
    quiz.answered = true;
    quiz.selected = originalIdx;

    const buttons = $$(".option");
    buttons.forEach((b) => (b.disabled = true));

    const answerIsCorrect = originalIdx === item.answer;
    buttons.forEach((b) => {
      const oi = Number(b.dataset.original);
      if (oi === item.answer) b.classList.add("correct");
      else if (oi === originalIdx && !answerIsCorrect) b.classList.add("wrong");
    });

    if (answerIsCorrect) {
      quiz.score++;
      $("#quizFeedback").textContent = `✅ Correct! ${item.explain}`;
      $("#quizFeedback").style.color = "var(--success)";
      beep(880, 0.14, "triangle");
    } else {
      $("#quizFeedback").textContent = `❌ ${item.explain}`;
      $("#quizFeedback").style.color = "var(--danger)";
      beep(180, 0.16, "sawtooth");
    }

    $("#quizScore").textContent = `Score: ${quiz.score}`;
    $("#quizProgress").style.width = `${((quiz.index + 1) / quiz.questions.length) * 100}%`;
    $("#quizNextBtn").hidden = false;
  }

  $("#quizNextBtn").addEventListener("click", () => {
    quiz.index++;
    if (quiz.index >= quiz.questions.length) return finishQuiz();
    renderQuestion();
  });

  function finishQuiz() {
    $("#quizBody").hidden = true;
    $("#quizFinish").hidden = false;

    const s = quiz.score;
    const best = parseInt(localStorage.getItem("orbit-best-score") || "0", 10);
    if (s > best) localStorage.setItem("orbit-best-score", String(s));

    let emoji, title;
    if (s >= 9) { emoji = "🏆"; title = "Space Genius!"; }
    else if (s >= 7) { emoji = "🌠"; title = "Mission Commander!"; }
    else if (s >= 5) { emoji = "🚀"; title = "Cadet, good work!"; }
    else if (s >= 3) { emoji = "🔭"; title = "Keep looking up!"; }
    else { emoji = "☄️"; title = "A bumpy orbit..."; }

    $("#finishEmoji").textContent = emoji;
    $("#finishTitle").textContent = title;
    $("#finishStats").textContent = `You scored ${s} / ${quiz.questions.length}. ${s > best ? "New best score! 🎉" : `Best: ${best}/10`}`;
    beep(s >= 7 ? 1200 : 600, 0.2, "triangle");
  }

  /* ---------------------------- Launch UI --------------------------- */

  const targetSelect = $("#targetSelect");
  PLANETS.forEach((p) => {
    if (p.id === "earth") return;
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    targetSelect.appendChild(o);
  });
  targetSelect.value = "mars";

  targetSelect.addEventListener("change", () => {
    launch.targetId = targetSelect.value;
    autoAim();
    setLaunchStatus("Target locked. Tune angle and power.");
  });

  $("#angleRange").addEventListener("input", (e) => {
    launch.angleDeg = parseFloat(e.target.value);
    $("#angleVal").textContent = `${launch.angleDeg}°`;
  });

  $("#powerRange").addEventListener("input", (e) => {
    launch.power = parseFloat(e.target.value);
    $("#powerVal").textContent = launch.power;
  });

  $("#predictedToggle").addEventListener("change", () => {});

  $("#autoAimBtn").addEventListener("click", () => {
    autoAim();
    setLaunchStatus("Auto-aimed toward the current target.");
  });

  $("#launchBtn").addEventListener("click", () => fireRocket());
  $("#resetLaunchBtn").addEventListener("click", () => resetLaunch());

  function targetPlanet() {
    return PLANETS.find((p) => p.id === launch.targetId);
  }

  function autoAim() {
    const e = earthPos();
    const t = planetPos(targetPlanet());
    let deg = (Math.atan2(e.y - t.y, t.x - e.x) * 180) / Math.PI;
    deg = (deg + 360) % 360;
    launch.angleDeg = deg;
    $("#angleRange").value = deg;
    $("#angleVal").textContent = `${Math.round(deg)}°`;
  }

  function setLaunchStatus(msg, cls = "") {
    launch.status = msg;
    const el = $("#launchStatus");
    el.textContent = msg;
    el.className = "status-line " + cls;
  }

  function fireRocket() {
    if (launch.projectile) {
      toast("A probe is already in flight!");
      return;
    }
    const e = earthPos();
    const dir = {
      x: Math.cos(radians(launch.angleDeg)),
      y: -Math.sin(radians(launch.angleDeg)),
    };
    const speed = 1.6 + launch.power * 3.4; // px/s
    launch.projectile = {
      x: e.x,
      y: e.y,
      vx: dir.x * speed,
      vy: dir.y * speed,
      trail: [],
      airtime: 0,
      from: "earth",
    };
    sim.playing = true;
    beep(280, 0.22, "sawtooth", 0.05);
    setLaunchStatus("🚀 Probe away!");
  }

  function resetLaunch() {
    launch.projectile = null;
    setLaunchStatus("Ready for the next mission.");
  }

  /* --------------------------- Input handling ----------------------- */

  let pointer = { down: false, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointer.down = true;
    pointer.moved = false;
    pointer.startX = pointer.lastX = e.offsetX;
    pointer.startY = pointer.lastY = e.offsetY;
    if (mode === "launch" && !launch.projectile) {
      aimFromPointer(e.offsetX, e.offsetY);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointer.down) return;
    const dx = e.offsetX - pointer.lastX;
    const dy = e.offsetY - pointer.lastY;
    pointer.lastX = e.offsetX;
    pointer.lastY = e.offsetY;
    if (Math.hypot(e.offsetX - pointer.startX, e.offsetY - pointer.startY) > 5) pointer.moved = true;

    if (mode === "launch" && !launch.projectile) {
      aimFromPointer(e.offsetX, e.offsetY);
      return;
    }
    sim.pan.x -= dx / scale;
    sim.pan.y -= dy / scale;
    canvas.classList.add("panning");
  });

  canvas.addEventListener("pointerup", (e) => {
    canvas.classList.remove("panning");
    pointer.down = false;
    if (mode === "explore" && !pointer.moved) {
      const w = screenToWorld(e.offsetX, e.offsetY);
      const hit = planetAt(w);
      if (hit) selectPlanet(hit);
    }
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0016);
    const before = screenToWorld(e.offsetX, e.offsetY);
    sim.zoom = clamp(sim.zoom * factor, 0.35, 6);
    const after = screenToWorld(e.offsetX, e.offsetY);
    sim.pan.x += before.x - after.x;
    sim.pan.y += before.y - after.y;
  }, { passive: false });

  function aimFromPointer(sx, sy) {
    const e = earthPos();
    const es = worldToScreen(e.x, e.y);
    const dx = sx - es.x;
    const dy = sy - es.y;
    if (Math.hypot(dx, dy) < 8) return;
    let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
    deg = (deg + 360) % 360;
    launch.angleDeg = deg;
    $("#angleRange").value = deg;
    $("#angleVal").textContent = `${Math.round(deg)}°`;
    canvas.classList.add("aiming");
  }

  function planetAt(w) {
    for (let i = PLANETS.length - 1; i >= 0; i--) {
      const p = PLANETS[i];
      const pos = planetPos(p);
      if (dist(w.x, w.y, pos.x, pos.y) <= p.radius + 12 / scale) return p;
    }
    return null;
  }

  window.addEventListener("resize", resize);

  /* ----------------------------- Main loop -------------------------- */

  let last = performance.now();

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05);

    if (sim.playing) sim.time += dt * sim.speed;
    updateLaunch(dt);
    updateEffects(dt);
    render();
    requestAnimationFrame(frame);
  }

  function updateLaunch(dt) {
    const proj = launch.projectile;
    if (!proj) return;

    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    proj.airtime += dt;
    proj.trail.unshift({ x: proj.x, y: proj.y });
    if (proj.trail.length > 110) proj.trail.pop();

    // Hit detection
    for (const p of PLANETS) {
      if (p.id === proj.from) continue;
      const pos = planetPos(p);
      if (dist(proj.x, proj.y, pos.x, pos.y) <= p.radius + 7) {
        launch.projectile = null;
        launch.hits++;
        effects.push({ x: pos.x, y: pos.y, r: 0, max: p.radius + 34, t: 0, life: 0.9 });
        beep(700, 0.28, "triangle");
        if (p.id === launch.targetId) {
          setLaunchStatus("🎯 Direct hit!", "ok");
          $("#hitsCount").textContent = launch.hits;
          showOverlay("🚀", "Mission accomplished!",
            `You hit ${p.name}. ${p.blurb}`,
            () => { resetLaunch(); autoAim(); });
        } else {
          setLaunchStatus(`Hit ${p.name} instead of ${targetPlanet().name}.`, "bad");
          $("#hitsCount").textContent = launch.hits;
        }
        return;
      }
    }

    if (Math.hypot(proj.x, proj.y) > 760 || proj.airtime > 30) {
      launch.projectile = null;
      launch.misses++;
      $("#missesCount").textContent = launch.misses;
      effects.push({ x: proj.x, y: proj.y, r: 0, max: 30, t: 0, life: 0.6 });
      setLaunchStatus("☄️ Probe lost in space.", "bad");
      beep(120, 0.2, "sawtooth");
    }
  }

  function updateEffects(dt) {
    effects.forEach((f) => (f.t += dt));
    effects = effects.filter((f) => f.t < f.life);
  }

  /* ----------------------------- Rendering -------------------------- */

  function render() {
    scale = fitScale * sim.zoom;
    ctx.clearRect(0, 0, cssW, cssH);

    // Background
    const bg = ctx.createRadialGradient(cssW / 2, cssH / 2, 30, cssW / 2, cssH / 2, Math.max(cssW, cssH));
    bg.addColorStop(0, "#0b1124");
    bg.addColorStop(1, "#04060f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    drawStars();
    if (mode !== "quiz") {
      drawBelt();
      if ($("#trailsToggle").checked) drawOrbits();
      drawSun();
      drawPlanets();
      if (mode === "launch") drawLaunchOverlay();
    }
    drawEffects();
    updateHud();
  }

  function drawStars() {
    const t = performance.now() / 1000;
    stars.forEach((s) => {
      const tw = 0.6 + 0.4 * Math.sin(t * s.tw + s.ph);
      ctx.globalAlpha = tw * 0.9;
      ctx.fillStyle = "#cfe0ff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawOrbits() {
    const sun = worldToScreen(0, 0);
    ctx.strokeStyle = "rgba(150,180,255,0.12)";
    ctx.lineWidth = 1;
    for (const p of PLANETS) {
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, p.orbit * scale, 0, TAU);
      ctx.stroke();
    }
  }

  function drawBelt() {
    const sun = worldToScreen(0, 0);
    const beltAngle = sim.time * 0.4;
    ctx.fillStyle = "rgba(200,195,180,0.35)";
    for (let i = 0; i < 90; i++) {
      const a = beltAngle + hash(i) * TAU;
      const r = 178 + hash(i + 700) * 22;
      const s = worldToScreen(r * Math.cos(a), r * Math.sin(a));
      const size = 1 + hash(i + 300) * 1.8;
      ctx.globalAlpha = 0.25 + hash(i + 100) * 0.35;
      ctx.beginPath();
      ctx.arc(s.x, s.y, size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSun() {
    const s = worldToScreen(0, 0);
    const r = 20 * scale;
    const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 3.2);
    glow.addColorStop(0, "rgba(255,220,120,0.55)");
    glow.addColorStop(1, "rgba(255,150,40,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 3.2, 0, TAU);
    ctx.fill();

    const body = ctx.createRadialGradient(s.x - r * 0.3, s.y - r * 0.3, r * 0.1, s.x, s.y, r);
    body.addColorStop(0, "#fff6d8");
    body.addColorStop(0.55, "#ffd94a");
    body.addColorStop(1, "#ff9a1f");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fill();
  }

  function drawPlanets() {
    const t = performance.now() / 1000;
    const showLabels = $("#labelsToggle").checked;
    const sorted = [...PLANETS].sort((a, b) => a.orbit - b.orbit);
    sorted.forEach((p, idx) => {
      const pos = planetPos(p);
      const s = worldToScreen(pos.x, pos.y);
      const r = Math.max(2.2, p.radius * scale);

      // Selection marker
      if (sim.selected && sim.selected.id === p.id) {
        ctx.strokeStyle = "rgba(255,207,92,0.95)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 8 / scale + 3, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Shadowed sphere
      const g = ctx.createRadialGradient(s.x - r * 0.35, s.y - r * 0.35, r * 0.1, s.x, s.y, r);
      g.addColorStop(0, lighten(p.color));
      g.addColorStop(1, p.color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.fill();

      if (p.ring) drawRing(s.x, s.y, r);
      if (p.id === "earth" && r > 4) drawMoon(s.x, s.y, r, t);

      if (showLabels && scale > 0.55 || (sim.selected && sim.selected.id === p.id)) {
        ctx.fillStyle = "rgba(232,238,255,0.85)";
        ctx.font = `${clamp(11 + r * 0.4, 11, 15)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(p.name, s.x, s.y + r + 5);
      }
    });
  }

  function drawMoon(cx, cy, r, t) {
    const a = t * 1.2 + 1.3;
    const mr = Math.max(2, r * 0.22);
    const mx = cx + Math.cos(a) * (r * 1.7 + 6);
    const my = cy + Math.sin(a) * (r * 1.7 + 6);
    ctx.fillStyle = "#cfd6e6";
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fill();
  }

  function drawRing(cx, cy, r) {
    ctx.strokeStyle = "rgba(230,205,154,0.85)";
    ctx.lineWidth = Math.max(1.5, r * 0.28);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.9, r * 0.62, -0.45, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(180,160,120,0.35)";
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 2.3, r * 0.75, -0.45, 0, TAU);
    ctx.stroke();
  }

  function drawLaunchOverlay() {
    const target = targetPlanet();
    const tp = planetPos(target);
    const ts = worldToScreen(tp.x, tp.y);
    const e = earthPos();
    const es = worldToScreen(e.x, e.y);
    const earth = PLANETS.find((p) => p.id === "earth");
    const tr = Math.max(2.2, target.radius * scale);

    // Target reticle
    ctx.strokeStyle = "rgba(110,168,255,0.9)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(ts.x, ts.y, tr + 5, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,93,93,0.9)";
    ctx.beginPath();
    ctx.moveTo(ts.x - 9, ts.y);
    ctx.lineTo(ts.x + 9, ts.y);
    ctx.moveTo(ts.x, ts.y - 9);
    ctx.lineTo(ts.x, ts.y + 9);
    ctx.stroke();

    if ($("#predictedToggle").checked && !launch.projectile) {
      const dir = {
        x: Math.cos(radians(launch.angleDeg)),
        y: -Math.sin(radians(launch.angleDeg)),
      };
      const speed = 1.6 + launch.power * 3.4;
      const travel = speed * 4;
      ctx.strokeStyle = "rgba(255,207,92,0.65)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.moveTo(es.x, es.y);
      ctx.lineTo(es.x + dir.x * travel * scale, es.y + dir.y * travel * scale);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow tip
      ctx.fillStyle = "rgba(255,207,92,0.9)";
      const tipX = es.x + dir.x * travel * scale;
      const tipY = es.y + dir.y * travel * scale;
      ctx.save();
      ctx.translate(tipX, tipY);
      ctx.rotate(Math.atan2(dir.y, dir.x));
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-2, 5);
      ctx.lineTo(-2, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Projectile
    const proj = launch.projectile;
    if (proj) {
      proj.trail.forEach((pt, i) => {
        const s = worldToScreen(pt.x, pt.y);
        ctx.globalAlpha = 0.5 * (1 - i / proj.trail.length);
        ctx.fillStyle = "#ffcf5c";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.6, 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      const s = worldToScreen(proj.x, proj.y);
      const ang = Math.atan2(proj.vy, proj.vx);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(ang);
      ctx.fillStyle = "#e8eeff";
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, 5);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-6, -5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawEffects() {
    effects.forEach((f) => {
      const p = f.t / f.life;
      const s = worldToScreen(f.x, f.y);
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = "#ffcf5c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, (f.max * p) * scale, 0, TAU);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function lighten(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) + 70, 0, 255);
    const g = clamp(((n >> 8) & 255) + 70, 0, 255);
    const b = clamp((n & 255) + 70, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function updateHud() {
    const year = sim.time.toFixed(2);
    const earth = PLANETS.find((p) => p.id === "earth");
    const speed = sim.speed.toFixed(1);
    let html = `<span>Year <strong>${year}</strong> · ${speed}×</span>`;
    if (mode === "launch") {
      const target = targetPlanet();
      html += `<span>Target <strong>${target.name}</strong></span>`;
      const earthP = earthPos();
      const tp = planetPos(target);
      const d = Math.round(dist(earthP.x, earthP.y, tp.x, tp.y));
      html += `<span>Distance <strong>${d} km</strong></span>`;
    }
    $("#hud").innerHTML = html;
  }

  /* --------------------------- Overlay ----------------------------- */

  function showOverlay(emoji, title, text, onContinue) {
    $("#overlayEmoji").textContent = emoji;
    $("#overlayTitle").textContent = title;
    $("#overlayText").textContent = text;
    $("#overlay").classList.remove("hidden");
    const btn = $("#overlayBtn");
    btn.onclick = () => {
      $("#overlay").classList.add("hidden");
      onContinue && onContinue();
      beep(520, 0.1);
    };
  }

  /* ------------------------------ Init ----------------------------- */

  resize();
  setMode("explore");
  $("#angleVal").textContent = "0°";
  $("#powerVal").textContent = launch.power;
  $("#hitsCount").textContent = "0";
  $("#missesCount").textContent = "0";
  requestAnimationFrame(frame);
})();
