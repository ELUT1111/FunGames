/* ============================================================
 * 活字灵境 · player.js
 * 「人」字灵体:移动 / 跳跃 / 墨遁 / 进化(字→词→句→活书)/ 相机
 * ============================================================ */
'use strict';

const Player = (() => {
  // 进化阶段
  const STAGES = [
    { text: '人',           label: '字形态 ·「人」',          size: 2.0 },
    { text: '行人',         label: '词语形态 ·「行人」',       size: 1.9 },
    { text: '行人观世',     label: '词组形态 ·「行人观世」',   size: 1.8 },
    { text: '行人执笔书山河', label: '句子形态 ·「行人执笔书山河」', size: 1.6 },
    { text: '书',           label: '活书形态 · 命运由我书写',  size: 2.6, book: true },
  ];

  const P = {
    pos: new THREE.Vector3(0, 0, 12),
    vel: new THREE.Vector3(),
    onGround: true,
    hp: 100, maxHp: 100,
    ink: 60, maxInk: 100,
    stage: 0,
    group: null, body: null, orbit: [], shadow: null,
    invisT: 0,           // 隐身剩余
    dashCd: 0, atkCd: 0, shieldT: 0, shieldCd: 0,
    hurtCd: 0,
    trailT: 0,
    radius: 0.6,
  };

  function init() {
    P.group = new THREE.Group();
    rebuildBody();
    // 脚下墨晕(影子)
    const mat = new THREE.SpriteMaterial({ map: GlyphLib.ink(), color: 0x0a0c14, transparent: true, opacity: 0.55, depthWrite: false });
    P.shadow = new THREE.Sprite(mat);
    P.shadow.scale.set(2, 1, 1);
    G.scene.add(P.shadow);
    G.scene.add(P.group);
    G.player = P;
  }

  function rebuildBody() {
    if (P.body) P.group.remove(P.body);
    P.orbit.forEach(s => P.group.remove(s));
    P.orbit = [];
    const st = STAGES[P.stage];
    if (st.book) {
      // 活书形态:书形 + 环绕活字
      const book = new THREE.Group();
      const cover = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 2.3, 0.45),
        new THREE.MeshLambertMaterial({ color: 0x3a2c18, emissive: 0x140c04 })
      );
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(cover.geometry),
        new THREE.LineBasicMaterial({ color: 0xe8c878, transparent: true, opacity: 0.7 })
      );
      cover.add(edge);
      book.add(cover);
      const face = GlyphLib.sprite('书', 1.5, '#ffe9b0');
      face.position.z = 0.3;
      book.add(face);
      P.body = book;
    } else {
      P.body = GlyphLib.sprite(st.text, st.size, '#f4f6ff');
    }
    P.body.position.y = 1.3;
    P.group.add(P.body);
    // 高阶环绕字
    if (P.stage >= 2) {
      const ring = '山水树城风火雷光'.slice(0, 2 + P.stage * 2);
      for (let i = 0; i < ring.length; i++) {
        const s = GlyphLib.sprite(ring[i], 0.45, '#9fc0ff', 0.8);
        P.orbit.push(s);
        P.group.add(s);
      }
    }
  }

  function evolve(stage) {
    if (stage <= P.stage) return;
    P.stage = Math.min(stage, STAGES.length - 1);
    rebuildBody();
    P.maxInk += 10; P.ink = P.maxInk;
    P.maxHp += 10; P.hp = P.maxHp;
    FX.glyphBurst(P.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), STAGES[P.stage].text, '#cfe0ff', 22, 8, 0.6);
    SFX.play('glyph');
    UI.setStage(STAGES[P.stage].label);
    UI.message('字魂共鸣 —— 进化为 ' + STAGES[P.stage].label);
  }

  /* ---------- 伤害与死亡 ---------- */
  function damage(amount) {
    if (P.hurtCd > 0 || G.over) return;
    if (P.invisT > 0) return;
    P.hp -= amount;
    P.hurtCd = 0.8;
    SFX.play('hurt');
    FX.shake(0.5);
    FX.flash(0.25, 200);
    FX.inkSplash(P.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), '#5a1016', 1.6, 3);
    if (P.hp <= 0) { P.hp = 0; die(); }
  }

  function die() {
    G.over = true;
    FX.glyphBurst(P.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), STAGES[P.stage].text + '散墨灭', '#8a93a8', 30, 10, 0.7);
    P.group.visible = false;
    SFX.play('boom');
    UI.showDeath();
  }

  function respawn() {
    P.hp = P.maxHp; P.ink = P.maxInk;
    P.pos.set(0, 0, 12); P.vel.set(0, 0, 0);
    P.group.visible = true;
    G.over = false;
  }

  /* ---------- 移动控制 ---------- */
  const SPEED = 11, JUMP = 13, GRAV = -30;

  function update(dt) {
    if (G.over) return;
    P.dashCd = Math.max(0, P.dashCd - dt);
    P.atkCd = Math.max(0, P.atkCd - dt);
    P.hurtCd = Math.max(0, P.hurtCd - dt);
    P.shieldT = Math.max(0, P.shieldT - dt);
    P.shieldCd = Math.max(0, P.shieldCd - dt);
    P.invisT = Math.max(0, P.invisT - dt);
    P.ink = Math.min(P.maxInk, P.ink + dt * 4);  // 墨量自然回复

    // 输入向量(严格相对相机朝向:W = 视角正前方)
    let fwd = 0, right = 0;
    if (G.keys['KeyW']) fwd += 1;
    if (G.keys['KeyS']) fwd -= 1;
    if (G.keys['KeyD']) right += 1;
    if (G.keys['KeyA']) right -= 1;
    const moving = fwd !== 0 || right !== 0;
    let dir = new THREE.Vector3();
    if (moving) {
      const sin = Math.sin(G.yaw), cos = Math.cos(G.yaw);
      // 相机水平前向 = (-sin, -cos),右向 = (cos, -sin)
      dir.set(-sin * fwd + cos * right, 0, -cos * fwd - sin * right).normalize();
      P.vel.x = dir.x * SPEED;
      P.vel.z = dir.z * SPEED;
    } else {
      P.vel.x *= Math.pow(0.0001, dt);
      P.vel.z *= Math.pow(0.0001, dt);
    }

    // 轻字领域:低重力
    let grav = GRAV, jumpV = JUMP;
    for (const z of G.lightZones) {
      if (P.pos.distanceTo(z.pos) < z.r) { grav = GRAV * 0.32; jumpV = JUMP * 1.45; }
    }

    // 跳跃
    if (G.keys['Space'] && P.onGround) {
      P.vel.y = jumpV;
      P.onGround = false;
      FX.inkSplash(P.pos.clone(), '#1a1f2e', 1.2, 2);
    }
    // 墨遁(冲刺;冷却与耗墨受「行之试炼」强化)
    if (G.keys['ShiftLeft'] && P.dashCd <= 0 && moving && P.ink >= G.buffs.dashCost) {
      P.ink -= G.buffs.dashCost; P.dashCd = G.buffs.dashCd;
      P.vel.x = dir.x * 34; P.vel.z = dir.z * 34;
      SFX.play('dash');
      Sky.ripple(P.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0.85);
      // 残影
      for (let i = 0; i < 4; i++) {
        const ghost = GlyphLib.sprite(STAGES[P.stage].text, STAGES[P.stage].size, '#6f86c2', 0.5);
        ghost.position.copy(P.pos).add(new THREE.Vector3(-dir.x * i * 0.9, 1.3, -dir.z * i * 0.9));
        FX.spawn({ sprite: ghost, vel: new THREE.Vector3(0, 0.3, 0), life: 0.4 + i * 0.06 });
      }
    }

    // 重力与位移
    P.vel.y += grav * dt;
    P.pos.addScaledVector(P.vel, dt);
    World.resolveColliders(P.pos, P.radius);

    // 地面
    const gh = World.groundHeight(P.pos.x, P.pos.z);
    if (gh <= -30) {
      // 坠入裂谷
      if (P.pos.y < -12) {
        damage(15);
        P.hurtCd = 0;  // 允许连续提示
        P.pos.set(34, 1, 36); P.vel.set(0, 0, 0);
        UI.message('坠入未书写的虚空…… 需要一座「桥」。');
      }
    } else if (P.pos.y <= gh) {
      P.pos.y = gh;
      P.vel.y = 0;
      P.onGround = true;
    } else if (P.pos.y > gh + 0.05) {
      P.onGround = false;
    }
    // 世界边界
    const R = Math.hypot(P.pos.x, P.pos.z);
    if (R > 250) { P.pos.x *= 250 / R; P.pos.z *= 250 / R; }

    // 同步模型
    P.group.position.copy(P.pos);
    // 灵体悬浮呼吸
    P.body.position.y = 1.3 + Math.sin(G.t * 2.2) * 0.12;
    if (P.body.rotation) P.body.rotation.y = -G.yaw;
    P.shadow.position.set(P.pos.x, Math.max(0, World.groundHeight(P.pos.x, P.pos.z)) + 0.06, P.pos.z);
    const airK = Math.max(0.3, 1 - (P.pos.y - World.groundHeight(P.pos.x, P.pos.z)) * 0.1);
    P.shadow.scale.set(2 * airK, airK, 1);
    // 隐身视觉
    const targetOp = P.invisT > 0 ? 0.18 : 1;
    if (P.body.material) P.body.material.opacity += (targetOp - P.body.material.opacity) * dt * 8;
    // 环绕活字
    P.orbit.forEach((s, i) => {
      const a = G.t * 1.4 + (i / P.orbit.length) * 6.28;
      s.position.set(Math.cos(a) * 1.6, 1.4 + Math.sin(G.t * 2 + i) * 0.25, Math.sin(a) * 1.6);
    });
    // 移动墨迹拖尾
    P.trailT -= dt;
    if (moving && P.onGround && P.trailT <= 0) {
      P.trailT = 0.12;
      const f = GlyphLib.flat('丶', Util.rand(0.4, 0.8), '#3a4258', 0.5);
      f.position.set(P.pos.x + Util.rand(-0.3, 0.3), World.groundHeight(P.pos.x, P.pos.z) + 0.05, P.pos.z + Util.rand(-0.3, 0.3));
      f.rotation.z = Math.random() * 6.28;
      FX.spawn({ sprite: f, vel: new THREE.Vector3(), life: 1.6 });
    }

    updateCamera(dt);
  }

  /* ---------- 第三人称轨道相机:俯仰直接控制视线仰角 ---------- */
  const camOffset = new THREE.Vector3();
  function updateCamera(dt) {
    const dist = 9;
    const cp = Math.cos(G.pitch), sp = Math.sin(G.pitch);
    // 轨道枢轴在头顶上方,准星默认落在地平线
    const pivot = P.pos.clone().add(new THREE.Vector3(0, 2.3, 0));
    camOffset.set(Math.sin(G.yaw) * cp * dist, -sp * dist, Math.cos(G.yaw) * cp * dist);
    const target = pivot.clone().add(camOffset);
    // 相机不穿地
    const camGround = World.groundHeight(target.x, target.z);
    if (camGround > -10) target.y = Math.max(target.y, camGround + 0.7);
    G.camera.position.lerp(target, 1 - Math.pow(0.0001, dt));
    // 震动
    if (G.shake > 0) {
      G.camera.position.x += Util.rand(-1, 1) * G.shake * 0.3;
      G.camera.position.y += Util.rand(-1, 1) * G.shake * 0.3;
    }
    G.camera.lookAt(pivot);
  }

  return { init, update, evolve, damage, respawn, STAGES };
})();
