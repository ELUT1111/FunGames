/* =========================================================
 * main.js — 渲染、输入、相机、翻转系统、音频、HUD、主循环、结局
 * ========================================================= */
'use strict';

(function () {

  /* ================= 渲染器 / 场景 ================= */
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd6ae72, 0.005);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

  /* ---- 灯光 ---- */
  const hemi = new THREE.HemisphereLight(0xffeec4, 0x91704a, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdfae, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0015;
  scene.add(sun, sun.target);

  /* ---- 后处理 Bloom ---- */
  let composer = null;
  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    const bloom = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.4, 0.9);
    composer.addPass(bloom);
  } catch (e) { composer = null; console.warn('Bloom 不可用，使用直接渲染', e); }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer && composer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ================= 程序化音频 ================= */
  function makeAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    // 噪声缓冲
    const nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // 风声
    const wind = ctx.createBufferSource(); wind.buffer = nbuf; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 480; wf.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    wind.connect(wf); wf.connect(wg); wg.connect(master); wind.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain(); lfoG.gain.value = 220;
    lfo.connect(lfoG); lfoG.connect(wf.frequency); lfo.start();
    // 复苏后的和声垫
    const padG = ctx.createGain(); padG.gain.value = 0; padG.connect(master);
    const padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 900; padF.connect(padG);
    [196, 246.9, 293.7, 392].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      o.detune.value = (i - 1.5) * 4;
      const g = ctx.createGain(); g.gain.value = 0.25;
      o.connect(g); g.connect(padF); o.start();
    });

    function bell(f, dur = 1.4, vol = 0.18, delay = 0, type = 'sine') {
      const t0 = ctx.currentTime + delay;
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.76;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(master);
      o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.1); o2.stop(t0 + dur + 0.1);
    }
    function noiseHit(dur = 0.25, freq = 1200, vol = 0.2, delay = 0) {
      const t0 = ctx.currentTime + delay;
      const s = ctx.createBufferSource(); s.buffer = nbuf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t0); s.stop(t0 + dur + 0.05);
    }
    function sweep(f0, f1, dur = 0.6, vol = 0.15, type = 'sawtooth', delay = 0) {
      const t0 = ctx.currentTime + delay;
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.1);
    }

    return {
      ctx,
      update() { padG.gain.value = G.restoration * 0.045; wg.gain.value = 0.05 + G.flip * 0.06; },
      step() { noiseHit(0.09, 700, 0.05); },
      jump() { sweep(220, 520, 0.25, 0.06, 'sine'); },
      hurt() { noiseHit(0.3, 500, 0.3); sweep(300, 80, 0.35, 0.2, 'square'); },
      shoot() { sweep(900, 140, 0.3, 0.08, 'sawtooth'); },
      reverse() { sweep(140, 1200, 0.35, 0.1, 'sine'); },
      enemyHit() { noiseHit(0.18, 900, 0.18); },
      enemyDie() { noiseHit(0.6, 600, 0.22); bell(523, 1.2, 0.1, 0.1); bell(784, 1.6, 0.08, 0.25); },
      pulse() { sweep(500, 90, 0.4, 0.16, 'triangle'); noiseHit(0.25, 800, 0.1); },
      memoryOpen() { bell(659, 2.2, 0.14); bell(988, 2.6, 0.08, 0.12); },
      absorb() { [523, 659, 784, 1047].forEach((f, i) => bell(f, 1.8, 0.12, i * 0.13)); },
      bury() { bell(220, 2.6, 0.16); bell(165, 3.2, 0.12, 0.3); },
      evolve() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => bell(f, 2, 0.1, i * 0.1)); },
      restoreChime() { [784, 988, 1175].forEach((f, i) => bell(f, 1.8, 0.09, i * 0.15)); },
      altarRise() { sweep(60, 200, 2.5, 0.18, 'sine'); [262, 330, 392, 523].forEach((f, i) => bell(f, 3, 0.1, 1 + i * 0.3)); },
      flipStart() { sweep(800, 90, 0.9, 0.2, 'sine'); noiseHit(1.2, 400, 0.12); bell(1568, 2.5, 0.06, 0.2); },
      flipEnd() { sweep(90, 600, 0.5, 0.12, 'sine'); },
    };
  }

  /* ================= 输入 ================= */
  const input = { f: false, b: false, l: false, r: false, run: false, jumpPressed: false };
  const cam = { yaw: 0.6, pitch: 0.32, dist: 8 };

  document.addEventListener('keydown', e => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') input.f = true;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') input.b = true;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.l = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') input.r = true;
    if (e.code === 'ShiftLeft') input.run = true;
    if (e.code === 'Space') { if (!e.repeat) input.jumpPressed = true; e.preventDefault(); }
    if (e.code === 'KeyF') tryFlip();
    if (e.code === 'KeyE') interact();
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') input.f = false;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') input.b = false;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.l = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') input.r = false;
    if (e.code === 'ShiftLeft') input.run = false;
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    cam.yaw -= e.movementX * 0.0023;
    cam.pitch = clamp(cam.pitch + e.movementY * 0.002, -0.2, 1.05);
  });
  document.addEventListener('wheel', e => {
    if (!G.started) return;
    cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 0.8, 4, 14);
  });
  canvas.addEventListener('mousedown', e => {
    if (!G.started || G.ending) return;
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
    if (e.button === 0) G.tryPulse(G.player.pos);
  });
  document.addEventListener('pointerlockchange', () => {
    G.locked = document.pointerLockElement === canvas;
    if (G.locked) {
      $('pause').classList.add('hidden');
      G.paused = G.modalOpen; // 弹窗时保持暂停
      setHint('');
    } else if (G.started && !G.modalOpen && !G.ending) {
      $('pause').classList.remove('hidden');
      G.paused = true;
    }
  });

  /* ================= 沙漏翻转系统 ================= */
  const FLIP_DUR = 4.2, FLIP_CD = 8.5;
  function tryFlip() {
    if (!G.started || G.paused || G.ending) return;
    if (G.flipCooldown > 0) return;
    G.flipActive = true;
    G.flipTimer = FLIP_DUR;
    G.flipCooldown = FLIP_CD;
    document.body.classList.add('flipping');
    G.audio && G.audio.flipStart();
    G.shake = 0.35;
  }
  function updateFlip(dt) {
    if (G.flipCooldown > 0) G.flipCooldown -= dt;
    if (G.flipActive) {
      G.flipTimer -= dt;
      if (G.flipTimer <= 0) {
        G.flipActive = false;
        document.body.classList.remove('flipping');
        G.audio && G.audio.flipEnd();
      }
    }
    G.flip = lerp(G.flip, G.flipActive ? 1 : 0, 1 - Math.exp(-4 * dt));
    // 天空沙漏投影：保持在玩家视野前上方
    if (G.skyHourglass) {
      G.skyHourglass.material.opacity = G.flip * 0.75;
      G.skyHourglass.material.rotation = Math.sin(G.time * 0.4) * 0.12;
      if (G.flip > 0.02) {
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        G.skyHourglass.position.set(
          camera.position.x + fwd.x * 240,
          Math.max(120, camera.position.y + 90 + fwd.y * 120),
          camera.position.z + fwd.z * 240);
      }
    }
    if (G.skyUniforms) G.skyUniforms.uFlip.value = G.flip;
  }

  /* ================= 交互（E） ================= */
  let dlgNPC = null;
  function interact() {
    if (!G.started || G.modalOpen || G.ending || G.paused) return;
    const p = G.player.pos;
    // 圣坛 → 结局
    if (G.altar && G.altar.risen && G.decided >= G.totalGrains &&
        dist2d(p.x, p.z, 0, 0) < 8) { runEnding(); return; }
    // NPC 对话
    if (dlgNPC) { advanceDialogue(); return; }
    let best = null, bd = 4.5;
    for (const n of G.npcs) {
      const d = p.distanceTo(n.fig.position);
      if (d < bd) { bd = d; best = n; }
    }
    if (best) { dlgNPC = best; dlgNPC.dlgIndex = 0; showDialogue(); }
  }
  function npcLines(n) { return G.restoration > 0.55 ? n.linesLate : n.linesEarly; }
  function showDialogue() {
    const lines = npcLines(dlgNPC);
    $('dlgName').textContent = dlgNPC.name;
    $('dlgText').textContent = lines[dlgNPC.dlgIndex];
    $('dlgMore').textContent = dlgNPC.dlgIndex < lines.length - 1 ? 'E · 继续' : 'E · 道别';
    $('dialogue').classList.add('open');
    G.audio && G.audio.step();
  }
  function advanceDialogue() {
    dlgNPC.dlgIndex++;
    if (dlgNPC.dlgIndex >= npcLines(dlgNPC).length) { closeDialogue(); return; }
    showDialogue();
  }
  function closeDialogue() { $('dialogue').classList.remove('open'); dlgNPC = null; }

  /* ================= HUD 绘制 ================= */
  const hgC = $('hgCanvas'), hgG = hgC.getContext('2d');
  function drawHourglassHud() {
    const W = 148, H = 236;
    hgG.clearRect(0, 0, W, H);
    const fill = (G.absorbed.gold + G.absorbed.blue + G.absorbed.gray + G.absorbed.black) / G.totalGrains;
    // 框架
    hgG.strokeStyle = 'rgba(232,193,104,.9)'; hgG.lineWidth = 5;
    hgG.beginPath();
    hgG.moveTo(22, 12); hgG.lineTo(126, 12);
    hgG.bezierCurveTo(126, 70, 84, 100, 78, 118);
    hgG.bezierCurveTo(84, 136, 126, 166, 126, 224);
    hgG.lineTo(22, 224);
    hgG.bezierCurveTo(22, 166, 64, 136, 70, 118);
    hgG.bezierCurveTo(64, 100, 22, 70, 22, 12);
    hgG.closePath(); hgG.stroke();
    hgG.save(); hgG.clip();
    // 下沙
    const bh = 18 + fill * 70;
    const grad = hgG.createLinearGradient(0, 224 - bh, 0, 224);
    grad.addColorStop(0, '#ffe9a8'); grad.addColorStop(1, '#d8a850');
    hgG.fillStyle = grad;
    hgG.fillRect(22, 224 - bh, 104, bh);
    // 上沙（剩余）
    const th = (1 - fill) * 60 + 6;
    hgG.fillStyle = 'rgba(232,193,104,.75)';
    hgG.beginPath();
    hgG.moveTo(34, 12); hgG.lineTo(114, 12);
    hgG.lineTo(96, 12 + th); hgG.lineTo(52, 12 + th);
    hgG.closePath(); hgG.fill();
    // 中流
    if (fill < 1) {
      hgG.strokeStyle = 'rgba(255,230,160,.9)'; hgG.lineWidth = 2.5;
      hgG.setLineDash([5, 6]);
      hgG.lineDashOffset = G.flipActive ? G.time * 60 : -G.time * 60;
      hgG.beginPath(); hgG.moveTo(74, 100); hgG.lineTo(74, 224 - bh + 4); hgG.stroke();
      hgG.setLineDash([]);
    }
    hgG.restore();
  }
  const frC = $('flipRing'), frG = frC.getContext('2d');
  function drawFlipRing() {
    frG.clearRect(0, 0, 112, 112);
    const ready = G.flipCooldown <= 0;
    const prog = ready ? 1 : 1 - G.flipCooldown / FLIP_CD;
    frG.lineWidth = 7;
    frG.strokeStyle = 'rgba(255,255,255,.14)';
    frG.beginPath(); frG.arc(56, 56, 44, 0, TAU); frG.stroke();
    frG.strokeStyle = ready ? `rgba(255,220,130,${0.8 + Math.sin(G.time * 4) * 0.2})` : 'rgba(200,170,110,.55)';
    frG.beginPath(); frG.arc(56, 56, 44, -Math.PI / 2, -Math.PI / 2 + prog * TAU); frG.stroke();
    // 中央小沙漏
    frG.save(); frG.translate(56, 56);
    frG.rotate(G.flip * Math.PI);
    frG.strokeStyle = ready ? '#ffe9a8' : '#998860';
    frG.lineWidth = 4;
    frG.beginPath();
    frG.moveTo(-13, -16); frG.lineTo(13, -16); frG.lineTo(-13, 16); frG.lineTo(13, 16); frG.closePath();
    frG.stroke();
    frG.restore();
  }

  /* ================= 提示系统 ================= */
  let enemyHintShown = false, npcHintT = 0;
  function updateHints() {
    if (G.modalOpen || G.ending || !G.locked) return;
    const p = G.player.pos;
    // 优先级：圣坛 > NPC > 谜题 > 敌人
    if (G.altar && G.altar.risen && dist2d(p.x, p.z, 0, 0) < 8) {
      setHint('E · 做出最后的回答'); return;
    }
    if (dlgNPC) { setHint(''); return; }
    for (const n of G.npcs) {
      if (p.distanceTo(n.fig.position) < 4.5) {
        setHint(G.restoration > 0.55 ? 'E · 与他交谈' : 'E · 倾听虚影的呢喃'); return;
      }
    }
    for (const pz of G.puzzles) {
      if (!pz.done && p.distanceTo(pz.center) < pz.radius * 0.8) {
        setHint(G.flipActive ? '时间正在倒流……' : pz.hint); return;
      }
    }
    for (const w of G.enemies) {
      if (!w.dead && p.distanceTo(w.grp.position) < 26) {
        if (!enemyHintShown) { enemyHintShown = true; subtitle('沙魇——被怨恨凝结的流沙。翻转沙漏（F），让它的子弹原路返回。', 6); }
        setHint('沙魇在附近 · F 翻转可弹返沙弹'); return;
      }
    }
    setHint('');
    void npcHintT;
  }

  /* ================= 死亡 / 重生 ================= */
  G.onPlayerDeath = function () {
    if (G.ending) return;
    G.paused = true;
    $('fader').style.opacity = 1;
    subtitle('躯体散作沙……又在风中重新聚拢。');
    setTimeout(() => {
      G.player.pos.set(0, G.groundHeight(0, 0) + 0.5, 0);
      G.player.vel.set(0, 0, 0);
      G.integrity = 100;
      G.paused = false;
      $('fader').style.opacity = 0;
    }, 1800);
  };

  /* ================= 结局演出 ================= */
  let endingT = 0;
  function runEnding() {
    if (G.ending) return;
    G.ending = true;
    setHint('');
    closeDialogue();
    document.exitPointerLock && document.exitPointerLock();
    $('pause').classList.add('hidden');
    G.audio && G.audio.altarRise();
    subtitle('沙漏行者举起了自己的心脏——那只盛满世界的沙漏。');
    document.body.classList.add('flipping');
  }
  function updateEnding(dt) {
    endingT += dt;
    // 相机螺旋上升
    const t = Math.min(1, endingT / 9);
    const ang = endingT * 0.35;
    const r = lerp(10, 26, t);
    const ay = G.altar.baseY + lerp(3, 30, t * t);
    camera.position.set(Math.cos(ang) * r, ay, Math.sin(ang) * r);
    camera.lookAt(0, G.altar.baseY + 4, 0);
    G.flip = lerp(G.flip, 1, dt);
    if (G.skyHourglass) G.skyHourglass.material.opacity = Math.min(0.9, endingT * 0.2);
    if (G.skyUniforms) G.skyUniforms.uFlip.value = G.flip;
    if ((endingT * 2 | 0) !== ((endingT - dt) * 2 | 0)) {
      const a = Math.random() * TAU;
      G.fx.burst(new THREE.Vector3(Math.cos(a) * 6, G.altar.baseY + 4 + Math.random() * 8, Math.sin(a) * 6),
        [0xffd780, 0x7fb6e8, 0xb6bcc6][(Math.random() * 3) | 0], 60, 7);
    }
    if (endingT > 6.5 && !G._endShown) {
      G._endShown = true;
      const end = G.computeEnding();
      $('endTitle').textContent = end.title;
      $('endText').textContent = end.text;
      $('endStats').textContent = end.stats;
      $('ending').classList.remove('hidden');
      $('ending').classList.add('show');
    }
  }

  /* ================= 开场 ================= */
  function startGame() {
    G.audio = makeAudio();
    G.audio && G.audio.ctx.resume();
    $('title').classList.add('hidden');
    document.body.classList.add('hud-show');
    $('fader').style.opacity = 0;
    G.started = true;
    $('objText').textContent = `找回散落的记忆之沙（0 / ${G.totalGrains}）`;
    setTimeout(() => subtitle('沙海无垠。所有曾经存在过的，都沉睡在沙下。', 5.5), 1200);
    setTimeout(() => subtitle('你醒了。沙漏里，只剩几粒沙在缓慢地流动。', 5.5), 7500);
    setTimeout(() => subtitle('去吧——循着远方的光柱，找回这个世界的记忆。', 6), 13800);
    setTimeout(() => { if (!G.locked) setHint('点击画面 · 进入沙海'); }, 1500);
    canvas.requestPointerLock && canvas.requestPointerLock();
  }
  $('btnStart').addEventListener('click', startGame);
  $('btnResume').addEventListener('click', () => canvas.requestPointerLock());
  $('btnRestart').addEventListener('click', () => location.reload());

  /* ================= 世界构建 ================= */
  G.buildWorld(scene);
  G.buildParticles(scene);
  G.buildEnemies(scene);
  G.player = G.createPlayer(scene);
  G.buildGrains(scene);
  G.bindMemoryUI();

  /* ================= 相机 ================= */
  const camTarget = new THREE.Vector3();
  G.shake = 0;
  function updateCamera(dt) {
    const p = G.player.pos;
    camTarget.lerp(new THREE.Vector3(p.x, p.y + 2.1, p.z), 1 - Math.exp(-9 * dt));
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const off = new THREE.Vector3(Math.sin(cam.yaw) * cp, sp, Math.cos(cam.yaw) * cp).multiplyScalar(cam.dist);
    const desired = camTarget.clone().add(off);
    // 防止穿地
    const gh = G.terrainHeight(desired.x, desired.z) + 0.7;
    if (desired.y < gh) desired.y = gh;
    camera.position.lerp(desired, 1 - Math.exp(-10 * dt));
    if (G.shake > 0) {
      G.shake -= dt;
      camera.position.x += (Math.random() - 0.5) * G.shake * 0.7;
      camera.position.y += (Math.random() - 0.5) * G.shake * 0.7;
    }
    camera.lookAt(camTarget);
  }
  camera.position.set(8, 8, 12);

  /* ================= 雾色 / 光照随复苏变化 ================= */
  const fogSand = new THREE.Color(0xd6ae72), fogLive = new THREE.Color(0xc8dcec), fogFlip = new THREE.Color(0x8a6fa8);
  const sunSand = new THREE.Color(0xffdfae), sunLive = new THREE.Color(0xfff4e0);
  function updateAtmosphere(dt) {
    G.restoration = lerp(G.restoration, G.restorationTarget, 1 - Math.exp(-0.35 * dt));
    const r = G.restoration;
    scene.fog.color.copy(fogSand).lerp(fogLive, r).lerp(fogFlip, G.flip * 0.55);
    scene.fog.density = lerp(0.005, 0.0038, r) + G.flip * 0.0012;
    sun.color.copy(sunSand).lerp(sunLive, r);
    sun.intensity = lerp(1.35, 1.55, r) * (1 - G.flip * 0.25);
    hemi.intensity = lerp(0.6, 0.75, r);
    if (G.skyUniforms) G.skyUniforms.uRestore.value = r;
    G.updateRestorables();
    // 阳光跟随玩家（阴影范围）
    const p = G.player.pos;
    sun.position.set(p.x + 50, p.y + 70, p.z - 60);
    sun.target.position.copy(p);
  }

  /* ================= 主循环 ================= */
  const clock = new THREE.Clock();
  let acc = 0;
  function frame() {
    requestAnimationFrame(frame);
    let dt = Math.min(clock.getDelta(), 0.05);
    G.time += dt;
    acc += dt;

    if (G.started && !G.paused && !G.ending) {
      G.player.update(dt, input, cam.yaw);
      G.updateEnemies(dt, G.player.pos);
      G.updatePulseCd(dt);
      updateFlip(dt);
      G.updatePuzzles(dt, G.player.pos);
      G.updateGrains(dt, G.player.pos);
      G.checkGrains(G.player.pos);
      updateCamera(dt);
      updateHints();
      // 缓慢回复
      if (G.time - (G.lastHurtTime || 0) > 6 && G.integrity < 100) {
        G.integrity = Math.min(100, G.integrity + dt * 3);
      }
      // 对话距离检测
      if (dlgNPC && G.player.pos.distanceTo(dlgNPC.fig.position) > 7) closeDialogue();
    } else if (G.ending) {
      updateFlip(dt);
      updateEnding(dt);
    }

    // 始终运行的演出层
    for (const u of G.updaters) u(dt);
    G.fx.dustUpdate(dt, camera.position);
    G.fx.streakUpdate(dt, camera.position);
    G.fx.burstsUpdate(dt);
    G.fx.puffsUpdate(dt);
    G.fx.pulseUpdate(dt);
    updateAtmosphere(dt);
    uiTimersUpdate(dt);
    G.audio && G.audio.update();

    // HUD（隔帧绘制即可）
    if (acc > 0.05) {
      acc = 0;
      drawHourglassHud();
      drawFlipRing();
      $('integrityFill').style.width = G.integrity + '%';
    }

    if (composer) composer.render(); else renderer.render(scene, camera);
  }
  frame();

})();
