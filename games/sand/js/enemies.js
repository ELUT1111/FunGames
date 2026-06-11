/* =========================================================
 * enemies.js — 沙魇（流沙怨灵）、沙弹、弹反与脉冲战斗
 * ========================================================= */
'use strict';

const WRAITH_SPOTS = [
  { x: 112, z: -8 },    // 学堂广场
  { x: 102, z: 14 },
  { x: 4,   z: 102 },   // 机械遗迹
  { x: -114, z: -94 },  // 沉沙之窖
  { x: -126, z: -106 },
];

function makeWraith(scene, home) {
  const grp = new THREE.Group();
  const baseY = G.terrainHeight(home.x, home.z) + 2.2;
  grp.position.set(home.x, baseY, home.z);

  // 旋转的暗沙之躯
  const N = 110;
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const seeds = [];
  for (let i = 0; i < N; i++) {
    seeds.push({
      th: Math.random() * TAU, y: (Math.random() - 0.5) * 2.4,
      r: 0.25 + Math.random() * 0.85, sp: 1.5 + Math.random() * 3,
    });
  }
  const mat = new THREE.PointsMaterial({
    map: TEX.dot, color: 0x4a3b52, size: 0.3, transparent: true, opacity: 0.9,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  grp.add(pts);
  // 燃烧的眼
  const eye = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow, color: 0xff5a3c, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  eye.scale.setScalar(0.85);
  eye.position.y = 0.7;
  grp.add(eye);
  scene.add(grp);

  const wraith = {
    grp, home, baseY, hp: 2, dead: false,
    shootCd: 2 + Math.random() * 2,
    phase: Math.random() * TAU,
    update(dt, playerPos) {
      if (this.dead) return;
      this.phase += dt;
      // 粒子涡旋（翻转时涡旋松散逆转）
      const ts = 1 - 1.7 * G.flip;
      for (let i = 0; i < N; i++) {
        const s = seeds[i];
        s.th += dt * s.sp * ts;
        arr[i * 3] = Math.cos(s.th) * s.r * (1 + Math.sin(s.y * 3 + this.phase) * 0.15);
        arr[i * 3 + 1] = s.y + Math.sin(this.phase * 2 + s.th) * 0.1;
        arr[i * 3 + 2] = Math.sin(s.th) * s.r * (1 + Math.sin(s.y * 3 + this.phase) * 0.15);
      }
      geo.attributes.position.needsUpdate = true;
      eye.material.opacity = 0.7 + Math.sin(this.phase * 5) * 0.3;

      const d = this.grp.position.distanceTo(playerPos);
      if (d < 34) {
        // 追猎：缓慢逼近 + 射击
        const dir = playerPos.clone().sub(this.grp.position); dir.y = 0; dir.normalize();
        this.grp.position.addScaledVector(dir, dt * 1.6 * (G.flipActive ? -0.6 : 1));
        this.shootCd -= dt;
        if (this.shootCd <= 0 && !G.flipActive && d > 4) {
          this.shootCd = 2.6;
          fireBolt(this, playerPos);
        }
      } else {
        // 游荡归位
        const back = new THREE.Vector3(this.home.x, 0, this.home.z).sub(
          new THREE.Vector3(this.grp.position.x, 0, this.grp.position.z));
        if (back.length() > 2) this.grp.position.addScaledVector(back.normalize(), dt * 1.2);
      }
      this.grp.position.y = this.baseY + Math.sin(this.phase * 1.3) * 0.35;
    },
    hit(dmg, fromFlip) {
      if (this.dead) return;
      this.hp -= dmg;
      G.fx.burst(this.grp.position, 0x6b5a78, 40, 5);
      G.audio && G.audio.enemyHit();
      if (this.hp <= 0) this.dissolve(fromFlip);
    },
    dissolve(fromFlip) {
      this.dead = true;
      // 死去的沙魇化回沙粒消散
      G.fx.burst(this.grp.position, 0x8a7898, 80, 8);
      G.fx.burst(this.grp.position, 0xffd780, 50, 5);
      scene.remove(this.grp);
      G.integrity = Math.min(100, G.integrity + 12);
      toast(fromFlip ? '沙魇在逆流的时间中归于沙粒' : '沙魇消散了');
      G.audio && G.audio.enemyDie();
    },
  };
  G.enemies.push(wraith);
  return wraith;
}

/* ---------------- 沙弹 ---------------- */
let boltScene = null;
function fireBolt(owner, targetPos) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow, color: 0xff7a4a, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(0.9);
  s.position.copy(owner.grp.position);
  boltScene.add(s);
  const vel = targetPos.clone().add(new THREE.Vector3(0, 1.1, 0))
    .sub(owner.grp.position).normalize().multiplyScalar(13);
  G.bolts.push({ s, vel, owner, life: 6, reversed: false });
  G.audio && G.audio.shoot();
}

G.updateEnemies = function (dt, playerPos) {
  for (const w of G.enemies) w.update(dt, playerPos);

  for (let i = G.bolts.length - 1; i >= 0; i--) {
    const b = G.bolts[i];
    b.life -= dt;
    // 翻转沙漏：子弹原路返回，射向它的主人
    if (G.flipActive && !b.reversed) {
      b.reversed = true;
      b.vel.multiplyScalar(-1);
      b.s.material.color.setHex(0xffd780);
      G.audio && G.audio.reverse();
    }
    if (b.reversed && b.owner && !b.owner.dead) {
      // 轻微归航向主人
      const home = b.owner.grp.position.clone().sub(b.s.position).normalize().multiplyScalar(13);
      b.vel.lerp(home, Math.min(1, dt * 3));
    }
    b.s.position.addScaledVector(b.vel, dt);
    b.s.material.opacity = clamp(b.life, 0, 1);

    let kill = b.life <= 0;
    if (!kill && !b.reversed && b.s.position.distanceTo(playerPos) < 1.5) {
      G.player.hurt(25);
      kill = true;
    }
    if (!kill && b.reversed && b.owner && !b.owner.dead &&
        b.s.position.distanceTo(b.owner.grp.position) < 1.8) {
      b.owner.hit(2, true);
      kill = true;
    }
    if (!kill && b.s.position.y < G.terrainHeight(b.s.position.x, b.s.position.z)) {
      G.fx.puff(b.s.position, 1.2);
      kill = true;
    }
    if (kill) { boltScene.remove(b.s); G.bolts.splice(i, 1); }
  }
};

/* ---------------- 沙之脉冲（玩家攻击） ---------------- */
let pulseCd = 0;
G.tryPulse = function (playerPos) {
  if (pulseCd > 0 || G.stage < 1) {
    if (G.stage < 1 && pulseCd <= 0) { subtitle('沙漏太空了……先收集记忆之沙，才能凝聚力量'); pulseCd = 1; }
    return;
  }
  pulseCd = 1.4;
  G.fx.pulse(playerPos);
  G.audio && G.audio.pulse();
  for (const w of G.enemies) {
    if (!w.dead && w.grp.position.distanceTo(playerPos) < 8) w.hit(1, false);
  }
  for (let i = G.bolts.length - 1; i >= 0; i--) {
    const b = G.bolts[i];
    if (b.s.position.distanceTo(playerPos) < 8) {
      G.fx.burst(b.s.position, 0xffe0a0, 20, 3);
      boltScene.remove(b.s);
      G.bolts.splice(i, 1);
    }
  }
};
G.updatePulseCd = dt => { if (pulseCd > 0) pulseCd -= dt; };

G.buildEnemies = function (scene) {
  boltScene = scene;
  for (const s of WRAITH_SPOTS) makeWraith(scene, s);
};
