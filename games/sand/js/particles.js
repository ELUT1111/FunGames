/* =========================================================
 * particles.js — 环境沙尘、风痕、沙爆、光柱、光环等粒子特效
 * ========================================================= */
'use strict';

G.fx = {};

/* ---------- 环境飘沙（跟随相机，翻转时逆流而上） ---------- */
function buildAmbientDust(scene) {
  const N = 1400, RANGE = 90;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * RANGE * 2;
    pos[i * 3 + 1] = Math.random() * 30;
    pos[i * 3 + 2] = (Math.random() - 0.5) * RANGE * 2;
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: TEX.dot, color: 0xe8cf96, size: 0.22, transparent: true, opacity: 0.65,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);

  G.fx.dustUpdate = (dt, center) => {
    const a = geo.attributes.position.array;
    const flip = G.flip;
    const wind = 3.2 + Math.sin(G.time * 0.3) * 1.2;
    for (let i = 0; i < N; i++) {
      const s = seed[i];
      // 正常：随风水平飘 + 缓降；翻转：逆流而上
      a[i * 3] += (wind * (0.5 + s) * (1 - flip * 1.2)) * dt;
      a[i * 3 + 1] += (-0.7 * (0.3 + s) + flip * (6 + s * 7)) * dt;
      a[i * 3 + 2] += Math.sin(G.time * 0.8 + s * 9) * dt * 1.5;
      // 包裹在相机周围
      let dx = a[i * 3] - center.x, dy = a[i * 3 + 1] - center.y, dz = a[i * 3 + 2] - center.z;
      if (dx > RANGE) a[i * 3] -= RANGE * 2; else if (dx < -RANGE) a[i * 3] += RANGE * 2;
      if (dz > RANGE) a[i * 3 + 2] -= RANGE * 2; else if (dz < -RANGE) a[i * 3 + 2] += RANGE * 2;
      if (dy < -6) a[i * 3 + 1] += 36; else if (dy > 30) a[i * 3 + 1] -= 36;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.55 + flip * 0.35;
    mat.size = 0.22 + flip * 0.12;
  };
}

