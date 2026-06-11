/* ============================================================
 * 活字灵境 · core.js
 * 全局状态 G、活字纹理库 GlyphLib、特效 FX、程序化音效 SFX
 * ============================================================ */
'use strict';

const G = {
  scene: null, camera: null, renderer: null,
  keys: {}, pointerLocked: false,
  yaw: 0, pitch: 0.04,
  timeScale: 1, slowT: 0,        // 时缓
  paused: false, started: false, over: false,
  t: 0,                          // 全局时间
  player: null,
  enemies: [], projectiles: [], pickups: [], togglables: [], lightZones: [],
  particles: [], floaters: [],   // floaters: 环境漂浮字
  inv: {},                       // 活字背包 {char: count}
  abilities: [null, null, null, null, null, null], // 槽位 1-6
  // 试炼永久强化(基准值,试炼圆满后被提升)
  buffs: { slashDmg: 22, dashCd: 0.9, dashCost: 8, shieldDur: 0.7, reflectDmg: 30 },
  world: { collected: { '山': false, '水': false, '树': false, '城': false }, count: 0, seals: 0, bridgeBuilt: false },
  boss: null,
  shake: 0,
};

/* ---------------- 活字纹理库 ---------------- */
const GlyphLib = (() => {
  const cache = new Map();
  const FONT = '"KaiTi","STKaiti","SimSun",serif';

  // 生成单个/多个汉字的发光纹理
  function texture(text, color = '#ffffff', glow = true, gothic = false) {
    const key = text + '|' + color + '|' + glow + '|' + gothic;
    if (cache.has(key)) return cache.get(key);
    const n = Math.max(1, text.length);
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S * n; c.height = S;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = (gothic ? 'bold ' : '') + Math.floor(S * 0.74) + 'px ' + FONT;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = S * 0.16; }
    ctx.fillStyle = color;
    // 微微的笔画抖动,模拟手写墨感
    for (let i = 0; i < n; i++) {
      ctx.fillText(text[i], S * (i + 0.5), S * 0.54);
    }
    // 飞白效果:随机擦除细线
    ctx.globalCompositeOperation = 'destination-out';
    ctx.shadowBlur = 0;
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = 0.16;
      ctx.fillRect(0, Math.random() * S, S * n, 1 + Math.random() * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    cache.set(key, tex);
    return tex;
  }

  // 创建字形 Sprite(始终面向相机)
  function sprite(text, size = 1, color = '#ffffff', opacity = 1) {
    const mat = new THREE.SpriteMaterial({
      map: texture(text, color), transparent: true, opacity,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(size * Math.max(1, text.length), size, 1);
    return s;
  }

  // 创建平铺地面的字形面片
  function flat(text, size = 1, color = '#ffffff', opacity = 0.3) {
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      map: texture(text, color), transparent: true, opacity,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  // 水墨晕染圆斑纹理(用于墨溅、阴影)
  let inkTex = null;
  function ink() {
    if (inkTex) return inkTex;
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S/2, S/2, 2, S/2, S/2, S/2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    inkTex = new THREE.CanvasTexture(c);
    return inkTex;
  }

  return { texture, sprite, flat, ink };
})();

/* ---------------- 特效系统 FX ---------------- */
const FX = (() => {
  const MAX = 600;

  function spawn(opts) {
    if (G.particles.length >= MAX) return null;
    const p = {
      sprite: opts.sprite,
      vel: opts.vel || new THREE.Vector3(),
      grav: opts.grav ?? 0,
      life: opts.life || 1, maxLife: opts.life || 1,
      spin: opts.spin || 0,
      grow: opts.grow || 0,
      fade: opts.fade ?? true,
    };
    G.scene.add(p.sprite);
    G.particles.push(p);
    return p;
  }

  // 文字迸裂:位置处炸开一组活字粒子
  function glyphBurst(pos, chars, color = '#ffffff', n = 10, speed = 7, size = 0.5) {
    for (let i = 0; i < n; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      const s = GlyphLib.sprite(ch, size * (0.6 + Math.random() * 0.8), color);
      s.position.copy(pos);
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.8));
      spawn({ sprite: s, vel: v, grav: -9, life: 0.7 + Math.random() * 0.6, spin: (Math.random() - 0.5) * 8 });
    }
  }

  // 墨迹晕染:扩散的墨斑
  function inkSplash(pos, color = '#1a1f2e', size = 2, n = 4) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: GlyphLib.ink(), color, transparent: true, opacity: 0.7, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*0.8, (Math.random()-0.5)*0.8, (Math.random()-0.5)*0.8));
      s.scale.setScalar(size * (0.4 + Math.random() * 0.5));
      spawn({ sprite: s, vel: new THREE.Vector3(0, 0.4, 0), life: 0.5 + Math.random() * 0.4, grow: size * 2.2 });
    }
  }

  // 墨色火花(文字碰撞)
  function sparks(pos, color = '#ffd87a', n = 8) {
    glyphBurst(pos, '丶丿乀乁灬', color, n, 9, 0.3);
    inkSplash(pos, '#11131a', 1.4, 2);
  }

  function update(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        G.scene.remove(p.sprite);
        if (p.sprite.material) p.sprite.material.dispose();
        G.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.grav * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      if (p.spin) p.sprite.material.rotation += p.spin * dt;
      if (p.grow) {
        const k = p.grow * dt;
        p.sprite.scale.x += k; p.sprite.scale.y += k;
      }
      if (p.fade) p.sprite.material.opacity = Math.min(1, p.life / p.maxLife) * 0.95;
    }
    // 屏幕震动衰减
    G.shake = Math.max(0, G.shake - dt * 2.2);
  }

  function shake(amp) { G.shake = Math.max(G.shake, amp); }

  function flash(opacity = 0.5, ms = 240) {
    const el = document.getElementById('flash-overlay');
    el.style.transition = 'none'; el.style.opacity = opacity;
    requestAnimationFrame(() => {
      el.style.transition = 'opacity ' + ms + 'ms ease-out';
      el.style.opacity = 0;
    });
  }

  function tint(css) { document.getElementById('tint-overlay').style.background = css; }

  return { spawn, glyphBurst, inkSplash, sparks, update, shake, flash, tint };
})();

