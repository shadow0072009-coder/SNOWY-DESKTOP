'use strict';

// Qor dvigateli. Tejamkor: 30 fps (kerak bo'lsa 20), 1x piksellik rasm,
// oldindan tayyorlangan spritelar va qayta ishlatiladigan gradientlar.
(() => {
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

  const COL_BASE = 18; // 1920x1080 uchun uyum ustuni kengligi (px)
  const DENSITY = { yengil: 70, orta: 150, kuchli: 300 };
  const WIND_MUL = { sokin: 0.45, orta: 1, kuchli: 2.1 };
  const CRYSTAL_Z = 0.55; // bundan yaqin parchalargina haqiqiy 6 qirrali shaklda
  const FRAME_MS = 1000 / 30; // maqsadli kadr chastotasi
  const FRAME_MS_SLOW = 1000 / 20; // og'ir holatda

  const settings = { density: 'orta', wind: 'orta', drift: true, aurora: false };

  let W = 1;
  let H = 1;
  let scale = 1; // ekran o'lchamiga moslash koeffitsiyenti (1080p = 1)
  let COL = COL_BASE;
  let colCount = 2;
  let heights = new Float32Array(2);
  let smoothHeights = new Float32Array(2);
  let caps = new Float32Array(2); // har ustunning tabiiy chegarasi — uyum notekis bo'lsin
  let maxHeight = 60;
  let groundTop = 0;
  let groundGradient = null;
  let driftDots = [];

  const flakes = [];
  const sparks = [];
  const mouse = { x: -1e5, y: -1e5, vx: 0, vy: 0, active: false, at: 0 };
  const storm = { timeLeft: 0, x: 0, y: 0 };

  const glowSprite = makeGlowSprite();
  const crystalSprites = makeCrystalSprites();

  const auroraBlobs = [
    { phase: 0.0, speed: 0.11, hue: 168 },
    { phase: 1.7, speed: 0.07, hue: 196 },
    { phase: 3.1, speed: 0.13, hue: 276 },
    { phase: 4.6, speed: 0.09, hue: 148 },
    { phase: 5.4, speed: 0.05, hue: 224 },
  ];

  function makeGlowSprite() {
    const size = 48;
    const surface = document.createElement('canvas');
    surface.width = size;
    surface.height = size;
    const c = surface.getContext('2d');
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    c.fill();
    return surface;
  }

  // Haqiqiy olti qirrali qor parchalari: 6 ta asosiy shox + yon shoxchalar.
  function makeCrystalSprites() {
    const size = 56;
    const variants = [
      { branchLen: 0.3, branchAt: [0.42, 0.72], width: 2.1 },
      { branchLen: 0.42, branchAt: [0.5], width: 2.4 },
      { branchLen: 0.22, branchAt: [0.34, 0.58, 0.82], width: 1.7 },
      { branchLen: 0.36, branchAt: [0.45, 0.75], width: 2.8, dots: true },
    ];

    return variants.map((variant) => {
      const surface = document.createElement('canvas');
      surface.width = size;
      surface.height = size;
      const c = surface.getContext('2d');
      const center = size / 2;
      const armLen = size * 0.44;
      const unit = size / 64;

      c.translate(center, center);
      c.strokeStyle = 'rgba(255,255,255,0.96)';
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.shadowColor = 'rgba(214,238,255,0.8)';
      c.shadowBlur = size * 0.06;

      for (let arm = 0; arm < 6; arm++) {
        c.save();
        c.rotate((Math.PI / 3) * arm);

        c.lineWidth = variant.width * unit;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(0, -armLen);
        c.stroke();

        for (const at of variant.branchAt) {
          const baseY = -armLen * at;
          const length = armLen * variant.branchLen * (1 - at * 0.45);
          for (const side of [-1, 1]) {
            c.beginPath();
            c.moveTo(0, baseY);
            c.lineTo(Math.sin(Math.PI / 3) * length * side, baseY - Math.cos(Math.PI / 3) * length);
            c.lineWidth = variant.width * unit * 0.7;
            c.stroke();
          }
        }

        if (variant.dots) {
          c.beginPath();
          c.arc(0, -armLen, size * 0.035, 0, Math.PI * 2);
          c.fillStyle = 'rgba(255,255,255,0.95)';
          c.fill();
        }

        c.restore();
      }

      c.beginPath();
      c.arc(0, 0, size * 0.055, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.96)';
      c.fill();

      return surface;
    });
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function resize() {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);

    // 1280x720 dan 4K gacha bir xil ko'rinish: parcha, uyum va oqim
    // o'lchamlari ekranga proporsional moslashadi.
    scale = clamp(Math.min(W / 1920, H / 1080), 0.55, 2);
    COL = Math.max(10, Math.round(COL_BASE * scale));
    // 1x rasm: shaffof to'liq ekranli qatlam uchun bu eng katta tejam.
    canvas.width = Math.round(W);
    canvas.height = Math.round(H);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    colCount = Math.max(2, Math.ceil(W / COL));
    heights = new Float32Array(colCount);
    smoothHeights = new Float32Array(colCount);
    // Uyum past va yupqa bo'lsin — pastdagi interfeysni to'smasin.
    maxHeight = Math.min(H * 0.045, 42 * scale);
    groundTop = 0;

    // Balandlik "profili": tekis parda emas, tepalik va ochiq joylar.
    caps = new Float32Array(colCount);
    const rough = new Float32Array(colCount);
    let walk = 0.62;
    for (let i = 0; i < colCount; i++) {
      walk = clamp(walk + (Math.random() - 0.5) * 0.42, 0.02, 1);
      rough[i] = walk;
    }
    for (let pass = 0; pass < 1; pass++) {
      for (let i = 0; i < colCount; i++) {
        const left = rough[i > 0 ? i - 1 : i];
        const right = rough[i < colCount - 1 ? i + 1 : i];
        smoothHeights[i] = rough[i] * 0.5 + left * 0.25 + right * 0.25;
      }
      rough.set(smoothHeights);
    }
    for (let i = 0; i < colCount; i++) {
      const value = rough[i];
      caps[i] = maxHeight * (value < 0.18 ? value * 0.35 : 0.22 + value * 0.9);
    }

    groundGradient = ctx.createLinearGradient(0, Math.max(0, H - maxHeight - 6), 0, H);
    groundGradient.addColorStop(0, 'rgba(228,242,255,0)');
    groundGradient.addColorStop(0.45, 'rgba(238,248,255,0.34)');
    groundGradient.addColorStop(1, 'rgba(246,251,255,0.58)');

    driftDots = [];
    const dots = Math.max(12, Math.round(W / (46 * scale)));
    for (let i = 0; i < dots; i++) {
      driftDots.push({ x: Math.random() * W, offset: 2 + Math.random() * 14, phase: Math.random() * 6.28 });
    }

    balance();
  }

  function targetCount() {
    const areaScale = clamp((W * H) / (1920 * 1080), 0.3, 2);
    return Math.round(DENSITY[settings.density] * areaScale);
  }

  function balance() {
    const target = targetCount();
    while (flakes.length > target) flakes.pop();
    while (flakes.length < target) flakes.push(spawn({}, true));
  }

  function spawn(flake, initial) {
    // z — chuqurlik: 0 uzoq (kichik, sekin), 1 yaqin (katta, tez)
    const z = Math.pow(Math.random(), 0.85);
    flake.z = z;
    flake.r = (0.7 + z * 2.2) * scale;
    flake.x = Math.random() * W;
    flake.y = initial ? Math.random() * H : -14 - Math.random() * H * 0.25;
    flake.phase = Math.random() * Math.PI * 2;
    flake.sway = (8 + Math.random() * 24) * scale;
    flake.swaySpeed = 0.5 + Math.random() * 1.5;
    flake.alpha = 0.2 + z * 0.62;
    flake.vx = 0;
    flake.vy = (20 + z * 40) * scale;
    flake.kind = Math.floor(Math.random() * crystalSprites.length);
    flake.rot = Math.random() * Math.PI * 2;
    flake.spin = (Math.random() - 0.5) * 0.7;
    return flake;
  }

  function deposit(index, flake) {
    const add = (3.6 + flake.z * 2.2) * scale;
    heights[index] = Math.min(caps[index], heights[index] + add);
    if (index > 0) heights[index - 1] = Math.min(caps[index - 1], heights[index - 1] + add * 0.35);
    if (index < colCount - 1) heights[index + 1] = Math.min(caps[index + 1], heights[index + 1] + add * 0.35);
    if (index > 1) heights[index - 2] = Math.min(caps[index - 2], heights[index - 2] + add * 0.12);
    if (index < colCount - 2) heights[index + 2] = Math.min(caps[index + 2], heights[index + 2] + add * 0.12);
  }

  function updateFlakes(dt, time) {
    const windMul = WIND_MUL[settings.wind] || 1;
    const gust =
      Math.sin(time * 0.23) * 0.55 +
      Math.sin(time * 0.71 + 1.3) * 0.3 +
      Math.sin(time * 0.11 + 0.7) * 0.15;
    const windBase = (24 + gust * 34) * windMul * scale;

    // bo'ron kuchi asta so'nadi
    let stormPower = 0;
    if (storm.timeLeft > 0) {
      storm.timeLeft = Math.max(0, storm.timeLeft - dt);
      stormPower = Math.min(1, storm.timeLeft / 1.2);
    }

    // sichqoncha impulsi asta so'nadi
    const decay = Math.pow(0.1, dt);
    mouse.vx *= decay;
    mouse.vy *= decay;

    const radius = 200 * scale;
    const radius2 = radius * radius;
    const influence = 1 - Math.exp(-dt * 3.4);
    const stormRadius = 520 * scale;
    const stormRadius2 = stormRadius * stormRadius;

    for (let i = 0; i < flakes.length; i++) {
      const flake = flakes[i];
      const sway = Math.sin(time * flake.swaySpeed + flake.phase) * flake.sway * (0.35 + flake.z);
      let targetVx = windBase * (0.35 + flake.z * 0.9) + sway;
      let targetVy = (22 + flake.z * 88) * scale;

      if (mouse.active) {
        const dx = flake.x - mouse.x;
        const dy = flake.y - mouse.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < radius2) {
          const dist = Math.sqrt(dist2) || 1;
          const k = 1 - dist / radius;
          const strength = k * k;
          targetVx += (dx / dist) * 480 * strength + mouse.vx * 0.6 * strength;
          targetVy += (dy / dist) * 380 * strength + mouse.vy * 0.6 * strength;
        }
      }

      if (stormPower > 0) {
        const dx = flake.x - storm.x;
        const dy = flake.y - storm.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < stormRadius2) {
          const dist = Math.sqrt(dist2) || 1;
          const k = 1 - dist / stormRadius;
          const push = k * k * 1100 * scale * stormPower;
          targetVx += (dx / dist) * push;
          targetVy += (dy / dist) * push - 140 * k * stormPower * scale;
        }
        targetVy += 90 * stormPower * (0.4 + flake.z) * scale;
        targetVx += windBase * 1.6 * stormPower;
      }

      flake.vx += (targetVx - flake.vx) * influence;
      flake.vy += (targetVy - flake.vy) * influence;
      flake.x += flake.vx * dt;
      flake.y += flake.vy * dt;
      flake.rot += flake.spin * (0.4 + flake.z) * dt;

      if (flake.x < -40) flake.x = W + 40;
      else if (flake.x > W + 40) flake.x = -40;

      const column = clamp(Math.floor(flake.x / COL), 0, colCount - 1);
      const ground = H - heights[column];

      if (flake.y >= ground - flake.r) {
        // Uyumga qo'shildi va yangi parcha sifatida yuqoridan qayta boshlanadi
        // (aks holda parcha joyida qolib, har kadrda uyumni shishirib yuboradi).
        if (settings.drift) deposit(column, flake);
        spawn(flake, false);
      } else if (flake.y > H + 40) {
        spawn(flake, false);
      }
    }
  }

  let trimBudget = 0;

  function trimFlakes(dt) {
    const target = targetCount();
    if (flakes.length <= target) {
      trimBudget = 0;
      return;
    }
    trimBudget += dt * 120;
    while (trimBudget >= 1 && flakes.length > target) {
      flakes.pop();
      trimBudget -= 1;
    }
  }

  function updateGround(dt) {
    // Tezroq eriydi: uyum hech qachon devor bo'lib qolmaydi.
    const melt = (settings.drift ? 0.15 : 10) * dt;
    let top = 0;

    for (let i = 0; i < colCount; i++) {
      const h = heights[i] - melt;
      heights[i] = h > 0 ? h : 0;
    }

    for (let i = 0; i < colCount; i++) {
      const left = i > 0 ? heights[i - 1] : heights[i];
      const right = i < colCount - 1 ? heights[i + 1] : heights[i];
      const value = heights[i] * 0.66 + left * 0.17 + right * 0.17;
      smoothHeights[i] = value;
      if (value > top) top = value;
    }

    heights.set(smoothHeights);
    groundTop = top;
  }

  function updateSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i];
      spark.life -= dt;
      if (spark.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vx *= 1 - 2 * dt;
      spark.vy *= 1 - 2 * dt;
      spark.vy += 60 * dt;
    }
  }

  // Bo'ron: sichqoncha turgan joydan parchalar portlab chiqadi.
  function triggerStorm(point) {
    storm.timeLeft = 4.5;
    storm.x = point && typeof point.x === 'number' ? point.x : W / 2;
    storm.y = point && typeof point.y === 'number' ? point.y : H * 0.4;

    const burst = 100;
    for (let i = 0; i < burst; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (260 + Math.random() * 620) * scale;
      const flake = spawn({}, false);
      flake.x = storm.x + (Math.random() - 0.5) * 90 * scale;
      flake.y = storm.y + (Math.random() - 0.5) * 90 * scale;
      flake.vx = Math.cos(angle) * speed;
      flake.vy = Math.sin(angle) * speed;
      flakes.push(flake);
    }

    for (let i = 0; i < 36 && sparks.length < 120; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (120 + Math.random() * 420) * scale;
      sparks.push({
        x: storm.x,
        y: storm.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: (0.8 + Math.random() * 1.8) * scale,
        life: 0.5 + Math.random() * 0.7,
      });
    }
  }

  function traceGround() {
    ctx.beginPath();
    ctx.moveTo(-COL, H - heights[0]);
    for (let i = 0; i < colCount - 1; i++) {
      const x1 = i * COL + COL / 2;
      const y1 = H - heights[i];
      const x2 = (i + 1) * COL + COL / 2;
      const y2 = H - heights[i + 1];
      ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
    }
    ctx.lineTo(W + COL, H - heights[colCount - 1]);
  }

  function drawGround() {
    if (groundTop < 1) return;

    traceGround();
    ctx.lineTo(W + COL, H + 4);
    ctx.lineTo(-COL, H + 4);
    ctx.closePath();
    ctx.fillStyle = groundGradient;
    ctx.fill();

    // Yumshoq ustki qirra — uyum "pard" emas, yumaloq qor bo'lib ko'rinadi.
    traceGround();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Uyum ustidagi mayda yaltiroqlar.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < driftDots.length; i++) {
      const dot = driftDots[i];
      const column = clamp(Math.floor(dot.x / COL), 0, colCount - 1);
      const h = heights[column];
      if (h < 3) continue;
      const y = H - h + Math.min(dot.offset, h - 1);
      const size = 0.9 + 0.9 * (0.5 + 0.5 * Math.sin(dot.phase + h));
      ctx.fillRect(dot.x, y, size, size);
    }
  }

  // Yog'du (aurora) — ekran tepasida sekin suzuvchi, rang o'zgaruvchan nur.
  function drawAurora(time) {
    if (!settings.aurora) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const base = Math.max(W, H);

    for (let i = 0; i < auroraBlobs.length; i++) {
      const blob = auroraBlobs[i];
      const t = time * blob.speed + blob.phase;
      const x = (0.5 + 0.45 * Math.sin(t)) * W;
      const y = H * (0.08 + 0.055 * Math.sin(t * 1.7 + blob.phase));
      const radius = base * (0.3 + 0.07 * Math.sin(t * 0.9 + blob.phase));
      const hue = (blob.hue + time * 6) % 360;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `hsla(${hue}, 92%, 66%, 0.16)`);
      gradient.addColorStop(0.45, `hsla(${hue + 26}, 92%, 60%, 0.07)`);
      gradient.addColorStop(1, `hsla(${hue + 40}, 92%, 58%, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    ctx.restore();
  }

  function drawFlakes() {
    for (let i = 0; i < flakes.length; i++) {
      const flake = flakes[i];
      if (flake.y < -30 || flake.y > H + 30) continue;
      ctx.globalAlpha = flake.alpha;

      if (flake.z >= CRYSTAL_Z) {
        const size = flake.r * 6.2;
        ctx.save();
        ctx.translate(flake.x, flake.y);
        ctx.rotate(flake.rot);
        ctx.drawImage(crystalSprites[flake.kind], -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        const r = flake.r * 2.1;
        ctx.drawImage(glowSprite, flake.x - r, flake.y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSparks() {
    if (!sparks.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#dff1ff';
    for (let i = 0; i < sparks.length; i++) {
      const spark = sparks[i];
      ctx.globalAlpha = Math.min(1, spark.life * 2) * 0.85;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  let previous = 0;
  let frameGap = FRAME_MS;
  let slowStreak = 0;

  function frame(now) {
    requestAnimationFrame(frame);

    // Oyna ko'rinmasa (ish stoli boshqa oyna bilan qoplangan) — umuman chizmaymiz.
    if (document.hidden) {
      previous = 0;
      return;
    }

    if (!previous) {
      previous = now;
      return;
    }

    const elapsed = now - previous;
    if (elapsed < frameGap - 1.5) return;

    // Kadr vaqti cho'zilib ketsa, chastotani 20 fps ga tushiramiz.
    if (elapsed > 42) {
      slowStreak += 1;
      if (slowStreak > 45 && frameGap < FRAME_MS_SLOW) frameGap = FRAME_MS_SLOW;
    } else if (elapsed < 34 && slowStreak > 0) {
      slowStreak = 0;
    }

    let dt = elapsed / 1000;
    previous = now;
    if (dt > 0.05) dt = 0.05;

    const time = now / 1000;

    updateFlakes(dt, time);
    trimFlakes(dt);
    updateGround(dt);
    updateSparks(dt);

    ctx.clearRect(0, 0, W, H);
    drawAurora(time);
    drawGround();
    drawFlakes();
    drawSparks();
  }

  window.addEventListener(
    'mousemove',
    (event) => {
      const now = performance.now();
      const elapsed = Math.max(8, now - mouse.at) / 1000;

      if (mouse.x > -1e4) {
        const nvx = clamp((event.clientX - mouse.x) / elapsed, -4000, 4000);
        const nvy = clamp((event.clientY - mouse.y) / elapsed, -4000, 4000);
        mouse.vx = mouse.vx * 0.55 + nvx * 0.45;
        mouse.vy = mouse.vy * 0.55 + nvy * 0.45;
      }

      mouse.x = event.clientX;
      mouse.y = event.clientY;
      mouse.at = now;
      mouse.active = true;

      const speed = Math.hypot(mouse.vx, mouse.vy);
      if (speed > 700 && sparks.length < 80 && Math.random() < 0.5) {
        sparks.push({
          x: event.clientX,
          y: event.clientY,
          vx: (Math.random() - 0.5) * 160 - mouse.vx * 0.05,
          vy: (Math.random() - 0.5) * 160 - mouse.vy * 0.05,
          r: (0.8 + Math.random() * 1.6) * scale,
          life: 0.45 + Math.random() * 0.55,
        });
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'mouseleave',
    () => {
      mouse.active = false;
      mouse.x = -1e5;
      mouse.y = -1e5;
    },
    { passive: true }
  );

  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => {
    mouse.active = false;
  });

  if (window.qor && typeof window.qor.onSettings === 'function') {
    window.qor.onSettings((next) => {
      if (!next) return;
      if (next.density && next.density !== settings.density) {
        settings.density = next.density;
        balance();
      }
      if (next.wind) settings.wind = next.wind;
      if (typeof next.drift === 'boolean') settings.drift = next.drift;
      if (typeof next.aurora === 'boolean') settings.aurora = next.aurora;
    });
  }

  if (window.qor && typeof window.qor.onStorm === 'function') {
    window.qor.onStorm((point) => triggerStorm(point));
  }

  resize();
  requestAnimationFrame(frame);
})();
