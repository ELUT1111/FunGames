/* ============================================================
 * 活字灵境 · world.js
 * 虚空字海、四大区域(山水树城)、具象化蜕变、裂谷与桥、巨石、古印
 * ============================================================ */
'use strict';

const World = (() => {
  const zones = {};          // 区域数据 {山:{...},...}
  const cones = [];          // 山体圆锥高度场 {x,z,r,h}
  const platforms = [];      // AABB 平台 {minX,maxX,minZ,maxZ,y}
  const colliders = [];      // 圆柱碰撞体 {x,z,r}
  const tweens = [];         // 简易补间
  const drift = [];          // 漂浮装饰字
  let riftMarker = null, gear = null, smokes = [], fireflies = [];
  let groundInk = null;
  let fishT = 6;

  const RIFT = { minX: 38, maxX: 78, minZ: 40, maxZ: 64 };  // 裂谷区域

  /* ---------- 高度与碰撞 ---------- */
  function groundHeight(x, z) {
    let h = 0;
    for (const c of cones) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) h = Math.max(h, c.h * (1 - d / c.r) * 0.92);
    }
    for (const p of platforms) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) h = Math.max(h, p.y);
    }
    // 裂谷:未造桥时是深渊
    if (!G.world.bridgeBuilt && inRift(x, z) && h <= 0.01) return -40;
    return h;
  }
  function inRift(x, z) { return x >= RIFT.minX && x <= RIFT.maxX && z >= RIFT.minZ && z <= RIFT.maxZ; }
  function resolveColliders(pos, radius) {
    for (const c of colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + radius;
      if (d < min && d > 0.001 && pos.y < (c.top || 99)) {
        pos.x = c.x + dx / d * min; pos.z = c.z + dz / d * min;
      }
    }
  }

  /* ---------- 补间 ---------- */
  function tween(dur, onUpdate, onDone, ease) {
    tweens.push({ t: 0, dur, onUpdate, onDone, ease: ease || (k => k) });
  }
  const easeOutElastic = k => k === 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * 2.094) + 1;
  const easeInCubic = k => k * k * k;

  /* ---------- 虚空字海 ---------- */
  const VOID_CHARS = '之乎者也云气风雨日月星辰光阴尘梦魂灵道法天地玄黄宇宙洪荒';
  function buildVoid() {
    // 远景漂浮微光活字
    for (let i = 0; i < 230; i++) {
      const ch = VOID_CHARS[Math.floor(Math.random() * VOID_CHARS.length)];
      const s = GlyphLib.sprite(ch, Util.rand(0.8, 3.4), '#cfd6e8', Util.rand(0.12, 0.5));
      const r = Util.rand(40, 320), a = Math.random() * Math.PI * 2;
      s.position.set(Math.cos(a) * r, Util.rand(1, 60), Math.sin(a) * r);
      G.scene.add(s);
      drift.push({ s, base: s.position.y, ph: Math.random() * 6.28, sp: Util.rand(0.2, 0.7), op: s.material.opacity });
    }
    // 地面:由暗淡文字勾勒的"纸面"
    const GROUND_CHARS = '一丨丶丿亠冖宀辶土石尘沙';
    for (let i = 0; i < 240; i++) {
      const ch = GROUND_CHARS[Math.floor(Math.random() * GROUND_CHARS.length)];
      const f = GlyphLib.flat(ch, Util.rand(1, 3), '#6a7080', Util.rand(0.08, 0.22));
      const r = Math.sqrt(Math.random()) * 240, a = Math.random() * Math.PI * 2;
      f.position.set(Math.cos(a) * r, 0.04 + Math.random() * 0.04, Math.sin(a) * r);
      f.rotation.z = Math.random() * 6.28;
      G.scene.add(f);
    }
    // 半透明墨色地面(蜕变后渐显)
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, '#14161c'); g.addColorStop(0.7, '#0a0b10'); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    groundInk = new THREE.Mesh(
      new THREE.CircleGeometry(280, 48),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0 })
    );
    groundInk.rotation.x = -Math.PI / 2; groundInk.position.y = 0.01;
    G.scene.add(groundInk);
  }

  /* ---------- 区域抽象形态:文字勾勒的轮廓云 ---------- */
  function abstractCloud(char, center, layout) {
    const group = new THREE.Group();
    const sprites = [];
    for (const p of layout) {
      const s = GlyphLib.sprite(char, p.s || 1.4, '#e8eef8', Util.rand(0.4, 0.85));
      s.position.set(p.x, p.y, p.z);
      group.add(s); sprites.push(s);
    }
    group.position.copy(center);
    G.scene.add(group);
    return { group, sprites };
  }

  // 山形轮廓点阵
  function mountainLayout() {
    const pts = [];
    for (let i = 0; i < 46; i++) {
      const peak = [{ x: 0, h: 26, w: 17 }, { x: -14, h: 17, w: 11 }, { x: 13, h: 20, w: 12 }][i % 3];
      const t = Math.random();
      const y = t * peak.h;
      const spread = peak.w * (1 - t);
      pts.push({ x: peak.x + Util.rand(-spread, spread), y: y + 1, z: Util.rand(-6, 6), s: Util.rand(1, 2.4) });
    }
    return pts;
  }
  function riverLayout() {
    const pts = [];
    for (let i = 0; i < 36; i++) {
      const t = i / 36;
      pts.push({ x: (t - 0.5) * 84, y: Util.rand(0.6, 2.4), z: Math.sin(t * 5.2) * 7 + Util.rand(-2, 2), s: Util.rand(1, 2) });
    }
    return pts;
  }
  function treeLayout() {
    const pts = [];
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 26;
      pts.push({ x: Math.cos(a) * r, y: Util.rand(1, 11), z: Math.sin(a) * r, s: Util.rand(1, 2.2) });
    }
    return pts;
  }
  function cityLayout() {
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const gx = (i % 8 - 3.5) * 6.4, gz = (Math.floor(i / 8) - 2.5) * 7.5;
      pts.push({ x: gx + Util.rand(-1, 1), y: Util.rand(0.8, 14), z: gz + Util.rand(-1, 1), s: Util.rand(1.1, 2.3) });
    }
    return pts;
  }

  /* ---------- 实体形态构建 ---------- */
  function inkMat(color, emissive = 0x000000) {
    return new THREE.MeshLambertMaterial({ color, emissive, flatShading: true });
  }
  function addEdges(mesh, color = 0x9aa4b8, opacity = 0.28) {
    const e = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 18),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    );
    mesh.add(e);
  }

  function buildMountains(center) {
    const grp = new THREE.Group(); grp.position.copy(center);
    const defs = [
      { x: 0, z: -4, r: 19, h: 27 }, { x: -16, z: 4, r: 13, h: 17 },
      { x: 14, z: 2, r: 14, h: 21 }, { x: -7, z: -14, r: 10, h: 12 }, { x: 8, z: 12, r: 9, h: 10 },
    ];
    for (const d of defs) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(d.r, d.h, 6, 3), inkMat(0x232831));
      m.geometry.translate(0, d.h / 2, 0);
      // 顶点扰动,更像水墨皴法山石
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0.5 && pos.getY(i) < d.h - 0.5) {
          pos.setX(i, pos.getX(i) + Util.rand(-1.2, 1.2));
          pos.setZ(i, pos.getZ(i) + Util.rand(-1.2, 1.2));
        }
      }
      m.geometry.computeVertexNormals();
      addEdges(m);
      m.position.set(d.x, 0, d.z);
      grp.add(m);
      cones.push({ x: center.x + d.x, z: center.z + d.z, r: d.r, h: d.h });
      // 山间点缀"山"字残纹
      const f = GlyphLib.flat('山', 3, '#8a93a8', 0.25);
      f.position.set(d.x + Util.rand(-3, 3), d.h + 0.6, d.z);
      f.rotation.x = -Math.PI / 2;
      grp.add(f);
    }
    return grp;
  }

  let riverTex = null;
  function buildRiver(center) {
    const grp = new THREE.Group(); grp.position.copy(center);
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0c1626'; ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = 'rgba(140,190,255,.5)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      const y = 6 + i * 6;
      for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.07 + i) * 2.6);
      ctx.stroke();
    }
    riverTex = new THREE.CanvasTexture(c);
    riverTex.wrapS = riverTex.wrapT = THREE.RepeatWrapping; riverTex.repeat.set(4, 1);
    // 蜿蜒河道:多段拼接
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(14, 13), new THREE.MeshBasicMaterial({ map: riverTex, transparent: true, opacity: 0.9 }));
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = Math.cos(i * 0.74) * 0.3;
      seg.position.set((i - 3) * 13, 0.08, Math.sin(i * 0.74) * 7);
      grp.add(seg);
    }
    // 漂浮的"水"字随波流动
    for (let i = 0; i < 8; i++) {
      const s = GlyphLib.sprite('水', 0.9, '#9fd0ff', 0.55);
      s.position.set(Util.rand(-42, 42), 0.8, Util.rand(-7, 7));
      grp.add(s);
      drift.push({ s, base: 0.8, ph: Math.random() * 6.28, sp: 1.2, op: 0.55, flowX: 3, group: grp });
    }
    return grp;
  }

  function buildTrees(center) {
    const grp = new THREE.Group(); grp.position.copy(center);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.28 + Util.rand(-0.3, 0.3), r = Util.rand(6, 24);
      const tx = Math.cos(a) * r, tz = Math.sin(a) * r;
      const tree = new THREE.Group();
      const trunkH = Util.rand(3.4, 5.6);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, trunkH, 5), inkMat(0x2a2018));
      trunk.position.y = trunkH / 2; tree.add(trunk);
      for (let j = 0; j < 3; j++) {
        const fol = new THREE.Mesh(new THREE.IcosahedronGeometry(Util.rand(1.4, 2.4), 0), inkMat(0x16331e, 0x05140a));
        fol.position.set(Util.rand(-1, 1), trunkH + j * 1.2 + Util.rand(0, 0.6), Util.rand(-1, 1));
        addEdges(fol, 0x4a7a58, 0.2);
        tree.add(fol);
      }
      tree.position.set(tx, 0, tz);
      grp.add(tree);
      const wx = center.x + tx, wz = center.z + tz;
      colliders.push({ x: wx, z: wz, r: 0.7, top: trunkH });
      // 树可被抽象化为「木」
      Systems.registerTogglable({
        mesh: tree, type: 'tree', name: '古木 · F 抽象化为「木」',
        pos: new THREE.Vector3(wx, 2.5, wz), radius: 2.5,
        onAbstract: () => {
          Systems.gainGlyph('木', 1);
          FX.glyphBurst(new THREE.Vector3(wx, 3, wz), '木枝叶森林', '#7adf9a', 16, 9);
          // 文字洪流冲刷:伤害附近敌人
          Combat.areaDamage(new THREE.Vector3(wx, 1, wz), 8, 30);
          const ci = colliders.findIndex(cc => cc.x === wx && cc.z === wz);
          if (ci >= 0) colliders.splice(ci, 1);
        },
      });
    }
    // 萤光浮字
    for (let i = 0; i < 14; i++) {
      const s = GlyphLib.sprite('叶', 0.4, '#aef0c0', 0.5);
      s.position.set(center.x + Util.rand(-22, 22), Util.rand(1, 7), center.z + Util.rand(-22, 22));
      G.scene.add(s);
      fireflies.push({ s, ph: Math.random() * 6.28 });
    }
    return grp;
  }

  function buildCity(center) {
    const grp = new THREE.Group(); grp.position.copy(center);
    // 青铜广场
    const plaza = new THREE.Mesh(new THREE.BoxGeometry(52, 0.6, 52), inkMat(0x2c241a));
    plaza.position.y = 0.3; addEdges(plaza, 0xc9a25a, 0.3); grp.add(plaza);
    platforms.push({ minX: center.x - 26, maxX: center.x + 26, minZ: center.z - 26, maxZ: center.z + 26, y: 0.6 });
    // 窗格纹理
    const wc = document.createElement('canvas'); wc.width = wc.height = 64;
    const wctx = wc.getContext('2d');
    wctx.fillStyle = '#241c12'; wctx.fillRect(0, 0, 64, 64);
    for (let y = 6; y < 60; y += 12) for (let x = 6; x < 60; x += 12) {
      wctx.fillStyle = Math.random() < 0.55 ? '#ffb84d' : '#3a2f20';
      wctx.fillRect(x, y, 6, 8);
    }
    const winTex = new THREE.CanvasTexture(wc);
    winTex.magFilter = THREE.NearestFilter;
    // 建筑群
    const bdefs = [
      { x: -16, z: -14, w: 9, h: 16 }, { x: -2, z: -18, w: 7, h: 22 }, { x: 13, z: -13, w: 8, h: 13 },
      { x: -18, z: 4, w: 7, h: 10 }, { x: 16, z: 6, w: 9, h: 18 }, { x: 2, z: 16, w: 8, h: 12 }, { x: -12, z: 17, w: 6, h: 9 },
    ];
    for (const b of bdefs) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.h, b.w),
        new THREE.MeshLambertMaterial({ map: winTex, color: 0xb8a888 })
      );
      m.position.set(b.x, b.h / 2 + 0.6, b.z);
      addEdges(m, 0xc9a25a, 0.35);
      grp.add(m);
      colliders.push({ x: center.x + b.x, z: center.z + b.z, r: b.w * 0.72, top: b.h });
      // 烟囱
      if (Math.random() < 0.6) {
        const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3, 6), inkMat(0x3a2c1c));
        chim.position.set(b.x + b.w * 0.25, b.h + 2, b.z);
        grp.add(chim);
        smokes.push({ x: center.x + b.x + b.w * 0.25, y: b.h + 3.6 + 0.6, z: center.z + b.z, t: Math.random() * 2 });
      }
    }
    // 中央巨型齿轮(蒸汽朋克之心)
    gear = new THREE.Group();
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 1, 12), inkMat(0x6a5230, 0x1a1206));
    wheel.rotation.x = Math.PI / 2; addEdges(wheel, 0xe8c878, 0.5);
    gear.add(wheel);
    for (let i = 0; i < 12; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 2), inkMat(0x7a6038));
      const a = (i / 12) * 6.28;
      tooth.position.set(Math.cos(a) * 6.7, Math.sin(a) * 6.7, 0);
      tooth.rotation.z = a;
      gear.add(tooth);
    }
    // 齿轮上的哥特活字
    for (let i = 0; i < 6; i++) {
      const s = GlyphLib.sprite('城邦工业齿轮'[i], 1.6, '#ffd87a', 0.9);
      const a = (i / 6) * 6.28;
      s.position.set(Math.cos(a) * 4, Math.sin(a) * 4, 0.8);
      gear.add(s);
    }
    gear.position.set(0, 11, 0);
    grp.add(gear);
    // 钟楼平台阶梯(通往古印)
    const stairs = [
      { x: 24, z: -2, y: 2.4 }, { x: 27, z: 3, y: 4.8 }, { x: 24, z: 8, y: 7.2 }, { x: 19, z: 10, y: 9.6 },
    ];
    for (const st of stairs) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 4), inkMat(0x4a3a24));
      p.position.set(st.x, st.y, st.z); addEdges(p, 0xc9a25a, 0.4);
      grp.add(p);
      platforms.push({ minX: center.x + st.x - 2, maxX: center.x + st.x + 2, minZ: center.z + st.z - 2, maxZ: center.z + st.z + 2, y: st.y + 0.25 });
    }
    // 暖色灯光
    const light = new THREE.PointLight(0xffb060, 1.4, 90, 1.6);
    light.position.set(0, 20, 0);
    grp.add(light);
    return grp;
  }

  /* ---------- 区域注册与蜕变 ---------- */
  const ZONE_DEFS = {
    '山': { center: new THREE.Vector3(-90, 0, -120), layout: mountainLayout, build: buildMountains, pickupAt: new THREE.Vector3(-66, 2, -92) },
    '水': { center: new THREE.Vector3(100, 0, -60),  layout: riverLayout,  build: buildRiver,  pickupAt: new THREE.Vector3(78, 2, -48) },
    '树': { center: new THREE.Vector3(-40, 0, 80),   layout: treeLayout,   build: buildTrees,  pickupAt: new THREE.Vector3(-28, 2, 62) },
    '城': { center: new THREE.Vector3(120, 0, 120),  layout: cityLayout,   build: buildCity,   pickupAt: new THREE.Vector3(96, 2, 96) },
  };

  function buildZones() {
    for (const [g, def] of Object.entries(ZONE_DEFS)) {
      const cloud = abstractCloud(g, def.center, def.layout());
      zones[g] = { def, cloud, built: null };
      // 世界活字拾取物(大型发光字)
      Systems.addPickup({
        char: g, pos: def.pickupAt.clone(), size: 2.2, color: '#ffffff', kind: 'world',
      });
    }
  }

  // 核心演出:文字汇聚 → 迸发 → 实体隆起
  function transform(g) {
    const z = zones[g];
    if (!z || G.world.collected[g]) return;
    G.world.collected[g] = true;
    G.world.count++;
    SFX.play('transform');
    FX.flash(0.55, 700);
    FX.shake(0.8);
    UI.litWorldGlyph(g);

    const center = z.def.center.clone().add(new THREE.Vector3(0, 6, 0));
    // 第一阶段:轮廓字云螺旋汇聚
    const starts = z.cloud.sprites.map(s => s.position.clone());
    tween(1.1, k => {
      z.cloud.sprites.forEach((s, i) => {
        const sw = (1 - k);
        const ang = k * 7 + i;
        s.position.lerpVectors(starts[i], new THREE.Vector3(Math.cos(ang) * 3 * sw, 6, Math.sin(ang) * 3 * sw), easeInCubic(k));
        s.material.opacity = 0.8 * (1 - k * 0.4);
      });
    }, () => {
      // 第二阶段:迸发 + 实体生长
      G.scene.remove(z.cloud.group);
      FX.glyphBurst(center, g + '一丨丶丿', '#ffffff', 30, 14, 0.9);
      FX.inkSplash(center, '#2a3248', 6, 8);
      SFX.play('boom');
      FX.shake(1.2);
      const built = z.def.build(z.def.center);
      built.scale.set(0.01, 0.01, 0.01);
      G.scene.add(built);
      z.built = built;
      tween(1.6, k => built.scale.setScalar(Math.max(0.01, k)), () => built.scale.setScalar(1), easeOutElastic);
      afterTransform(g);
    });
  }

  // 蜕变后的世界氛围演进 + 玩家进化
  function afterTransform(g) {
    const n = G.world.count;
    if (groundInk) tween(2, k => { groundInk.material.opacity = Math.min(0.85, (n - 1) * 0.22 + k * 0.22); });
    const fogs = [0.016, 0.012, 0.009, 0.007, 0.0055];
    G.scene.fog.density = fogs[n] || 0.006;
    const ambients = [0x202028, 0x232b3a, 0x28323a, 0x2e3030, 0x3a3226];
    G.ambient.color.setHex(ambients[n] || 0x3a3226);
    if (g === '城') {
      G.ambient.color.setHex(0x3a3226);
      FX.tint('radial-gradient(ellipse at center, rgba(255,170,80,0) 60%, rgba(120,70,20,.12) 100%)');
    }
    // 天穹同步演进:配色阶段 + 升起该字星座 + 星河冲击波
    Sky.setStage(n);
    Sky.addConstellation(g);
    Sky.ripple(ZONE_DEFS[g].center.clone().setY(8), 2.4);
    Player.evolve(n);
    Combat.onWorldGrow(n);
    UI.onWorldTransformed(g, n);
  }

  /* ---------- 裂谷与桥 ---------- */
  function buildRift() {
    // 谷底黑渊 + 边缘警示字
    const pit = new THREE.Mesh(
      new THREE.PlaneGeometry(RIFT.maxX - RIFT.minX, RIFT.maxZ - RIFT.minZ),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    pit.rotation.x = -Math.PI / 2;
    pit.position.set((RIFT.minX + RIFT.maxX) / 2, -7.5, (RIFT.minZ + RIFT.maxZ) / 2);
    G.scene.add(pit);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(RIFT.maxX - RIFT.minX, 8, RIFT.maxZ - RIFT.minZ)),
      new THREE.LineBasicMaterial({ color: 0x5a6a8a, transparent: true, opacity: 0.5 })
    );
    edge.position.set((RIFT.minX + RIFT.maxX) / 2, -4, (RIFT.minZ + RIFT.maxZ) / 2);
    G.scene.add(edge);
    for (let i = 0; i < 12; i++) {
      const s = GlyphLib.sprite('坠', 0.9, '#7a86a0', 0.4);
      s.position.set(Util.rand(RIFT.minX, RIFT.maxX), Util.rand(-6, -0.5), Util.rand(RIFT.minZ, RIFT.maxZ));
      G.scene.add(s);
      drift.push({ s, base: s.position.y, ph: Math.random() * 6.28, sp: 0.5, op: 0.4 });
    }
    // 「桥?」幽影标记:可写之处
    riftMarker = GlyphLib.sprite('桥', 3, '#8a93b0', 0.3);
    riftMarker.position.set(58, 2.5, 52);
    G.scene.add(riftMarker);
    Systems.registerTogglable({
      mesh: riftMarker, type: 'riftMark', name: '虚空裂谷 · 需「桥」字书写 (F)',
      pos: riftMarker.position.clone(), radius: 4,
      onUse: () => buildBridge(),
    });
  }

  function buildBridge() {
    if (G.world.bridgeBuilt) return false;
    if (!G.inv['桥']) { UI.message('背包中没有「桥」字…… 也许「木」与「石」可合为一桥。'); return false; }
    Systems.useGlyph('桥', 1);
    G.world.bridgeBuilt = true;
    SFX.play('transform'); FX.shake(0.7); FX.flash(0.4, 500);
    G.scene.remove(riftMarker);
    const grp = new THREE.Group();
    // 木板逐块拼出(活字排版式动画)
    const planks = [];
    for (let i = 0; i < 10; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.4, 6.5), inkMat(0x4a3a26));
      addEdges(plank, 0xc9a25a, 0.45);
      plank.position.set(RIFT.minX + 2 + i * 4.4, 12 + i * 2, 52);
      plank.userData.targetY = 0.2;
      grp.add(plank); planks.push(plank);
    }
    // 栏杆「桥」字
    for (let i = 0; i < 6; i++) {
      const s = GlyphLib.sprite('桥', 1.1, '#e8d8b0', 0.85);
      s.position.set(RIFT.minX + 4 + i * 7.4, 2, 48.6);
      grp.add(s);
    }
    G.scene.add(grp);
    planks.forEach((p, i) => {
      const sy = p.position.y;
      tween(0.5 + i * 0.12, k => {
        if (k > i * 0.1) {
          const kk = Math.min(1, (k - i * 0.1) / 0.6);
          p.position.y = sy + (p.userData.targetY - sy) * easeInCubic(kk);
        }
      }, () => {
        p.position.y = p.userData.targetY;
        FX.sparks(p.position.clone().add(new THREE.Vector3(0, 0.5, 0)), '#ffd87a', 4);
      });
    });
    platforms.push({ minX: RIFT.minX, maxX: RIFT.maxX, minZ: 48.8, maxZ: 55.2, y: 0.4 });
    UI.message('「桥」字落定 —— 文字成真,天堑变通途!');
    SFX.play('glyph');
    Quests.onBridge();
    return true;
  }

  /* ---------- 挡路巨石 ---------- */
  function buildBoulders() {
    const defs = [
      new THREE.Vector3(-76, 0, -104), new THREE.Vector3(-72, 0, -98), new THREE.Vector3(-80, 0, -99),
    ];
    for (const p of defs) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), inkMat(0x2e3340));
      addEdges(rock, 0x8a93a8, 0.4);
      rock.position.copy(p).setY(1.8);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      G.scene.add(rock);
      const col = { x: p.x, z: p.z, r: 2.6, top: 4 };
      colliders.push(col);
      Systems.registerTogglable({
        mesh: rock, type: 'boulder', name: '巨石 · F 拆解为「石」',
        pos: rock.position.clone(), radius: 3.2,
        onAbstract: () => {
          Systems.gainGlyph('石', 1);
          const ci = colliders.indexOf(col);
          if (ci >= 0) colliders.splice(ci, 1);
        },
      });
    }
  }

  /* ---------- 三枚古印 ---------- */
  function buildSeals() {
    const spots = [
      new THREE.Vector3(-90, 26.5, -124),  // 主峰之巅
      new THREE.Vector3(142, 1.5, -60),    // 大河彼岸
      new THREE.Vector3(139, 11.5, 130),   // 城中钟楼平台
    ];
    for (const p of spots) {
      Systems.addPickup({ char: '印', pos: p, size: 1.4, color: '#ffd87a', kind: 'seal' });
    }
  }

  /* ---------- 金矿石(F 提炼「金」) ---------- */
  function buildOres() {
    const defs = [
      new THREE.Vector3(-98, 0, -96), new THREE.Vector3(-86, 0, -132), new THREE.Vector3(-70, 0, -118),
    ];
    for (const p of defs) {
      const ore = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.5, 0),
        new THREE.MeshLambertMaterial({ color: 0x6a5230, emissive: 0x2a1c04, flatShading: true })
      );
      addEdges(ore, 0xe8c878, 0.55);
      ore.position.copy(p).setY(1.1);
      ore.rotation.set(Math.random(), Math.random(), Math.random());
      G.scene.add(ore);
      const col = { x: p.x, z: p.z, r: 1.8, top: 2.5 };
      colliders.push(col);
      Systems.registerTogglable({
        mesh: ore, type: 'ore', name: '金矿石 · F 提炼为「金」',
        pos: ore.position.clone(), radius: 2.4,
        onAbstract: () => {
          Systems.gainGlyph('金', 1);
          FX.sparks(ore.position, '#ffd84d', 12);
          const ci = colliders.indexOf(col);
          if (ci >= 0) colliders.splice(ci, 1);
        },
      });
    }
  }

  /* ---------- 四座古碑(F 拓读,授字赠墨) ---------- */
  function buildSteles() {
    const defs = [
      { pos: new THREE.Vector3(-62, 0, -88), reward: '刃', lore: '碑文:「凿石得刃,字锋如山。」 —— 拓得活字「刃」' },
      { pos: new THREE.Vector3(74, 0, -44),  reward: '雨', lore: '碑文:「云行雨施,水字生雨。」 —— 拓得活字「雨」' },
      { pos: new THREE.Vector3(-24, 0, 58),  reward: '心', lore: '碑文:「草木有心,愈于无声。」 —— 拓得活字「心」' },
      { pos: new THREE.Vector3(90, 0, 90),   reward: '雷', lore: '碑文:「机枢引雷,城字藏霆。」 —— 拓得活字「雷」' },
    ];
    for (const d of defs) {
      const grp = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.4, 0.5), inkMat(0x262b36));
      slab.position.y = 1.7;
      addEdges(slab, 0x8a93a8, 0.5);
      grp.add(slab);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.4, 0.8), inkMat(0x1c2028));
      cap.position.y = 3.5;
      grp.add(cap);
      const mark = GlyphLib.sprite('碑', 1, '#aab8d0', 0.85);
      mark.position.y = 2;
      mark.position.z = 0.5;
      grp.add(mark);
      grp.position.copy(d.pos);
      G.scene.add(grp);
      colliders.push({ x: d.pos.x, z: d.pos.z, r: 1.2, top: 3.6 });
      const t = {
        mesh: grp, type: 'stele', name: '古碑 · F 拓读',
        pos: d.pos.clone().setY(1.8), radius: 2.4,
        onUse: () => {
          UI.message(d.lore, 5200);
          Systems.gainGlyph(d.reward, 1);
          G.player.ink = Math.min(G.player.maxInk, G.player.ink + 10);
          FX.glyphBurst(d.pos.clone().setY(2.4), d.reward + '碑文', '#cfe0ff', 14, 7, 0.6);
          SFX.play('glyph');
          mark.material.color.setHex(0x6a7080);
          Quests.onStele();
          Systems.removeTogglable(t);
        },
      };
      Systems.registerTogglable(t);
    }
  }

  /* ---------- 文匣宝箱(需「钥」开启) ---------- */
  const CHEST_LOOT = ['雷', '落', '雨', '影', '愈', '门', '引', '灯'];
  function buildChests() {
    const spots = [
      new THREE.Vector3(-104, 0, -134),  // 山后
      new THREE.Vector3(-40, 0, 96),     // 林南
      new THREE.Vector3(134, 0, 108),    // 城缘
      new THREE.Vector3(96, 0, -78),     // 河北岸
    ];
    for (const p of spots) {
      const grp = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1.1), inkMat(0x3a2c18, 0x140c04));
      box.position.y = 0.5;
      addEdges(box, 0xc9a25a, 0.6);
      grp.add(box);
      const mark = GlyphLib.sprite('匣', 1, '#e8c878', 0.9);
      mark.position.y = 1.7;
      grp.add(mark);
      grp.position.copy(p);
      G.scene.add(grp);
      const t = {
        mesh: grp, type: 'chest', name: '文匣 · 需「钥」开启 (F)',
        pos: p.clone().setY(1), radius: 2.2,
        onUse: () => {
          if (!G.inv['钥']) {
            UI.message('匣上铭着一个「锁」字 —— 需要「钥」(金+木 合成,金矿在山区)。');
            SFX.play('hit');
            return;
          }
          Systems.useGlyph('钥', 1);
          SFX.play('glyph');
          FX.glyphBurst(p.clone().setY(1.5), '匣启宝', '#ffd84d', 22, 10, 0.8);
          FX.inkSplash(p.clone().setY(1), '#2a2010', 3, 4);
          Sky.ripple(p.clone().setY(2), 1.0);
          // 开匣:两枚稀有活字 + 墨滴
          for (let i = 0; i < 2; i++) {
            const ch = CHEST_LOOT[Math.floor(Math.random() * CHEST_LOOT.length)];
            Systems.addPickup({ char: ch, pos: p.clone().add(new THREE.Vector3(Util.rand(-1.5, 1.5), 1.2, Util.rand(-1.5, 1.5))), size: 1.1, color: '#ffe9b0', kind: 'glyph' });
          }
          Systems.addPickup({ char: '墨', pos: p.clone().add(new THREE.Vector3(0, 1.2, 1)), size: 0.9, color: '#9fb8e8', kind: 'ink' });
          UI.message('「钥」开文匣 —— 沉睡的活字重见天光!');
          Quests.onChest();
          G.scene.remove(grp);
          Systems.removeTogglable(t);
        },
      };
      Systems.registerTogglable(t);
    }
  }

  /* ---------- 周期更新 ---------- */
  function update(dt) {
    // 补间
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.onUpdate(tw.ease(k));
      if (k >= 1) { tweens.splice(i, 1); tw.onDone && tw.onDone(); }
    }
    // 漂浮字闪烁/起伏
    for (const d of drift) {
      d.s.position.y = d.base + Math.sin(G.t * d.sp + d.ph) * 0.6;
      d.s.material.opacity = d.op * (0.7 + 0.3 * Math.sin(G.t * 1.7 + d.ph * 2));
      if (d.flowX) {
        d.s.position.x += d.flowX * dt;
        if (d.s.position.x > 44) d.s.position.x = -44;
      }
    }
    // 河流流动
    if (riverTex) riverTex.offset.x -= dt * 0.22;
    // 齿轮转动
    if (gear) gear.rotation.z += dt * 0.4;
    // 烟囱蒸汽
    for (const sm of smokes) {
      sm.t -= dt;
      if (sm.t <= 0) {
        sm.t = 0.5 + Math.random() * 0.5;
        const mat = new THREE.SpriteMaterial({ map: GlyphLib.ink(), color: 0x9a8a78, transparent: true, opacity: 0.3, depthWrite: false });
        const s = new THREE.Sprite(mat);
        s.position.set(sm.x, sm.y, sm.z); s.scale.setScalar(1.4);
        FX.spawn({ sprite: s, vel: new THREE.Vector3(Util.rand(-0.3, 0.3), 1.6, Util.rand(-0.3, 0.3)), life: 2.4, grow: 1.2 });
      }
    }
    // 树间萤字
    for (const f of fireflies) {
      f.s.position.y += Math.sin(G.t * 1.3 + f.ph) * dt * 0.5;
      f.s.material.opacity = 0.3 + 0.3 * Math.sin(G.t * 2 + f.ph);
    }
    // 裂谷幽影呼吸
    if (riftMarker && !G.world.bridgeBuilt) {
      riftMarker.material.opacity = 0.22 + 0.16 * Math.sin(G.t * 1.8);
    }
    // 河中字鱼:水域成真后不时跃出「鱼」字,捕之得墨
    if (G.world.collected['水']) {
      fishT -= dt;
      if (fishT <= 0) {
        fishT = 9;
        const fishCount = G.pickups.filter(p => p.char === '鱼').length;
        if (fishCount < 3) {
          Systems.addPickup({
            char: '鱼', pos: new THREE.Vector3(100 + Util.rand(-38, 38), 1.2, -60 + Util.rand(-6, 6)),
            size: 0.9, color: '#9fd8ff', kind: 'ink',
          });
        }
      }
    }
  }

  function init() {
    buildVoid();
    buildZones();
    buildRift();
    buildBoulders();
    buildSeals();
    buildOres();
    buildSteles();
    buildChests();
  }

  return { init, update, transform, groundHeight, resolveColliders, inRift, buildBridge, ZONE_DEFS };
})();
