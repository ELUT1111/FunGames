/* =========================================================
 * player.js — 沙漏行者：双玻璃球躯体、内部流沙、四阶段进化、移动
 * ========================================================= */
'use strict';

G.createPlayer = function (scene) {
  /* ---------------- 外形 ---------------- */
  const root = new THREE.Group();          // 物理位置
  const visual = new THREE.Group();        // 整体外观（行走前倾等）
  const spin = new THREE.Group();          // 沙漏躯干：以束腰为轴心，可整体倒转
  spin.position.y = 1.2;
  visual.add(spin);
  root.add(visual);
  scene.add(root);

  // 玻璃材质（随进化变化）
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfe0f2, transparent: true, opacity: 0.32,
    roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
  });
  const limbMat = new THREE.MeshPhysicalMaterial({
    color: 0xc8d8ea, transparent: true, opacity: 0.5,
    roughness: 0.15, metalness: 0, clearcoat: 0.8,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0xcfd8e8, transparent: true, opacity: 0.55,
    emissive: 0x6fd8ff, emissiveIntensity: 0.25,
    roughness: 0.2, metalness: 0.1,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xb98a3e, roughness: 0.35, metalness: 0.9,
    emissive: 0xff9a30, emissiveIntensity: 0,
  });

  // —— 沙漏躯干：上下双玻璃球 + 黄铜束腰（挂在 spin 组内，坐标相对束腰） ——
  const bulbTop = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), glassMat);
  bulbTop.position.y = 0.42;
  bulbTop.scale.y = 1.06;
  const bulbBot = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 14), glassMat);
  bulbBot.position.y = -0.42;
  bulbBot.scale.y = 1.06;
  const waist = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.07, 8, 18), brassMat);
  waist.rotation.x = Math.PI / 2;
  // 束腰上的微型齿轮（蒸汽朋克细节）
  const gears = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 6, 10), brassMat);
    const a = i * TAU / 3;
    g.position.set(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26);
    g.rotation.y = -a;
    spin.add(g);
    gears.push(g);
  }
  // 顶冠：悬浮的新月碎片
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 18, Math.PI * 1.2), jointMat);
  halo.position.y = 1.05;
  halo.rotation.z = Math.PI * 0.9;
  spin.add(bulbTop, bulbBot, waist, halo);
  // 胸口辉光：让透明躯体在沙海中始终可辨
  const heartGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow, color: 0xffd88a, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  heartGlow.scale.setScalar(1.1);
  spin.add(heartGlow);

  // —— 纤细的玻璃四肢 ——
  function limb(len) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, len, 7), limbMat);
    m.geometry.translate(0, -len / 2, 0); // 顶端为枢轴
    return m;
  }
  const armL = limb(0.78); armL.position.set(-0.5, 1.52, 0);
  const armR = limb(0.78); armR.position.set(0.5, 1.52, 0);
  const legL = limb(0.62); legL.position.set(-0.2, 0.5, 0);
  const legR = limb(0.62); legR.position.set(0.2, 0.5, 0);
  // 晶体关节
  const joints = [];
  for (const [x, y] of [[-0.5, 1.52], [0.5, 1.52], [-0.2, 0.5], [0.2, 0.5]]) {
    const j = new THREE.Mesh(new THREE.OctahedronGeometry(0.085), jointMat);
    j.position.set(x, y, 0);
    visual.add(j);
    joints.push(j);
  }
  visual.add(armL, armR, legL, legR);
  visual.traverse(o => { if (o.isMesh) o.castShadow = true; });

  /* ---------------- 内部流沙 ---------------- */
  const sandMat = new THREE.PointsMaterial({
    map: TEX.dot, color: 0xffd368, size: 0.055, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  // 下球沙堆
  const NB = 150;
  const botGeo = new THREE.BufferGeometry();
  const botArr = new Float32Array(NB * 3);
  for (let i = 0; i < NB; i++) {
    const th = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.34;
    const hMax = 0.3 * (1 - (r / 0.36) * (r / 0.36));
    botArr[i * 3] = Math.cos(th) * r;
    botArr[i * 3 + 1] = 0.46 + Math.random() * hMax - 0.36;
    botArr[i * 3 + 2] = Math.sin(th) * r;
  }
  botGeo.setAttribute('position', new THREE.BufferAttribute(botArr, 3));
  const botSand = new THREE.Points(botGeo, sandMat);
  botSand.position.y = -0.5;
  botSand.frustumCulled = false;
  // 上球沙堆（随收集减少——倒计时之沙）
  const NT = 80;
  const topGeo = new THREE.BufferGeometry();
  const topArr = new Float32Array(NT * 3);
  for (let i = 0; i < NT; i++) {
    const th = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.28;
    topArr[i * 3] = Math.cos(th) * r;
    topArr[i * 3 + 1] = -0.3 + Math.random() * 0.16;
    topArr[i * 3 + 2] = Math.sin(th) * r;
  }
  topGeo.setAttribute('position', new THREE.BufferAttribute(topArr, 3));
  const topSand = new THREE.Points(topGeo, sandMat);
  topSand.position.y = 0.42;
  topSand.frustumCulled = false;
  // 中流细沙
  const NS = 26;
  const strGeo = new THREE.BufferGeometry();
  const strArr = new Float32Array(NS * 3);
  const strSeed = [];
  for (let i = 0; i < NS; i++) { strSeed.push(Math.random()); strArr[i * 3 + 1] = 0.4 - strSeed[i] * 0.5; }
  strGeo.setAttribute('position', new THREE.BufferAttribute(strArr, 3));
  const stream = new THREE.Points(strGeo, sandMat);
  stream.frustumCulled = false;
  spin.add(botSand, topSand, stream);

  /* ---------------- 状态 ---------------- */
  const P = {
    root, visual,
    pos: root.position,
    vel: new THREE.Vector3(),
    yaw: 0,
    onGround: true,
    jumpsLeft: 1,
    walkPhase: 0,
    stepTimer: 0,
    flipSpin: 0,        // 翻转沙漏的躯体旋转动画
    aura: G.fx.makeAura(root),
    hurtCd: 0,
  };
  P.pos.set(0, G.groundHeight(0, 0), 0);

  /* ---------------- 进化 ---------------- */
  const STAGE_NAMES = ['残缺玻璃', '沙肤初成', '晶骨流金', '时之完体'];
  P.applyStage = function (s) {
    P.stage = s;
    G.stage = s;
    $('stageTag').textContent = '形态 · ' + STAGE_NAMES[s];
    // 0 透明易碎 → 1 沙质皮肤 → 2 晶体关节 → 3 金沙流光
    glassMat.opacity = [0.32, 0.36, 0.4, 0.46][s];
    glassMat.color.setHex([0xcfe0f2, 0xf0e2c4, 0xfbeecb, 0xffeebb][s]);
    limbMat.opacity = [0.5, 0.82, 0.88, 0.95][s];
    limbMat.color.setHex([0xc8d8ea, 0xd8b274, 0xe3c388, 0xf2d089][s]);
    limbMat.roughness = [0.15, 0.85, 0.4, 0.25][s];
    jointMat.opacity = [0.55, 0.7, 1, 1][s];
    jointMat.emissiveIntensity = [0.25, 0.4, 1.1, 1.6][s];
    jointMat.emissive.setHex(s >= 3 ? 0xffc24a : 0x6fd8ff);
    brassMat.emissiveIntensity = [0, 0.1, 0.4, 1.0][s];
    sandMat.size = [0.065, 0.07, 0.075, 0.08][s];
    P.aura.setVisible(s >= 3);
    P.jumpMax = s >= 3 ? 2 : 1;
  };
  P.jumpMax = 1;
  P.applyStage(0);

  /* ---------------- 每帧更新 ---------------- */
  const tmpDir = new THREE.Vector3();
  P.update = function (dt, input, camYaw) {
    // —— 移动 ——
    tmpDir.set(0, 0, 0);
    if (input.f) tmpDir.z -= 1;
    if (input.b) tmpDir.z += 1;
    if (input.l) tmpDir.x -= 1;
    if (input.r) tmpDir.x += 1;
    const moving = tmpDir.lengthSq() > 0;
    let maxSp = (input.run ? 11.5 : 7) * (1 + G.speedBonus) * (1 + G.stage * 0.06);
    if (moving) {
      tmpDir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw);
      P.vel.x = lerp(P.vel.x, tmpDir.x * maxSp, 1 - Math.exp(-10 * dt));
      P.vel.z = lerp(P.vel.z, tmpDir.z * maxSp, 1 - Math.exp(-10 * dt));
      const targetYaw = Math.atan2(tmpDir.x, tmpDir.z);
      let dy = targetYaw - P.yaw;
      while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
      P.yaw += dy * Math.min(1, 12 * dt);
    } else {
      P.vel.x = lerp(P.vel.x, 0, 1 - Math.exp(-8 * dt));
      P.vel.z = lerp(P.vel.z, 0, 1 - Math.exp(-8 * dt));
    }
    // —— 跳跃 & 重力 ——
    if (input.jumpPressed && P.jumpsLeft > 0) {
      P.vel.y = 10.5;
      P.jumpsLeft--;
      P.onGround = false;
      G.fx.puff(P.pos, 1.4);
      G.audio && G.audio.jump();
      input.jumpPressed = false;
    }
    P.vel.y -= 24 * dt;
    P.pos.x += P.vel.x * dt;
    P.pos.z += P.vel.z * dt;
    P.pos.y += P.vel.y * dt;
    // 世界边界（沙暴之墙）
    const rr = Math.hypot(P.pos.x, P.pos.z);
    if (rr > 185) {
      P.pos.x *= 185 / rr; P.pos.z *= 185 / rr;
      if (!P._edgeWarn || G.time - P._edgeWarn > 6) {
        subtitle('再往前，是连记忆都无法存在的沙暴……');
        P._edgeWarn = G.time;
      }
    }
    const gnd = G.groundHeight(P.pos.x, P.pos.z, P.pos.y);
    if (P.pos.y <= gnd) {
      if (!P.onGround && P.vel.y < -7) G.fx.puff(P.pos, 1.8);
      P.pos.y = gnd;
      P.vel.y = 0;
      P.onGround = true;
      P.jumpsLeft = P.jumpMax;
    } else if (P.pos.y > gnd + 0.05) {
      P.onGround = false;
    }

    // —— 外观动画 ——
    root.rotation.y = P.yaw;
    const speed = Math.hypot(P.vel.x, P.vel.z);
    P.walkPhase += dt * speed * 1.7;
    const sw = Math.min(1, speed / 7);
    legL.rotation.x = Math.sin(P.walkPhase) * 0.75 * sw;
    legR.rotation.x = -Math.sin(P.walkPhase) * 0.75 * sw;
    armL.rotation.x = -Math.sin(P.walkPhase) * 0.55 * sw;
    armR.rotation.x = Math.sin(P.walkPhase) * 0.55 * sw;
    visual.position.y = Math.abs(Math.sin(P.walkPhase)) * 0.07 * sw + Math.sin(G.time * 1.8) * 0.025;
    visual.rotation.x = sw * 0.12; // 前倾
    halo.rotation.y += dt * 1.5;
    for (const g of gears) g.rotation.x += dt * (2 + G.stage);

    // —— 翻转动画：沙漏躯干绕束腰倒转 ——
    const targetSpin = G.flipActive ? Math.PI : 0;
    P.flipSpin = lerp(P.flipSpin, targetSpin, 1 - Math.exp(-7 * dt));
    spin.rotation.z = P.flipSpin;

    // —— 内部流沙 ——
    const fill = (G.absorbed.gold + G.absorbed.blue + G.absorbed.gray + G.absorbed.black) / G.totalGrains;
    botGeo.setDrawRange(0, Math.max(22, Math.floor(NB * fill)));
    topGeo.setDrawRange(0, Math.max(12, Math.floor(NT * (1 - fill * 0.8))));
    heartGlow.material.opacity = 0.4 + Math.sin(G.time * 2.4) * 0.15 + G.stage * 0.06;
    const sArr = strGeo.attributes.position.array;
    const dir = G.flipActive ? 1 : -1;
    for (let i = 0; i < NS; i++) {
      strSeed[i] += dt * (1.1 + (i % 5) * 0.1) * 0.8;
      const t = strSeed[i] % 1;
      sArr[i * 3] = (hash2(i, 1) - 0.5) * 0.04;
      sArr[i * 3 + 1] = dir > 0 ? -0.5 + t * 0.9 : 0.4 - t * 0.9;
      sArr[i * 3 + 2] = (hash2(i, 9) - 0.5) * 0.04;
    }
    strGeo.attributes.position.needsUpdate = true;

    // —— 脚步沙雾 ——
    if (P.onGround && speed > 2) {
      P.stepTimer -= dt;
      if (P.stepTimer <= 0) {
        P.stepTimer = 2.4 / speed;
        G.fx.puff(P.pos, 0.9);
        G.audio && G.audio.step();
      }
    }
    P.aura.update(dt);
    if (P.hurtCd > 0) P.hurtCd -= dt;
  };

  /* ---------------- 受击 / 死亡 ---------------- */
  P.hurt = function (dmg) {
    if (P.hurtCd > 0) return;
    P.hurtCd = 0.8;
    G.integrity = Math.max(0, G.integrity - dmg);
    G.lastHurtTime = G.time;
    G.fx.burst(P.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xffffff, 30, 4);
    G.audio && G.audio.hurt();
    G.shake = 0.5;
    const fx = $('hurtfx');
    fx.style.transition = 'none'; fx.style.opacity = 1;
    requestAnimationFrame(() => { fx.style.transition = 'opacity 1s'; fx.style.opacity = 0; });
    if (G.integrity <= 0 && G.onPlayerDeath) G.onPlayerDeath();
  };

  return P;
};
