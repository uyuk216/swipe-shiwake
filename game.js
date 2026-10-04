"use strict";

(() => {
  const GAME_SECONDS = 20;
  const RULE_SECONDS = 4.15;
  const FIRST_ITEM_SECONDS = 2.5;
  const MIN_ITEM_SECONDS = 0.8;
  const MISS_RESOLVE_SECONDS = 0.2;
  const NEXT_ITEM_DELAY = 0.04;
  const STORAGE_KEY = "bakusoku-swipe-sort-best-v1";
  const MAX_PARTICLES = 120;
  const MAX_FLOATERS = 14;
  const SWIPE_THRESHOLD = 34;

  const RULES = [
    {
      left: "食べ物",
      right: "食べられない",
      items: [
        { label: "りんご", shape: "apple", color: "#ff5a83", side: "left" },
        { label: "パン", shape: "bread", color: "#ffc56f", side: "left" },
        { label: "おにぎり", shape: "rice", color: "#e7f4ee", side: "left" },
        { label: "ケーキ", shape: "cake", color: "#ff8bd0", side: "left" },
        { label: "くぎ", shape: "nail", color: "#aeb8d4", side: "right" },
        { label: "本", shape: "book", color: "#6eabff", side: "right" },
        { label: "電池", shape: "battery", color: "#b084ff", side: "right" },
        { label: "石", shape: "hex", color: "#aeb8c7", side: "right" },
      ],
    },
    {
      left: "赤",
      right: "青",
      items: [
        { label: "赤い丸", shape: "circle", color: "#ff4f70", side: "left" },
        { label: "青い箱", shape: "square", color: "#42c9ff", side: "right" },
        { label: "赤い三角", shape: "triangle", color: "#ff5a83", side: "left" },
        { label: "青いひし形", shape: "diamond", color: "#4b8dff", side: "right" },
        { label: "赤い六角", shape: "hex", color: "#ff657f", side: "left" },
        { label: "青い丸", shape: "circle", color: "#36d5eb", side: "right" },
      ],
    },
    {
      left: "偶数",
      right: "奇数",
      items: [2, 7, 4, 9, 6, 3, 8, 5].map((value) => ({
        label: String(value),
        subtitle: "この数はどっち？",
        shape: "number",
        color: value % 2 === 0 ? "#ff79ca" : "#6ccfff",
        value,
        side: value % 2 === 0 ? "left" : "right",
      })),
    },
  ];

  const stage = document.getElementById("stage");
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const hud = document.getElementById("hud");
  const scoreValue = document.getElementById("score-value");
  const timeValue = document.getElementById("time-value");
  const comboValue = document.getElementById("combo-value");
  const comboStat = document.getElementById("combo-stat");
  const timerFill = document.getElementById("timer-fill");
  const leftRule = document.getElementById("left-rule");
  const rightRule = document.getElementById("right-rule");
  const ruleAlert = document.getElementById("rule-alert");
  const ruleAlertTitle = document.getElementById("rule-alert-title");
  const ruleAlertCopy = document.getElementById("rule-alert-copy");
  const swipeHint = document.getElementById("swipe-hint");
  const titlePanel = document.getElementById("title-panel");
  const resultPanel = document.getElementById("result-panel");
  const startButton = document.getElementById("start-button");
  const restartButton = document.getElementById("restart-button");
  const shareButton = document.getElementById("share-button");
  const shareStatus = document.getElementById("share-status");
  const shareFallback = document.getElementById("share-fallback");

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = 1;
  let screen = "title";
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let bestScore = readBestScore();
  let timeLeft = GAME_SECONDS;
  let currentRuleIndex = 0;
  let activeItem = null;
  let resolving = null;
  let spawnIn = 0;
  let hitStop = 0;
  let shakePower = 0;
  let flashPower = 0;
  let flashColor = "#fff";
  let clock = 0;
  let lastFrame = 0;
  let lastDisplayedTenths = -1;
  let audioContext = null;
  let pointerStart = null;
  const particles = [];
  const floaters = [];
  const ambient = Array.from({ length: 30 }, () => ({
    x: Math.random(),
    y: Math.random(),
    speed: 18 + Math.random() * 75,
    size: 0.5 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2,
  }));

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readBestScore() {
    try {
      const value = Number(window.localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    } catch {
      return 0;
    }
  }

  function saveBestScore(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
      return true;
    } catch {
      return false;
    }
  }

  function resizeCanvas() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function unlockAudio() {
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    } catch {
      audioContext = null;
    }
  }

  function tone(frequency, duration, type = "sine", volume = 0.08, delay = 0) {
    if (!audioContext || audioContext.state === "closed") return;
    try {
      const startAt = audioContext.currentTime + delay;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(clamp(frequency, 90, 1500), startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch {
      // Audio is optional; gameplay continues if a device rejects synthesis.
    }
  }

  function playStartSound() {
    tone(420, 0.12, "triangle", 0.055);
    tone(760, 0.16, "sine", 0.07, 0.075);
  }

  function playRuleSound() {
    tone(460, 0.16, "triangle", 0.07);
    tone(660, 0.17, "triangle", 0.075, 0.09);
    tone(920, 0.21, "sine", 0.08, 0.18);
  }

  function playHitSound(streak) {
    const level = clamp(streak, 0, 12);
    const base = 570 + level * 31;
    tone(base, 0.16, "sine", 0.07);
    tone(base * 1.48, 0.22, "triangle", 0.062, 0.045);
  }

  function playMissSound() {
    tone(235, 0.19, "sawtooth", 0.055);
    tone(112, 0.23, "triangle", 0.045, 0.055);
  }

  function vibrate(pattern) {
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
    } catch {
      // Haptics are optional and must never interrupt a round.
    }
  }

  function setRuleDisplay(index) {
    const rule = RULES[index];
    leftRule.textContent = rule.left;
    rightRule.textContent = rule.right;
  }

  function showRuleAlert(title, copy, durationClass = "is-active") {
    ruleAlertTitle.textContent = title;
    ruleAlertCopy.textContent = copy;
    ruleAlert.classList.remove("is-active");
    void ruleAlert.offsetWidth;
    ruleAlert.classList.add(durationClass);
    if (durationClass !== "is-active") ruleAlert.classList.remove(durationClass);
  }

  function hidePanels() {
    titlePanel.hidden = true;
    resultPanel.hidden = true;
  }

  function startGame() {
    unlockAudio();
    screen = "play";
    pointerStart = null;
    score = 0;
    combo = 0;
    maxCombo = 0;
    timeLeft = GAME_SECONDS;
    currentRuleIndex = 0;
    activeItem = null;
    resolving = null;
    spawnIn = 0.08;
    hitStop = 0;
    shakePower = 0;
    flashPower = 0;
    particles.length = 0;
    floaters.length = 0;
    lastDisplayedTenths = -1;
    setRuleDisplay(currentRuleIndex);
    scoreValue.textContent = "000";
    comboValue.textContent = "×0";
    comboStat.classList.remove("is-hot");
    hud.classList.remove("is-danger");
    timerFill.style.transform = "scaleX(1)";
    hud.hidden = false;
    swipeHint.hidden = false;
    hidePanels();
    showRuleAlert("まずはコレ！", `${RULES[0].left} ←  |  → ${RULES[0].right}`);
    playStartSound();
    lastFrame = performance.now();
  }

  function updateRuleForNextItem() {
    const elapsed = GAME_SECONDS - timeLeft;
    const nextIndex = Math.floor(elapsed / RULE_SECONDS) % RULES.length;
    if (nextIndex === currentRuleIndex) return;
    currentRuleIndex = nextIndex;
    setRuleDisplay(currentRuleIndex);
    const rule = RULES[currentRuleIndex];
    showRuleAlert("ルールチェンジ！", `${rule.left} ←  |  → ${rule.right}`);
    flashColor = "#c477ff";
    flashPower = Math.max(flashPower, 0.17);
    addBurst(width / 2, height * 0.38, "#c477ff", 18, 3.8);
    playRuleSound();
    vibrate([14, 25, 14]);
  }

  function pace() {
    return clamp(1 - timeLeft / GAME_SECONDS, 0, 1);
  }

  function spawnItem() {
    updateRuleForNextItem();
    const ruleIndex = currentRuleIndex;
    const options = RULES[ruleIndex].items;
    const template = options[Math.floor(Math.random() * options.length)];
    const p = pace();
    const life = Math.max(MIN_ITEM_SECONDS, FIRST_ITEM_SECONDS - 1.7 * Math.pow(p, 1.55));
    activeItem = { ...template, ruleIndex, age: 0, life, seed: Math.random() * 10 };
  }

  function addParticle(particle) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(particle);
  }

  function addBurst(x, y, color, count, force) {
    for (let index = 0; index < count && particles.length < MAX_PARTICLES; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.35;
      const speed = force * (0.42 + Math.random() * 0.9);
      addParticle({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.34 + Math.random() * 0.35,
        age: 0,
        size: 2 + Math.random() * 5,
        color,
        spin: (Math.random() - 0.5) * 12,
        rotation: Math.random() * Math.PI,
        shape: Math.random() > 0.56 ? "square" : "dot",
      });
    }
  }

  function addFloater(text, x, y, color, size = 24, life = 0.66) {
    if (floaters.length >= MAX_FLOATERS) floaters.shift();
    floaters.push({ text, x, y, color, size, life, age: 0 });
  }

  function clearItem(correct, side, source = activeItem) {
    if (!source || source !== activeItem || screen !== "play") return;
    pointerStart = null;
    const centerX = width / 2;
    const centerY = height * (0.54 + clamp(source.age / source.life, 0, 1) * 0.07);
    activeItem = null;
    resolving = { item: source, side, correct, age: 0, duration: correct ? 0.16 : MISS_RESOLVE_SECONDS, centerX, centerY };
    spawnIn = NEXT_ITEM_DELAY;

    if (correct) {
      score += 1;
      combo += 1;
      maxCombo = Math.max(maxCombo, combo);
      scoreValue.textContent = String(score).padStart(3, "0");
      comboValue.textContent = `×${combo}`;
      comboStat.classList.toggle("is-hot", combo >= 5);
      const hue = (318 + Math.min(combo, 12) * 10) % 360;
      const hitColor = `hsl(${hue} 100% 72%)`;
      addBurst(centerX + (side === "left" ? -width * 0.08 : width * 0.08), centerY, hitColor, 20 + Math.min(combo, 10), 170 + Math.min(combo, 12) * 9);
      addFloater(combo > 1 ? `+1  ×${combo}` : "+1", centerX, centerY - 56, hitColor, combo > 1 ? 26 : 30, 0.72);
      hitStop = 0.045;
      shakePower = Math.max(shakePower, reducedMotion ? 1.5 : 6 + Math.min(combo, 9) * 0.9);
      flashColor = hitColor;
      flashPower = Math.max(flashPower, 0.13);
      playHitSound(combo);
      vibrate(combo >= 5 ? [12, 28, 12] : 11);
    } else {
      combo = 0;
      comboValue.textContent = "×0";
      comboStat.classList.remove("is-hot");
      timeLeft = Math.max(0, timeLeft - 0.8);
      addBurst(centerX, centerY, "#ff496a", 34, 235);
      addFloater("ミス  −0.8秒", centerX, centerY - 56, "#ff8da0", 21, 0.76);
      shakePower = Math.max(shakePower, reducedMotion ? 2 : 12);
      flashColor = "#ff315f";
      flashPower = Math.max(flashPower, 0.32);
      playMissSound();
      vibrate([35, 20, 35]);
    }
  }

  function answer(side) {
    if (screen !== "play" || !activeItem) return;
    clearItem(side === activeItem.side, side, activeItem);
  }

  function endGame() {
    if (screen !== "play") return;
    screen = "result";
    activeItem = null;
    resolving = null;
    spawnIn = 0;
    hud.hidden = true;
    swipeHint.hidden = true;
    const isRecord = score > bestScore;
    if (isRecord) {
      bestScore = score;
      saveBestScore(bestScore);
      addBurst(width / 2, height * 0.43, "#ffe36f", 42, 210);
      tone(740, 0.2, "triangle", 0.07);
      tone(1040, 0.28, "sine", 0.08, 0.1);
    } else {
      tone(520, 0.14, "sine", 0.05);
    }
    document.getElementById("result-score").textContent = String(score);
    document.getElementById("result-combo").textContent = `×${maxCombo}`;
    document.getElementById("best-score").textContent = String(bestScore);
    shareStatus.textContent = "";
    shareFallback.hidden = true;
    resultPanel.hidden = false;
  }

  function updateHud() {
    const tenths = Math.ceil(Math.max(0, timeLeft) * 10);
    if (tenths !== lastDisplayedTenths) {
      timeValue.textContent = `${(tenths / 10).toFixed(1)}`;
      lastDisplayedTenths = tenths;
    }
    timerFill.style.transform = `scaleX(${clamp(timeLeft / GAME_SECONDS, 0, 1)})`;
    hud.classList.toggle("is-danger", timeLeft <= 5);
  }

  function update(dt) {
    clock += dt;
    if (screen === "play") {
      if (hitStop > 0) {
        hitStop = Math.max(0, hitStop - dt);
      } else {
        timeLeft = Math.max(0, timeLeft - dt);
        updateHud();
        if (timeLeft <= 0) {
          endGame();
        } else if (resolving) {
          resolving.age += dt;
          if (resolving.age >= resolving.duration) {
            resolving = null;
            spawnIn = NEXT_ITEM_DELAY;
          }
        } else if (activeItem) {
          activeItem.age += dt;
          if (activeItem.age >= activeItem.life) clearItem(false, "none", activeItem);
        } else {
          spawnIn -= dt;
          if (spawnIn <= 0) spawnItem();
        }
      }
    }

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.age += dt;
      if (particle.age >= particle.life) {
        particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.16, dt);
      particle.vy = particle.vy * Math.pow(0.28, dt) + 190 * dt;
      particle.rotation += particle.spin * dt;
    }
    for (let index = floaters.length - 1; index >= 0; index -= 1) {
      const floater = floaters[index];
      floater.age += dt;
      floater.y -= 39 * dt;
      if (floater.age >= floater.life) floaters.splice(index, 1);
    }

    shakePower = Math.max(0, shakePower - dt * (reducedMotion ? 22 : 31));
    flashPower = Math.max(0, flashPower - dt * 1.8);
  }

  function roundedRectPath(context, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function polygonPath(context, sides, radius, rotation = -Math.PI / 2) {
    context.beginPath();
    for (let index = 0; index < sides; index += 1) {
      const angle = rotation + (Math.PI * 2 * index) / sides;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  }

  function drawSymbol(item, cx, cy, size) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = item.color;
    ctx.strokeStyle = "#ffffffd9";
    ctx.lineWidth = Math.max(2, size * 0.045);
    ctx.lineJoin = "round";
    ctx.shadowColor = `${item.color}b8`;
    ctx.shadowBlur = 17;

    switch (item.shape) {
      case "apple": {
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.24);
        ctx.bezierCurveTo(-size * 0.23, -size * 0.49, -size * 0.57, -size * 0.35, -size * 0.47, size * 0.03);
        ctx.bezierCurveTo(-size * 0.38, size * 0.48, -size * 0.08, size * 0.51, 0, size * 0.39);
        ctx.bezierCurveTo(size * 0.15, size * 0.51, size * 0.43, size * 0.42, size * 0.49, size * 0.03);
        ctx.bezierCurveTo(size * 0.56, -size * 0.34, size * 0.22, -size * 0.47, 0, -size * 0.24);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(1, -size * 0.24); ctx.quadraticCurveTo(size * 0.03, -size * 0.48, size * 0.24, -size * 0.55); ctx.stroke();
        break;
      }
      case "bread":
        roundedRectPath(ctx, -size * 0.48, -size * 0.34, size * 0.96, size * 0.72, size * 0.24);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#fff7d9"; ctx.lineWidth = size * 0.045;
        ctx.beginPath(); ctx.moveTo(-size * 0.27, -size * 0.02); ctx.quadraticCurveTo(0, -size * 0.22, size * 0.27, -size * 0.02); ctx.stroke();
        break;
      case "rice":
        polygonPath(ctx, 3, size * 0.51, -Math.PI / 2);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = "#273044";
        roundedRectPath(ctx, -size * 0.23, size * 0.16, size * 0.46, size * 0.22, size * 0.035); ctx.fill();
        break;
      case "cake":
        polygonPath(ctx, 3, size * 0.52, -Math.PI / 2);
        ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = "#fff1fa"; ctx.lineWidth = size * 0.05;
        ctx.beginPath(); ctx.moveTo(-size * 0.3, size * 0.14); ctx.lineTo(size * 0.3, size * 0.14); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -size * 0.2, size * 0.065, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
        break;
      case "nail":
        ctx.rotate(-Math.PI / 4);
        roundedRectPath(ctx, -size * 0.1, -size * 0.4, size * 0.2, size * 0.78, size * 0.1); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-size * 0.24, -size * 0.34); ctx.lineTo(size * 0.24, -size * 0.34); ctx.stroke();
        break;
      case "book":
        roundedRectPath(ctx, -size * 0.42, -size * 0.38, size * 0.84, size * 0.76, size * 0.1); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = "#ffffffb5";
        ctx.beginPath(); ctx.moveTo(-size * 0.22, -size * 0.26); ctx.lineTo(-size * 0.22, size * 0.25); ctx.moveTo(-size * 0.11, -size * 0.2); ctx.lineTo(size * 0.23, -size * 0.2); ctx.stroke();
        break;
      case "battery":
        roundedRectPath(ctx, -size * 0.34, -size * 0.36, size * 0.68, size * 0.74, size * 0.12); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = "#f6f1ff";
        roundedRectPath(ctx, -size * 0.12, -size * 0.47, size * 0.24, size * 0.12, size * 0.04); ctx.fill();
        ctx.fillRect(-size * 0.19, -size * 0.05, size * 0.38, size * 0.08);
        ctx.fillRect(-size * 0.04, -size * 0.2, size * 0.08, size * 0.38);
        break;
      case "square":
        roundedRectPath(ctx, -size * 0.39, -size * 0.39, size * 0.78, size * 0.78, size * 0.1); ctx.fill(); ctx.stroke();
        break;
      case "triangle":
        polygonPath(ctx, 3, size * 0.49); ctx.fill(); ctx.stroke();
        break;
      case "diamond":
        polygonPath(ctx, 4, size * 0.47, 0); ctx.fill(); ctx.stroke();
        break;
      case "hex":
        polygonPath(ctx, 6, size * 0.45); ctx.fill(); ctx.stroke();
        break;
      case "number": {
        const value = item.value;
        const cols = value <= 4 ? 2 : 3;
        const rows = Math.ceil(value / cols);
        const dot = size * (value > 6 ? 0.095 : 0.12);
        const gap = size * 0.29;
        const startX = -((Math.min(cols, value) - 1) * gap) / 2;
        const startY = -((rows - 1) * gap) / 2;
        ctx.shadowBlur = 11;
        for (let index = 0; index < value; index += 1) {
          const col = index % cols;
          const row = Math.floor(index / cols);
          ctx.beginPath();
          ctx.arc(startX + col * gap, startY + row * gap, dot, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "circle":
      default:
        ctx.beginPath(); ctx.arc(0, 0, size * 0.41, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
    }
    ctx.restore();
  }

  function drawBackdrop(dt) {
    const p = screen === "play" ? pace() : 0.1;
    const background = ctx.createLinearGradient(0, 0, width * 0.7, height);
    background.addColorStop(0, "#0e0b20");
    background.addColorStop(0.52, "#0a1020");
    background.addColorStop(1, "#111025");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.5, height * 0.48, 5, width * 0.5, height * 0.48, Math.max(width, height) * 0.68);
    glow.addColorStop(0, screen === "play" ? `rgba(79, 47, 130, ${0.17 + p * 0.12})` : "rgba(95, 45, 155, .2)");
    glow.addColorStop(0.48, "rgba(20, 48, 92, .11)");
    glow.addColorStop(1, "rgba(3, 3, 12, .72)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < ambient.length; index += 1) {
      const star = ambient[index];
      const travel = ((clock * (star.speed + p * 540) / Math.max(height, 1)) + star.y) % 1;
      const pulse = 0.35 + (Math.sin(clock * 2 + star.phase) + 1) * 0.22;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = index % 3 === 0 ? "#9a7dff" : "#8deeff";
      ctx.beginPath();
      ctx.arc(star.x * width, travel * height, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (screen === "play") {
      const railTop = height * 0.22;
      const railBottom = height * 0.83;
      const step = 24;
      const drift = (clock * (28 + p * 880)) % step;
      ctx.lineWidth = 1;
      for (const x of [width * 0.09, width * 0.91]) {
        const rail = ctx.createLinearGradient(x - 35, railTop, x + 35, railBottom);
        rail.addColorStop(0, "rgba(110, 112, 255, 0)");
        rail.addColorStop(0.5, `rgba(105, 123, 255, ${0.12 + p * 0.18})`);
        rail.addColorStop(1, "rgba(93, 219, 255, 0)");
        ctx.strokeStyle = rail;
        ctx.beginPath(); ctx.moveTo(x, railTop); ctx.lineTo(x, railBottom); ctx.stroke();
        for (let y = railTop - step + drift; y < railBottom; y += step) {
          const alpha = 0.06 + p * 0.26;
          ctx.strokeStyle = `rgba(131, 163, 255, ${alpha})`;
          ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.stroke();
        }
      }
    }

    if (flashPower > 0.005) {
      ctx.globalAlpha = flashPower;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  }

  function drawItemCard(item, centerX, centerY, progress, alpha = 1, exitSide = null, correct = false) {
    const cardWidth = Math.min(width * 0.75, 332);
    const cardHeight = item.shape === "number" ? 238 : 220;
    const p = clamp(progress, 0, 1);
    let scale = 0.91 + Math.sin(Math.min(1, p) * Math.PI * 0.5) * 0.075;
    let x = centerX;
    let y = centerY;
    let rotation = Math.sin(clock * 3.1 + item.seed) * 0.018;

    if (exitSide && correct) {
      const t = clamp(progress, 0, 1);
      x += (exitSide === "left" ? -1 : 1) * width * 0.95 * t;
      y -= 35 * t;
      rotation += (exitSide === "left" ? -1 : 1) * t * 0.18;
    } else if (exitSide) {
      const t = clamp(progress, 0, 1);
      scale *= 1 - t * 0.18;
      rotation += Math.sin(t * Math.PI * 8) * 0.065;
    }

    ctx.save();
    ctx.globalAlpha = alpha * (exitSide && correct ? 1 - p * 0.26 : 1 - (exitSide ? p * 0.43 : 0));
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);

    ctx.shadowColor = `${item.color}65`;
    ctx.shadowBlur = 40;
    roundedRectPath(ctx, -cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 27);
    const card = ctx.createLinearGradient(-cardWidth / 2, -cardHeight / 2, cardWidth / 2, cardHeight / 2);
    card.addColorStop(0, "#202038");
    card.addColorStop(0.56, "#151a2d");
    card.addColorStop(1, "#1c1730");
    ctx.fillStyle = card;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `${item.color}b5`;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.save();
    roundedRectPath(ctx, -cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 27);
    ctx.clip();
    const sheen = ctx.createLinearGradient(-cardWidth / 2, -cardHeight / 2, cardWidth / 2, cardHeight / 2);
    sheen.addColorStop(0, `${item.color}20`);
    sheen.addColorStop(0.44, "rgba(255,255,255,0)");
    sheen.addColorStop(1, "rgba(96, 127, 255, .10)");
    ctx.fillStyle = sheen;
    ctx.fillRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
    ctx.restore();

    const symbolSize = item.shape === "number" ? 66 : 72;
    const symbolY = item.shape === "number" ? -56 : -46;
    drawSymbol(item, 0, symbolY, symbolSize);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = `${item.color}78`;
    ctx.shadowBlur = 15;
    ctx.font = item.shape === "number" ? "900 36px system-ui, sans-serif" : `900 ${item.label.length > 5 ? 27 : 31}px system-ui, sans-serif`;
    ctx.fillText(item.label, 0, item.shape === "number" ? 24 : 46, cardWidth - 35);
    ctx.shadowBlur = 0;
    if (item.subtitle) {
      ctx.fillStyle = "#aaaac2";
      ctx.font = "800 11px system-ui, sans-serif";
      ctx.fillText(item.subtitle, 0, 83, cardWidth - 30);
    } else {
      ctx.fillStyle = "#9292aa";
      ctx.font = "800 10px system-ui, sans-serif";
      ctx.letterSpacing = "0.12em";
      ctx.fillText("どっちへ仕分ける？", 0, 84, cardWidth - 30);
    }

    ctx.restore();
  }

  function drawParticles() {
    for (const particle of particles) {
      const t = clamp(particle.age / particle.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = (1 - t) * (1 - t * 0.2);
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.fillStyle = particle.color;
      if (particle.shape === "square") {
        const size = particle.size * (1 - t * 0.45);
        ctx.fillRect(-size / 2, -size / 2, size, size);
      } else {
        ctx.beginPath(); ctx.arc(0, 0, particle.size * (1 - t * 0.45), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    for (const floater of floaters) {
      const t = clamp(floater.age / floater.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.sin((1 - t) * Math.PI * 0.5);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `1000 ${floater.size}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#10101dd9";
      ctx.strokeText(floater.text, floater.x, floater.y, width - 30);
      ctx.fillStyle = floater.color;
      ctx.shadowColor = floater.color;
      ctx.shadowBlur = 17;
      ctx.fillText(floater.text, floater.x, floater.y, width - 30);
      ctx.restore();
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shake = shakePower > 0 ? shakePower * (reducedMotion ? 0.25 : 1) : 0;
    const sx = shake ? (Math.random() - 0.5) * shake * 2 : 0;
    const sy = shake ? (Math.random() - 0.5) * shake * 1.5 : 0;
    stage.style.setProperty("--shake-x", `${sx.toFixed(1)}px`);
    stage.style.setProperty("--shake-y", `${sy.toFixed(1)}px`);

    ctx.save();
    drawBackdrop();
    ctx.translate(sx, sy);

    if (screen === "title") {
      drawItemCard({ label: "りんご", shape: "apple", color: "#ff5a83", seed: 0 }, width / 2, height * 0.61 + Math.sin(clock * 2) * 7, 0.7);
      ctx.save();
      ctx.globalAlpha = 0.48 + (Math.sin(clock * 3) + 1) * 0.12;
      ctx.strokeStyle = "#ff65bd";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(width / 2, height * 0.61, Math.min(width, height) * 0.36 + Math.sin(clock * 2) * 7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (activeItem) {
      const progress = clamp(activeItem.age / activeItem.life, 0, 1);
      const centerY = height * (0.54 + progress * 0.07);
      const p = pace();
      const trailCount = p > 0.68 ? Math.min(3, 1 + Math.floor((p - 0.68) * 8)) : 0;
      for (let index = trailCount; index > 0; index -= 1) {
        const t = index * (0.045 + p * 0.025);
        drawItemCard(activeItem, width / 2, centerY - t * height * 0.14, progress, 0.11 / index);
      }
      drawItemCard(activeItem, width / 2, centerY, progress);
      const ringRadius = Math.min(width * 0.43, 185);
      ctx.save();
      ctx.strokeStyle = `${activeItem.color}55`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(width / 2, centerY, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - progress));
      ctx.stroke();
      ctx.restore();
    } else if (resolving) {
      const progress = clamp(resolving.age / resolving.duration, 0, 1);
      drawItemCard(resolving.item, resolving.centerX, resolving.centerY, progress, 1, resolving.side, resolving.correct);
    } else if (screen === "result") {
      drawBurstRings();
    }

    drawParticles();
    ctx.restore();
  }

  function drawBurstRings() {
    for (let index = 0; index < 4; index += 1) {
      const phase = (clock * 0.38 + index * 0.25) % 1;
      ctx.globalAlpha = (1 - phase) * 0.32;
      ctx.strokeStyle = index % 2 ? "#56dfff" : "#ff59bc";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.47, phase * Math.min(width, height) * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function loop(timestamp) {
    const dt = lastFrame ? clamp((timestamp - lastFrame) / 1000, 0, 0.05) : 1 / 60;
    lastFrame = timestamp;
    try {
      update(dt);
      render();
    } finally {
      // Keep the game loop alive if a transient rendering or update error occurs.
      window.requestAnimationFrame(loop);
    }
  }

  function pointerDown(event) {
    if (screen !== "play" || !activeItem || pointerStart) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    try { stage.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
  }

  function pointerUp(event) {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    const startX = pointerStart.x;
    pointerStart = null;
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.12) {
      answer(dx < 0 ? "left" : "right");
    } else if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
      answer(startX < width / 2 ? "left" : "right");
    }
  }

  function pointerCancel(event) {
    if (pointerStart && event.pointerId !== pointerStart.id) return;
    pointerStart = null;
  }

  function onKeyDown(event) {
    if (screen !== "play" || event.repeat) return;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      event.preventDefault(); answer("left");
    } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      event.preventDefault(); answer("right");
    }
  }

  function shareText() {
    return `「爆速スワイプ仕分け」で${score}点！最大${maxCombo}コンボ。自己ベストは${bestScore}点。`;
  }

  function shareUrl() {
    if (!/^https?:$/.test(window.location.protocol)) return "";
    if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) return "";
    return window.location.href;
  }

  function shareMessage() {
    const url = shareUrl();
    const link = url ? `\n${url}` : "";
    return `${shareText()}${link}`;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const temporary = document.createElement("textarea");
    temporary.value = text;
    temporary.setAttribute("readonly", "");
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    temporary.style.pointerEvents = "none";
    document.body.appendChild(temporary);
    temporary.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { copied = false; }
    temporary.remove();
    return copied;
  }

  async function shareResult() {
    const message = shareMessage();
    shareStatus.textContent = "";
    shareFallback.hidden = true;
    if (typeof navigator.share === "function") {
      try {
        const payload = { title: "爆速スワイプ仕分け", text: shareText() };
        const url = shareUrl();
        if (url) payload.url = url;
        await navigator.share(payload);
        shareStatus.textContent = "シェアしました！";
        return;
      } catch {
        // A dismissed share sheet also falls through to the copy option.
      }
    }
    try {
      const copied = await copyText(message);
      if (copied) {
        shareStatus.textContent = "結果をコピーしました！";
        return;
      }
    } catch {
      // Show the exact share text below if clipboard access is unavailable.
    }
    shareFallback.value = message;
    shareFallback.hidden = false;
    shareFallback.focus();
    shareFallback.select();
    shareStatus.textContent = "共有文を選択しました。コピーしてシェアしてね。";
  }

  startButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", startGame);
  shareButton.addEventListener("click", shareResult);
  stage.addEventListener("pointerdown", pointerDown);
  stage.addEventListener("pointerup", pointerUp);
  stage.addEventListener("pointercancel", pointerCancel);
  stage.addEventListener("lostpointercapture", pointerCancel);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("orientationchange", resizeCanvas, { passive: true });
  window.addEventListener("contextmenu", (event) => event.preventDefault());

  resizeCanvas();
  lastFrame = performance.now();
  window.requestAnimationFrame(loop);
})();