/* ---------------- 程序化音效 SFX ---------------- */
const SFX = (() => {
  let ctx = null, master = null, muted = false;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0) {
    if (muted) return; ensure();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur);
  }

  function noise(dur, vol = 0.2, lowpass = 3000) {
    if (muted) return; ensure();
    const len = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  const lib = {
    pickup:    () => { tone(660, 0.12, 'sine', 0.25); tone(990, 0.18, 'sine', 0.18); },
    glyph:     () => { tone(523, 0.15, 'triangle', 0.3); tone(784, 0.25, 'triangle', 0.22); tone(1046, 0.4, 'sine', 0.15); },
    slash:     () => { noise(0.12, 0.22, 5000); tone(300, 0.08, 'sawtooth', 0.08, -150); },
    hit:       () => { noise(0.08, 0.18, 2200); tone(180, 0.1, 'square', 0.12, -60); },
    hurt:      () => { tone(140, 0.25, 'sawtooth', 0.25, -70); noise(0.15, 0.15, 1200); },
    transform: () => { tone(196, 1.2, 'sine', 0.3, 196); tone(294, 1.2, 'sine', 0.2, 294); noise(0.9, 0.12, 800); },
    craft:     () => { tone(440, 0.1, 'triangle', 0.25); tone(554, 0.1, 'triangle', 0.25); setTimeout(() => tone(880, 0.5, 'sine', 0.3), 120); },
    toggle:    () => { noise(0.25, 0.18, 2500); tone(520, 0.3, 'sine', 0.2, -260); },
    dash:      () => { noise(0.18, 0.15, 4000); },
    shield:    () => { tone(330, 0.3, 'sine', 0.2, 110); },
    boom:      () => { tone(60, 0.8, 'sine', 0.5, -30); noise(0.6, 0.3, 500); },
    boss:      () => { tone(82, 1.6, 'sawtooth', 0.3, -20); tone(110, 1.6, 'sine', 0.3); },
    win:       () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.7, 'sine', 0.28), i * 170)); },
  };

  return { play: (name) => { try { lib[name] && lib[name](); } catch (e) {} }, ensure };
})();

/* ---------------- 通用工具 ---------------- */
const Util = {
  rand: (a, b) => a + Math.random() * (b - a),
  dist2d: (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
  // 相机前向(水平投影)
  camForward: () => {
    const d = new THREE.Vector3();
    G.camera.getWorldDirection(d);
    return d;
  },
  // 准星瞄准点:沿视线远点 + 对附近敌人的柔性吸附(辅助瞄准)
  aimPoint: () => {
    const dir = Util.camForward();
    const origin = G.camera.position;
    let bestPoint = null, bestPerp = Infinity;
    const cands = G.enemies.slice();
    if (G.boss && !G.boss.dead) cands.push(G.boss);
    for (const e of cands) {
      if (e.dead) continue;
      const c = e.pos.clone();
      c.y += (e.radius >= 4 ? 6 : 1.2);          // 瞄准躯干/Boss 核心
      const toE = c.clone().sub(origin);
      const proj = toE.dot(dir);
      if (proj < 4 || proj > 90) continue;
      const perp = toE.addScaledVector(dir, -proj).length();
      const tol = 1.6 + proj * 0.06;             // 吸附锥随距离展开
      if (perp < tol && perp < bestPerp) { bestPerp = perp; bestPoint = c; }
    }
    return bestPoint || origin.clone().addScaledVector(dir, 70);
  },
};
