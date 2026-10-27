"use strict";

(function () {
  const STORAGE_KEY = "retro-space-canvas-high-score";
  const SPEC = {
    grunt: { hp: 1, score: 100, speed: 52, r: 15, color: "#ff4fd8" },
    zigzag: { hp: 1, score: 150, speed: 64, r: 14, color: "#ffe14a" },
    turret: { hp: 2, score: 220, speed: 36, r: 16, color: "#7aa2ff" },
    elite: { hp: 12, score: 1000, speed: 28, r: 28, color: "#ff5a3c" },
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const actionBtn = document.getElementById("action");
  const muteBtn = document.getElementById("mute");
  const pausedEl = document.getElementById("paused");
  const scoreEl = document.getElementById("score");
  const waveEl = document.getElementById("wave");
  const livesEl = document.getElementById("lives");
  const bestEl = document.getElementById("best");

  const view = { w: 1, h: 1 };
  const keys = {};
  const touch = { left: false, right: false, up: false, down: false, fire: false };

  let state = "menu";
  let paused = false;
  let score = 0;
  let lives = 3;
  let high = loadHigh();
  let player = null;
  let bullets = [];
  let enemies = [];
  let particles = [];
  let stars = [];
  let shake = 0;
  let last = performance.now();
  const director = {
    wave: 1,
    toSpawn: 0,
    timer: 0,
    banner: 0,
    between: false,
    rest: 0,
    eliteSpawned: false,
  };

  const sfx = {
    ctx: null,
    muted: false,
    arm: function () {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) this.ctx = new AudioCtx();
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    tone: function (freq, dur, type, vol, endFreq) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + dur);
      }
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },
    noise: function (dur, vol) {
      if (this.muted || !this.ctx) return;
      const length = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 800;
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(t);
      src.stop(t + dur);
    },
    shoot: function () { this.tone(760, 0.06, "square", 0.035, 210); },
    hit: function () {
      this.tone(130, 0.18, "sawtooth", 0.05, 48);
      this.noise(0.16, 0.05);
    },
    boom: function () {
      this.noise(0.26, 0.07);
      this.tone(90, 0.18, "square", 0.04, 42);
    },
    wave: function () {
      const self = this;
      this.tone(523, 0.08, "square", 0.035);
      setTimeout(function () { self.tone(659, 0.08, "square", 0.035); }, 90);
      setTimeout(function () { self.tone(784, 0.12, "square", 0.035); }, 180);
    },
  };

  function loadHigh() {
    try {
      return Number(localStorage.getItem(STORAGE_KEY)) || 0;
    } catch (err) {
      return 0;
    }
  }

  function pad(value) {
    return String(value).padStart(6, "0");
  }

  function noteScore() {
    if (score > high) {
      high = score;
      try {
        localStorage.setItem(STORAGE_KEY, String(high));
      } catch (err) {
        high = score;
      }
    }
  }

  function updateHud() {
    scoreEl.textContent = pad(score);
    bestEl.textContent = pad(high);
    waveEl.textContent = String(director.wave);
    livesEl.textContent = lives > 0 ? "▲ ".repeat(lives).trim() : "—";
  }

  function showMenu() {
    state = "menu";
    paused = false;
    pausedEl.hidden = true;
    overlayTitle.textContent = "Retro Space";
    overlayText.textContent =
      "Move with WASD or the arrow keys. Hold Space to shoot. P pauses, M mutes. On a touch screen, hold the left or right side to move and fire; the upper and lower edges also steer up and down. Best " +
      pad(high) +
      ".";
    actionBtn.textContent = "Start";
    overlay.hidden = false;
    updateHud();
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = Math.max(1, rect.width);
    view.h = Math.max(1, rect.height);
    canvas.width = Math.floor(view.w * dpr);
    canvas.height = Math.floor(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = [];
    for (let i = 0; i < 90; i += 1) {
      stars.push({
        x: Math.random() * view.w,
        y: Math.random() * view.h,
        z: 0.35 + Math.random() * 1.4,
      });
    }
    if (player) clampPlayer();
  }

  function makePlayer() {
    return {
      x: view.w / 2,
      y: view.h * 0.78,
      r: 14,
      cooldown: 0,
      inv: 0,
    };
  }

  function clampPlayer() {
    player.x = Math.max(18, Math.min(view.w - 18, player.x));
    player.y = Math.max(18, Math.min(view.h - 18, player.y));
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 220;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.4,
        max: 0.75,
        color: color,
        size: 1.5 + Math.random() * 2.5,
      });
    }
  }

  function pickType() {
    if (director.wave % 5 === 0 && !director.eliteSpawned) {
      director.eliteSpawned = true;
      return "elite";
    }
    const roll = Math.random();
    if (director.wave >= 3 && roll < 0.22) return "turret";
    if (director.wave >= 2 && roll < 0.55) return "zigzag";
    return "grunt";
  }

  function makeEnemy(type) {
    const spec = SPEC[type];
    const margin = spec.r + 10;
    const baseX = margin + Math.random() * Math.max(1, view.w - margin * 2);
    return {
      type: type,
      x: baseX,
      baseX: baseX,
      y: -spec.r - 10,
      r: spec.r,
      hp: spec.hp,
      maxHp: spec.hp,
      speed: spec.speed * Math.min(2.1, 1 + (director.wave - 1) * 0.07),
      score: spec.score,
      color: spec.color,
      t: Math.random() * 6,
      cooldown: 0.7 + Math.random() * 0.7,
    };
  }

  function startWave(n) {
    director.wave = n;
    director.toSpawn = 4 + n;
    director.timer = 0.4;
    director.banner = 1.7;
    director.between = false;
    director.eliteSpawned = false;
    updateHud();
    sfx.wave();
  }

  function startGame() {
    sfx.arm();
    score = 0;
    lives = 3;
    bullets = [];
    enemies = [];
    particles = [];
    shake = 0;
    paused = false;
    pausedEl.hidden = true;
    player = makePlayer();
    state = "playing";
    overlay.hidden = true;
    startWave(1);
    updateHud();
  }

  function endGame() {
    state = "over";
    noteScore();
    updateHud();
    overlayTitle.textContent = "Game Over";
    overlayText.textContent = "Score " + pad(score) + "  ·  Best " + pad(high);
    actionBtn.textContent = "Play again";
    overlay.hidden = false;
  }

  function hurt() {
    if (!player || player.inv > 0 || state !== "playing") return;
    player.inv = 1.25;
    lives -= 1;
    shake = 1;
    burst(player.x, player.y, "#7af6ff", 24);
    sfx.hit();
    bullets = bullets.filter(function (bullet) { return bullet.from !== "enemy"; });
    updateHud();
    if (lives <= 0) endGame();
  }

  function circlesHit(a, b, ar, br) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const reach = ar + br;
    return dx * dx + dy * dy <= reach * reach;
  }

  function readTouches(list) {
    touch.left = false;
    touch.right = false;
    touch.up = false;
    touch.down = false;
    touch.fire = false;
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < list.length; i += 1) {
      const point = list[i];
      const x = (point.clientX - rect.left) / rect.width;
      const y = (point.clientY - rect.top) / rect.height;
      touch.fire = true;
      if (x < 0.42) touch.left = true;
      if (x > 0.58) touch.right = true;
      if (y < 0.34) touch.up = true;
      if (y > 0.66) touch.down = true;
    }
  }

  function updateStars(dt) {
    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i];
      star.y += (16 + star.z * 70) * dt;
      if (star.y > view.h) {
        star.y = 0;
        star.x = Math.random() * view.w;
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const bit = particles[i];
      bit.life -= dt;
      if (bit.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
    }
  }

  function fireEnemy(enemy) {
    if (enemy.type === "elite") {
      [-0.4, 0, 0.4].forEach(function (spread) {
        bullets.push({
          x: enemy.x,
          y: enemy.y + enemy.r,
          vx: Math.sin(spread) * 120,
          vy: 190,
          from: "enemy",
          r: 4,
        });
      });
      enemy.cooldown = 1.2;
      return;
    }
    const dx = player.x - enemy.x;
    const dy = Math.max(30, player.y - enemy.y);
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 220;
    bullets.push({
      x: enemy.x,
      y: enemy.y + enemy.r,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      from: "enemy",
      r: 3.5,
    });
    enemy.cooldown = 1.5;
  }

  function updateCombat(dt) {
    player.cooldown = Math.max(0, player.cooldown - dt);
    player.inv = Math.max(0, player.inv - dt);

    let dx = 0;
    let dy = 0;
    if (keys.ArrowLeft || keys.KeyA || touch.left) dx -= 1;
    if (keys.ArrowRight || keys.KeyD || touch.right) dx += 1;
    if (keys.ArrowUp || keys.KeyW || touch.up) dy -= 1;
    if (keys.ArrowDown || keys.KeyS || touch.down) dy += 1;
    if (dx || dy) {
      const scale = Math.hypot(dx, dy);
      player.x += (dx / scale) * 320 * dt;
      player.y += (dy / scale) * 320 * dt;
      clampPlayer();
    }

    if ((keys.Space || touch.fire) && player.cooldown <= 0 && state === "playing") {
      bullets.push({ x: player.x, y: player.y - 16, vx: 0, vy: -560, from: "player", r: 3 });
      player.cooldown = 0.16;
      sfx.shoot();
    }

    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      enemy.t += dt;
      const sway = Math.min(100, view.w * 0.14);
      if (enemy.type === "zigzag") {
        enemy.y += enemy.speed * dt;
        enemy.x = enemy.baseX + Math.sin(enemy.t * 2.5) * sway;
      } else if (enemy.type === "turret" || enemy.type === "elite") {
        const park = Math.max(64, view.h * (enemy.type === "elite" ? 0.16 : 0.24));
        if (enemy.y < park) enemy.y += enemy.speed * dt;
        enemy.x = enemy.baseX + Math.sin(enemy.t * (enemy.type === "elite" ? 0.9 : 0.7)) * 36;
      } else {
        enemy.y += enemy.speed * dt;
      }
      enemy.x = Math.max(enemy.r, Math.min(view.w - enemy.r, enemy.x));

      if (enemy.y > view.h + enemy.r + 8) {
        enemies.splice(i, 1);
        continue;
      }

      if ((enemy.type === "turret" || enemy.type === "elite") && enemy.y > 20) {
        enemy.cooldown -= dt;
        if (enemy.cooldown <= 0) fireEnemy(enemy);
      }

      let destroyed = false;
      for (let j = bullets.length - 1; j >= 0; j -= 1) {
        const bullet = bullets[j];
        if (bullet.from !== "player") continue;
        if (!circlesHit(bullet, enemy, bullet.r, enemy.r)) continue;
        bullets.splice(j, 1);
        enemy.hp -= 1;
        if (enemy.hp <= 0) {
          score += enemy.score;
          noteScore();
          burst(enemy.x, enemy.y, enemy.color, enemy.type === "elite" ? 34 : 16);
          sfx.boom();
          enemies.splice(i, 1);
          updateHud();
          destroyed = true;
          break;
        }
      }

      if (!destroyed && state === "playing" && circlesHit(player, enemy, player.r, enemy.r)) {
        hurt();
      }
    }

    for (let j = bullets.length - 1; j >= 0; j -= 1) {
      const bullet = bullets[j];
      bullet.x += (bullet.vx || 0) * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.y < -20 || bullet.y > view.h + 20 || bullet.x < -20 || bullet.x > view.w + 20) {
        bullets.splice(j, 1);
        continue;
      }
      if (bullet.from === "enemy" && state === "playing" && circlesHit(bullet, player, bullet.r, player.r)) {
        bullets.splice(j, 1);
        hurt();
      }
    }

    if (director.banner > 0) director.banner -= dt;
    if (director.toSpawn > 0) {
      director.timer -= dt;
      if (director.timer <= 0) {
        enemies.push(makeEnemy(pickType()));
        director.toSpawn -= 1;
        director.timer = Math.max(0.22, 0.64 - director.wave * 0.03);
      }
      return;
    }
    if (enemies.length > 0 || state !== "playing") return;
    if (!director.between) {
      director.between = true;
      director.rest = 1.2;
      score += 40 * director.wave;
      noteScore();
      updateHud();
      return;
    }
    director.rest -= dt;
    if (director.rest <= 0) startWave(director.wave + 1);
  }

  function update(dt) {
    updateStars(dt);
    if (state === "playing" && !paused) updateCombat(dt);
    if (!(state === "playing" && paused)) updateParticles(dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 1.6);
  }

  function drawShip(x, y, color, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(12, 14);
    ctx.lineTo(0, 7);
    ctx.lineTo(-12, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    if (enemy.type === "zigzag") {
      ctx.moveTo(0, -enemy.r);
      ctx.lineTo(enemy.r, 0);
      ctx.lineTo(0, enemy.r);
      ctx.lineTo(-enemy.r, 0);
    } else if (enemy.type === "turret") {
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const px = Math.cos(angle) * enemy.r;
        const py = Math.sin(angle) * enemy.r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    } else if (enemy.type === "elite") {
      ctx.moveTo(0, -enemy.r);
      ctx.lineTo(enemy.r, enemy.r * 0.2);
      ctx.lineTo(enemy.r * 0.45, enemy.r);
      ctx.lineTo(0, enemy.r * 0.45);
      ctx.lineTo(-enemy.r * 0.45, enemy.r);
      ctx.lineTo(-enemy.r, enemy.r * 0.2);
    } else {
      ctx.moveTo(0, enemy.r);
      ctx.lineTo(enemy.r, -enemy.r * 0.6);
      ctx.lineTo(-enemy.r, -enemy.r * 0.6);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (enemy.type === "elite") {
      const width = 44;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.r - 12, width, 4);
      ctx.fillStyle = enemy.color;
      ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.r - 12, width * (enemy.hp / enemy.maxHp), 4);
    }
  }

  function draw() {
    const sky = ctx.createLinearGradient(0, 0, 0, view.h);
    sky.addColorStop(0, "#070714");
    sky.addColorStop(1, "#1a1030");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.w, view.h);

    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i];
      ctx.globalAlpha = 0.35 + star.z * 0.4;
      ctx.fillStyle = "#d7fbff";
      ctx.fillRect(star.x, star.y, star.z > 1.2 ? 2 : 1, star.z > 1.2 ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    if (shake > 0.02) {
      ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
    }

    for (let i = 0; i < enemies.length; i += 1) drawEnemy(enemies[i]);

    for (let i = 0; i < bullets.length; i += 1) {
      const bullet = bullets[i];
      ctx.fillStyle = bullet.from === "player" ? "#7af6ff" : "#ff4d8d";
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (player && !(player.inv > 0 && Math.floor(player.inv * 14) % 2 === 0)) {
      drawShip(player.x, player.y, "#7af6ff", 1);
    } else if (player) {
      ctx.globalAlpha = 0.35;
      drawShip(player.x, player.y, "#7af6ff", 1);
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < particles.length; i += 1) {
      const bit = particles[i];
      ctx.globalAlpha = Math.max(0, bit.life / bit.max);
      ctx.fillStyle = bit.color;
      ctx.fillRect(bit.x, bit.y, bit.size, bit.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (state === "playing" && director.banner > 0) {
      ctx.globalAlpha = Math.max(0, Math.min(1, director.banner));
      ctx.fillStyle = "#e8fbff";
      ctx.font = "700 28px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("WAVE " + director.wave, view.w / 2, view.h * 0.42);
      ctx.globalAlpha = 1;
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function onKeyDown(event) {
    keys[event.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(event.code) !== -1) {
      event.preventDefault();
    }
    if ((event.code === "Enter" || event.code === "Space") && state !== "playing") {
      startGame();
    }
    if (event.code === "KeyP" && state === "playing") {
      paused = !paused;
      pausedEl.hidden = !paused;
    }
    if (event.code === "KeyM") toggleMute();
    sfx.arm();
  }

  function toggleMute() {
    sfx.muted = !sfx.muted;
    muteBtn.textContent = sfx.muted ? "Sound off" : "Sound on";
    muteBtn.setAttribute("aria-pressed", sfx.muted ? "true" : "false");
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", function (event) { keys[event.code] = false; });
  window.addEventListener("blur", function () {
    Object.keys(keys).forEach(function (code) { keys[code] = false; });
  });
  window.addEventListener("resize", resize);

  stage.addEventListener("touchstart", function (event) {
    if (state !== "playing") return;
    event.preventDefault();
    sfx.arm();
    readTouches(event.touches);
  }, { passive: false });
  stage.addEventListener("touchmove", function (event) {
    if (state !== "playing") return;
    event.preventDefault();
    readTouches(event.touches);
  }, { passive: false });
  stage.addEventListener("touchend", function (event) {
    readTouches(event.touches);
  });
  stage.addEventListener("touchcancel", function () {
    readTouches([]);
  });

  actionBtn.addEventListener("click", function () {
    sfx.arm();
    startGame();
  });
  muteBtn.addEventListener("click", function () {
    sfx.arm();
    toggleMute();
  });

  resize();
  player = makePlayer();
  showMenu();
  requestAnimationFrame(frame);
})();