/* ---------- 风痕（沙面上掠过的长条光带） ---------- */
function buildWindStreaks(scene) {
  const N = 26;
  const streaks = [];
  const mat = new THREE.SpriteMaterial({
    map: TEX.glow, color: 0xf2dca8, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < N; i++) {
    const s = new THREE.Sprite(mat.clone());
    s.scale.set(14 + Math.random() * 18, 0.5, 1);
    s.userData = { speed: 8 + Math.random() * 9, off: Math.random() * 999 };
    scene.add(s);
    streaks.push(s);
  }
  G.fx.streakUpdate = (dt, center) => {
    for (const s of streaks) {
      const u = s.userData;
      u.off += dt * u.speed * (1 - 2 * G.flip);
      const x = center.x - 70 + ((u.off + u.speed * 31) % 140);
      const z = center.z + Math.sin(u.off * 0.07 + u.speed) * 60;
      s.position.set(x, G.terrainHeight(x, z) + 0.5 + Math.sin(u.off * 0.4) * 0.3, z);
      s.material.opacity = 0.1 + Math.sin(u.off * 0.25) * 0.08 + G.flip * 0.1;
    }
  };
}

/* ---------- 沙爆池（收集 / 命中 / 消散通用） ---------- */
const BURSTS = [];
function buildBurstPool(scene) {
  for (let k = 0; k < 8; k++) {
    const N = 90;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const vel = new Float32Array(N * 3);
    const mat = new THREE.PointsMaterial({
      map: TEX.dot, size: 0.45, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd780,
    });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false; pts.frustumCulled = false;
    scene.add(pts);
    BURSTS.push({ pts, geo, mat, vel, life: 0, max: 1.4, N });
  }
}
G.fx.burst = function (p, colorHex, count = 60, power = 6) {
  const b = BURSTS.find(b => b.life <= 0) || BURSTS[0];
  const a = b.geo.attributes.position.array;
  for (let i = 0; i < b.N; i++) {
    a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.z;
    const th = Math.random() * TAU, ph = Math.acos(Math.random() * 2 - 1);
    const sp = (0.3 + Math.random() * 0.7) * power * (i < count ? 1 : 0);
    b.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
    b.vel[i * 3 + 1] = Math.cos(ph) * sp * 0.8 + power * 0.25;
    b.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
  }
  b.geo.attributes.position.needsUpdate = true;
  b.mat.color.setHex(colorHex);
  b.life = b.max;
  b.pts.visible = true;
};
G.fx.burstsUpdate = function (dt) {
  for (const b of BURSTS) {
    if (b.life <= 0) continue;
    b.life -= dt;
    const a = b.geo.attributes.position.array;
    for (let i = 0; i < b.N; i++) {
      a[i * 3] += b.vel[i * 3] * dt;
      a[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
      a[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
      b.vel[i * 3 + 1] -= 9 * dt;
    }
    b.geo.attributes.position.needsUpdate = true;
    b.mat.opacity = clamp(b.life / b.max, 0, 1) * 0.95;
    if (b.life <= 0) b.pts.visible = false;
  }
};

/* ---------- 脚步沙雾 ---------- */
const PUFFS = [];
function buildPuffs(scene) {
  const mat = new THREE.SpriteMaterial({
    map: TEX.glow, color: 0xd8b87e, transparent: true, opacity: 0, depthWrite: false,
  });
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(mat.clone());
    s.visible = false;
    scene.add(s);
    PUFFS.push({ s, life: 0 });
  }
}
G.fx.puff = function (p, scale = 1) {
  const f = PUFFS.find(f => f.life <= 0); if (!f) return;
  f.s.position.copy(p); f.s.position.y += 0.15;
  f.s.scale.setScalar(0.4 * scale);
  f.life = 0.55; f.s.visible = true; f.baseScale = scale;
};
G.fx.puffsUpdate = function (dt) {
  for (const f of PUFFS) {
    if (f.life <= 0) continue;
    f.life -= dt;
    const t = 1 - f.life / 0.55;
    f.s.scale.setScalar((0.4 + t * 1.6) * (f.baseScale || 1));
    f.s.material.opacity = (1 - t) * 0.4;
    f.s.position.y += dt * 0.6;
    if (f.life <= 0) f.s.visible = false;
  }
};

/* ---------- 谜题重组时的金沙逆流 ---------- */
let sparkleAcc = 0;
G.fx.puzzleSparkle = function (puzzle) {
  sparkleAcc += 1;
  if (sparkleAcc % 4 !== 0) return;
  const pc = puzzle.pieces[(Math.random() * puzzle.pieces.length) | 0];
  G.fx.burst(pc.mesh.position, 0xffe2a0, 14, 2.2);
};

/* ---------- 记忆沙粒可视化 ---------- */
G.fx.makeGrainVisual = function (scene, pos, colorHex) {
  const grp = new THREE.Group();
  grp.position.copy(pos);
  // 核心辉光
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow, color: colorHex, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  core.scale.setScalar(1.6);
  grp.add(core);
  // 环绕沙粒
  const N = 50;
  const geo = new THREE.BufferGeometry();
  const a = new Float32Array(N * 3);
  const seeds = [];
  for (let i = 0; i < N; i++) {
    seeds.push({ r: 0.6 + Math.random() * 1.1, th: Math.random() * TAU, ph: Math.random() * TAU, sp: 0.5 + Math.random() });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: TEX.dot, color: colorHex, size: 0.16, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  grp.add(pts);
  // 远处可见的光柱信标
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.7, 60, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  beam.position.y = 30;
  grp.add(beam);
  scene.add(grp);

  return {
    grp, beam,
    update(dt, playerPos) {
      const t = G.time;
      for (let i = 0; i < N; i++) {
        const s = seeds[i];
        s.th += dt * s.sp * (1 - 2 * G.flip);
        a[i * 3] = Math.cos(s.th) * s.r;
        a[i * 3 + 1] = Math.sin(s.ph + t * s.sp * 0.7) * 0.5;
        a[i * 3 + 2] = Math.sin(s.th) * s.r;
      }
      geo.attributes.position.needsUpdate = true;
      core.material.opacity = 0.75 + Math.sin(t * 3) * 0.2;
      core.scale.setScalar(1.4 + Math.sin(t * 2.2) * 0.25);
      grp.position.y = this.baseY + Math.sin(t * 1.3) * 0.25;
      // 靠近时光柱淡出
      const d = playerPos.distanceTo(grp.position);
      beam.material.opacity = 0.16 * smoothstep(6, 26, d);
    },
    baseY: pos.y,
    dispose() { scene.remove(grp); },
  };
};

/* ---------- 玩家金沙光环（最终形态） ---------- */
G.fx.makeAura = function (parent) {
  const N = 80;
  const geo = new THREE.BufferGeometry();
  const a = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const seeds = [];
  for (let i = 0; i < N; i++) seeds.push({ th: Math.random() * TAU, r: 0.5 + Math.random() * 0.7, y: Math.random() * 2, sp: 1 + Math.random() * 2 });
  const mat = new THREE.PointsMaterial({
    map: TEX.dot, color: 0xffd463, size: 0.13, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  parent.add(pts);
  return {
    setVisible(v) { mat.opacity = v ? 0.9 : 0; },
    update(dt) {
      if (mat.opacity <= 0) return;
      for (let i = 0; i < N; i++) {
        const s = seeds[i];
        s.th += dt * s.sp;
        s.y += dt * 0.7 * (1 - 2 * G.flip);
        if (s.y > 2.4) s.y = 0; if (s.y < 0) s.y = 2.4;
        a[i * 3] = Math.cos(s.th) * s.r * (1 + Math.sin(s.y * 2) * 0.2);
        a[i * 3 + 1] = s.y;
        a[i * 3 + 2] = Math.sin(s.th) * s.r * (1 + Math.sin(s.y * 2) * 0.2);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
};

/* ---------- 沙之脉冲（攻击波） ---------- */
let pulseRing = null;
function buildPulse(scene) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffe0a0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.18, 8, 36), mat);
  m.rotation.x = Math.PI / 2;
  m.visible = false;
  scene.add(m);
  pulseRing = { m, mat, life: 0 };
}
G.fx.pulse = function (pos) {
  pulseRing.m.position.copy(pos); pulseRing.m.position.y += 0.6;
  pulseRing.life = 0.5; pulseRing.m.visible = true;
};
G.fx.pulseUpdate = function (dt) {
  if (!pulseRing || pulseRing.life <= 0) return;
  pulseRing.life -= dt;
  const t = 1 - pulseRing.life / 0.5;
  pulseRing.m.scale.setScalar(1 + t * 7);
  pulseRing.mat.opacity = (1 - t) * 0.8;
  if (pulseRing.life <= 0) pulseRing.m.visible = false;
};

/* ---------- 总装 ---------- */
G.buildParticles = function (scene) {
  buildAmbientDust(scene);
  buildWindStreaks(scene);
  buildBurstPool(scene);
  buildPuffs(scene);
  buildPulse(scene);
};
