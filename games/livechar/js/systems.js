/* ============================================================
 * 活字灵境 · systems.js
 * 拾取物、活字背包、具象/抽象切换(F)、文字组合、能力释放
 * ============================================================ */
'use strict';

const Systems = (() => {
  /* ---------- 配方表 ---------- */
  const RECIPES = {
    '火+箭': { result: '火箭', name: '追踪火焰箭', charges: 5, desc: '火+箭 = 追踪火焰箭 ×5(按数字键释放)' },
    '冰+墙': { result: '冰墙', name: '寒冰屏障',   charges: 3, desc: '冰+墙 = 寒冰屏障 ×3(阻挡敌人)' },
    '时+缓': { result: '时缓', name: '时间减速',   charges: 2, desc: '时+缓 = 时间减速 ×2(全场缓滞 6 秒)' },
    '隐+身': { result: '隐身', name: '隐形潜行',   charges: 2, desc: '隐+身 = 隐形潜行 ×2(5 秒无敌视)' },
    '风+刃': { result: '风刃', name: '风刃刃舞',   charges: 4, desc: '风+刃 = 风刃刃舞 ×4(扇形五连·穿透)' },
    '雷+落': { result: '天雷', name: '天雷落字',   charges: 3, desc: '雷+落 = 天雷落字 ×3(轰击准星落点)' },
    '火+雨': { result: '火雨', name: '焚天火雨',   charges: 2, desc: '火+雨 = 焚天火雨 ×2(火字成雨倾泻落点)' },
    '影+身': { result: '分身', name: '墨影分身',   charges: 2, desc: '影+身 = 墨影分身 ×2(嘲讽敌人,终乃自爆)' },
    '愈+心': { result: '回春', name: '妙笔回春',   charges: 3, desc: '愈+心 = 妙笔回春 ×3(回复墨魂与墨量)' },
    '木+石': { result: '桥',   name: '「桥」字',   charges: 1, desc: '木+石 = 「桥」字(在裂谷处按 F 书写)', isGlyph: true },
    '金+木': { result: '钥',   name: '「钥」字',   charges: 1, desc: '金+木 = 「钥」字(开启文匣宝箱)', isGlyph: true },
  };
  const made = new Set();   // 已合成过的配方 key

  /* ---------- 拾取物 ---------- */
  function addPickup(opts) {
    const s = GlyphLib.sprite(opts.char, opts.size || 1, opts.color || '#ffffff');
    s.position.copy(opts.pos);
    G.scene.add(s);
    // 光柱提示(世界活字、古印与残句)
    let beam = null;
    if (opts.kind === 'world' || opts.kind === 'seal' || opts.kind === 'poem') {
      const beamColor = opts.kind === 'seal' ? 0xffd87a : (opts.kind === 'poem' ? 0xc89aff : 0xbfd0ff);
      beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.5, 30, 6, 1, true),
        new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
      );
      beam.position.copy(opts.pos).setY(15);
      G.scene.add(beam);
    }
    const transient = (opts.kind === 'ink' || opts.kind === 'glyph') && !opts.persist;
    G.pickups.push({ ...opts, sprite: s, beam, ph: Math.random() * 6.28, life: transient ? 40 : Infinity });
  }

  function gainGlyph(ch, n = 1) {
    G.inv[ch] = (G.inv[ch] || 0) + n;
    UI.message('获得活字 「' + ch + '」 ×' + n);
    SFX.play('pickup');
    Quests.onGlyphGain(n);
  }
  function useGlyph(ch, n = 1) {
    if ((G.inv[ch] || 0) < n) return false;
    G.inv[ch] -= n;
    if (G.inv[ch] <= 0) delete G.inv[ch];
    return true;
  }

  function collect(p) {
    const P = G.player;
    switch (p.kind) {
      case 'world':
        SFX.play('glyph');
        FX.glyphBurst(p.sprite.position, p.char, '#ffffff', 18, 10, 0.8);
        World.transform(p.char);
        break;
      case 'seal':
        G.world.seals++;
        P.maxInk += 20; P.ink = P.maxInk;
        P.maxHp += 15; P.hp = P.maxHp;
        UI.setSeals(G.world.seals);
        UI.message('得古印一枚!墨量与墨魂上限提升。(' + G.world.seals + ' / 3)');
        SFX.play('glyph');
        FX.glyphBurst(p.sprite.position, '印玺章', '#ffd87a', 16, 9, 0.7);
        Sky.ripple(p.sprite.position.clone(), 1.4);
        break;
      case 'ink':
        P.ink = Math.min(P.maxInk, P.ink + 14);
        SFX.play('pickup');
        if (p.char === '鱼') Quests.onFish();
        break;
      case 'poem':
        Quests.onPoem(p.idx, p.sprite.position.clone());
        break;
      default:
        gainGlyph(p.char, 1);
        FX.glyphBurst(p.sprite.position, p.char, '#cfe0ff', 6, 6, 0.4);
    }
    G.scene.remove(p.sprite);
    if (p.beam) G.scene.remove(p.beam);
  }

  /* ---------- 具象/抽象切换 ---------- */
  const raycaster = new THREE.Raycaster();
  function registerTogglable(t) { G.togglables.push(t); }
  function removeTogglable(t) {
    const i = G.togglables.indexOf(t);
    if (i >= 0) G.togglables.splice(i, 1);
  }

  // 准星指向的可切换目标
  function aimTarget() {
    const P = G.player;
    const dir = Util.camForward();
    const origin = G.camera.position.clone();
    let best = null, bestD = 20;
    for (const t of G.togglables) {
      if (t.used) continue;
      // 球形近似:点到射线距离
      const toT = t.pos.clone().sub(origin);
      const proj = toT.dot(dir);
      if (proj < 0 || proj > 26) continue;
      const perp = toT.sub(dir.clone().multiplyScalar(proj)).length();
      if (perp < t.radius && proj < bestD && t.pos.distanceTo(P.pos) < 22) {
        bestD = proj; best = t;
      }
    }
    return best;
  }

  function toggleAim() {
    const t = aimTarget();
    if (!t) { UI.message('视野中没有可切换形态的目标(靠近巨石 / 古木 / 金矿 / 古碑 / 文匣 / 裂谷标记)'); return; }
    // 特殊交互目标(书写 / 拓读 / 开匣)
    if (t.onUse) { t.onUse(t); return; }
    // 具象 → 抽象:实体拆解为活字
    t.used = true;
    SFX.play('toggle');
    FX.shake(0.4);
    const at = t.pos.clone();
    // 拆字动画:实体缩小内陷 + 文字迸散
    const mesh = t.mesh;
    const s0 = mesh.scale.clone();
    let k = 0;
    const shrink = setInterval(() => {
      k += 0.1;
      mesh.scale.copy(s0).multiplyScalar(Math.max(0.01, 1 - k));
      mesh.rotation.y += 0.3;
      if (k >= 1) {
        clearInterval(shrink);
        G.scene.remove(mesh);
        if (mesh.parent) mesh.parent.remove(mesh);
      }
    }, 30);
    FX.glyphBurst(at, '一丨丶丿乙亅', '#cfe0ff', 14, 8, 0.5);
    FX.inkSplash(at, '#1a1f2e', 2.5, 4);
    t.onAbstract && t.onAbstract();
    const idx = G.togglables.indexOf(t);
    if (idx >= 0) G.togglables.splice(idx, 1);
  }

  /* ---------- 合成 ---------- */
  function tryCraft(a, b) {
    const key1 = a + '+' + b, key2 = b + '+' + a;
    const r = RECIPES[key1] || RECIPES[key2];
    if (!r) return null;
    if (!useGlyph(a, 1)) return null;
    if (!useGlyph(b, 1)) { gainGlyph(a, 1); return null; }
    made.add(RECIPES[key1] ? key1 : key2);
    SFX.play('craft');
    if (r.isGlyph) {
      G.inv[r.result] = (G.inv[r.result] || 0) + 1;
      UI.message('合文成功 ——「' + r.result + '」字已入背包!去裂谷书写它。');
    } else {
      // 放入第一个空槽或叠加
      let slot = G.abilities.findIndex(x => x && x.id === r.result);
      if (slot < 0) slot = G.abilities.findIndex(x => !x);
      if (slot < 0) slot = 0;
      if (G.abilities[slot] && G.abilities[slot].id === r.result) {
        G.abilities[slot].charges += r.charges;
      } else {
        G.abilities[slot] = { id: r.result, name: r.name, charges: r.charges, cd: 0 };
      }
      UI.message('合文成功 ——「' + r.name + '」已装入技能槽 ' + (slot + 1) + '!');
      UI.refreshAbilities();
    }
    return r;
  }

  /* ---------- 能力释放 ---------- */
  // 准星落点(投影到地面,限制最大距离)
  function aimGround(maxD) {
    const P = G.player;
    const at = Util.aimPoint();
    const to = at.sub(P.pos); to.y = 0;
    const d = to.length();
    if (d > maxD) to.multiplyScalar(maxD / d);
    const p = P.pos.clone().add(to);
    p.y = Math.max(0, World.groundHeight(p.x, p.z));
    return p;
  }

  function useAbility(slot) {
    const ab = G.abilities[slot];
    const P = G.player;
    if (!ab || ab.charges <= 0 || ab.cd > 0 || G.over) return;
    switch (ab.id) {
      case '火箭':
        if (P.ink < 10) { UI.message('墨量不足……'); return; }
        P.ink -= 10;
        Combat.fireArrow();
        break;
      case '冰墙': {
        if (P.ink < 12) { UI.message('墨量不足……'); return; }
        P.ink -= 12;
        const dir = Util.camForward(); dir.y = 0; dir.normalize();
        const at = P.pos.clone().addScaledVector(dir, 5);
        spawnIceWall(at, Math.atan2(dir.x, dir.z));
        break;
      }
      case '时缓':
        if (P.ink < 16) { UI.message('墨量不足……'); return; }
        P.ink -= 16;
        G.timeScale = 0.35; G.slowT = 6;
        FX.tint('radial-gradient(ellipse at center, rgba(80,120,255,.06) 40%, rgba(40,70,180,.22) 100%)');
        UI.message('「时缓」—— 世界的笔速慢了下来……');
        SFX.play('craft');
        break;
      case '隐身':
        if (P.ink < 14) { UI.message('墨量不足……'); return; }
        P.ink -= 14;
        P.invisT = 5;
        UI.message('「隐身」—— 你化作一行无人读出的空白。');
        FX.inkSplash(P.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), '#3a4258', 2.4, 5);
        SFX.play('dash');
        break;
      case '风刃':
        if (P.ink < 8) { UI.message('墨量不足……'); return; }
        P.ink -= 8;
        Combat.windBlades();
        break;
      case '天雷':
        if (P.ink < 14) { UI.message('墨量不足……'); return; }
        P.ink -= 14;
        Combat.thunder(aimGround(45));
        break;
      case '火雨':
        if (P.ink < 16) { UI.message('墨量不足……'); return; }
        P.ink -= 16;
        Combat.fireRain(aimGround(40));
        break;
      case '分身':
        if (P.ink < 10) { UI.message('墨量不足……'); return; }
        P.ink -= 10;
        Combat.spawnDecoy();
        break;
      case '回春':
        P.hp = Math.min(P.maxHp, P.hp + 40);
        P.ink = Math.min(P.maxInk, P.ink + 25);
        FX.glyphBurst(P.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), '愈心春生', '#9aff9a', 16, 7, 0.6);
        UI.message('「回春」—— 残破的笔画被重新写好了。');
        SFX.play('glyph');
        break;
      default: return;
    }
    ab.charges--; ab.cd = 1;
    if (ab.charges <= 0) {
      setTimeout(() => {
        if (G.abilities[slot] && G.abilities[slot].charges <= 0) {
          G.abilities[slot] = null;
          UI.refreshAbilities();
        }
      }, 600);
    }
    UI.refreshAbilities();
  }

  const iceWalls = [];
  function spawnIceWall(at, yaw) {
    at.y = Math.max(0, World.groundHeight(at.x, at.z));
    const grp = new THREE.Group();
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(7, 4, 0.9),
      new THREE.MeshLambertMaterial({ color: 0x9fd8ff, emissive: 0x1a3a55, transparent: true, opacity: 0.78, flatShading: true })
    );
    wall.position.y = 2;
    grp.add(wall);
    for (let i = 0; i < 4; i++) {
      const s = GlyphLib.sprite('冰', 1, '#d8f4ff', 0.9);
      s.position.set(-2.4 + i * 1.6, 2 + Math.sin(i) * 0.6, 0.6);
      grp.add(s);
    }
    grp.position.copy(at);
    grp.rotation.y = yaw;
    grp.scale.y = 0.05;
    G.scene.add(grp);
    SFX.play('toggle');
    FX.glyphBurst(at.clone().add(new THREE.Vector3(0, 2, 0)), '冰凌霜雪', '#bfe8ff', 12, 7, 0.6);
    const col = { x: at.x, z: at.z, r: 3.6, top: 4 };
    // 生长动画 + 12 秒后碎裂
    let k = 0;
    const grow = setInterval(() => {
      k += 0.12;
      grp.scale.y = Math.min(1, k);
      if (k >= 1) clearInterval(grow);
    }, 30);
    iceWalls.push({ grp, col, t: 12 });
    G._iceColliders = G._iceColliders || [];
    G._iceColliders.push(col);
  }

  // 写「轻」(Q):脚下生成低重力领域
  function writeLight() {
    const P = G.player;
    if (!G.inv['轻']) { UI.message('需要活字「轻」(击败墨魉可能掉落)'); return; }
    if (P.ink < 10) { UI.message('墨量不足……'); return; }
    useGlyph('轻', 1); P.ink -= 10;
    const zone = { pos: P.pos.clone().setY(1), r: 9, t: 9, ring: [] };
    for (let i = 0; i < 10; i++) {
      const s = GlyphLib.sprite('轻', 0.8, '#d0e8ff', 0.7);
      const a = (i / 10) * 6.28;
      s.position.copy(zone.pos).add(new THREE.Vector3(Math.cos(a) * 9, 0.6, Math.sin(a) * 9));
      G.scene.add(s);
      zone.ring.push(s);
    }
    G.lightZones.push(zone);
    UI.message('「轻」—— 此地重力减半,纵身可越高崖。');
    SFX.play('craft');
    FX.glyphBurst(P.pos.clone().add(new THREE.Vector3(0, 1, 0)), '轻羽浮', '#d0e8ff', 14, 6, 0.6);
  }

  // 点「慢」(X):准星敌人减速
  function writeSlow() {
    if (!G.inv['慢']) { UI.message('需要活字「慢」(击败墨魉可能掉落)'); return; }
    const P = G.player;
    // 找准星方向最近敌人
    const dir = Util.camForward();
    let best = null, bd = 30;
    const candidates = [...G.enemies];
    if (G.boss && !G.boss.dead) candidates.push(G.boss);
    for (const e of candidates) {
      if (e.dead) continue;
      const toE = e.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(G.camera.position);
      const proj = toE.dot(dir);
      if (proj < 0) continue;
      const perp = toE.clone().sub(dir.clone().multiplyScalar(proj)).length();
      if (perp < 2.5 + (e.radius || 1) && proj < bd) { bd = proj; best = e; }
    }
    if (!best) { UI.message('准星未指向任何敌人'); return; }
    useGlyph('慢', 1);
    best.slowT = 8;
    UI.message('「慢」字烙印 —— 敌人被文字法则束缚!');
    SFX.play('craft');
    FX.glyphBurst(best.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), '慢缓滞', '#8af0ff', 10, 6, 0.6);
  }

  // 写「灯」(R):召唤随行墨灯,照亮四周
  let lantern = null;
  function writeLantern() {
    if (!G.inv['灯']) { UI.message('需要活字「灯」(古碑、文匣或墨魉可得)'); return; }
    const P = G.player;
    if (P.ink < 6) { UI.message('墨量不足……'); return; }
    useGlyph('灯', 1); P.ink -= 6;
    if (lantern) { G.scene.remove(lantern.grp); }
    const grp = new THREE.Group();
    const s = GlyphLib.sprite('灯', 1.1, '#ffd8a0', 0.95);
    grp.add(s);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GlyphLib.ink(), color: 0xffb868, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(4);
    grp.add(halo);
    const light = new THREE.PointLight(0xffc880, 1.5, 32, 1.4);
    grp.add(light);
    grp.position.copy(P.pos).add(new THREE.Vector3(1.2, 3.4, 0));
    G.scene.add(grp);
    lantern = { grp, light, halo, t: 30 };
    UI.message('「灯」—— 一盏字灯随行,墨夜不再难行。');
    SFX.play('craft');
  }

  // 写「引」(T):在落点书写诱敌符印
  function writeLure() {
    if (!G.inv['引']) { UI.message('需要活字「引」(古碑、文匣或墨魉可得)'); return; }
    const P = G.player;
    if (P.ink < 8) { UI.message('墨量不足……'); return; }
    useGlyph('引', 1); P.ink -= 8;
    Combat.placeLure(aimGround(30));
    UI.message('「引」—— 残魉读到了无法抗拒的字。');
    SFX.play('craft');
  }

  // 写「门」(G):书写传送门,两两相连
  const gates = [];
  let gateCd = 0;
  function writeGate() {
    if (!G.inv['门']) { UI.message('需要活字「门」(文匣或稀有掉落)'); return; }
    const P = G.player;
    if (P.ink < 10) { UI.message('墨量不足……'); return; }
    useGlyph('门', 1); P.ink -= 10;
    const pos = P.pos.clone();
    pos.y = Math.max(0, World.groundHeight(pos.x, pos.z));
    const grp = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const s = GlyphLib.sprite('门', 1, '#b0e8ff', 0.9);
      const a = (i / 6) * 6.28;
      s.position.set(Math.cos(a) * 1.6, 1.6 + Math.sin(a) * 1.6, 0);
      grp.add(s);
    }
    const f = GlyphLib.flat('门', 3, '#b0e8ff', 0.5);
    f.position.y = 0.08;
    grp.add(f);
    grp.position.copy(pos);
    G.scene.add(grp);
    gates.push({ grp, pos, t: 60 });
    if (gates.length > 2) { G.scene.remove(gates[0].grp); gates.shift(); }
    FX.glyphBurst(pos.clone().setY(1.5), '门', '#b0e8ff', 10, 6, 0.6);
    SFX.play('craft');
    UI.message(gates.length === 1
      ? '「门」之一落定 —— 在别处再写一扇,两门即连。'
      : '双门相连 —— 踏入任意一扇即达彼端!(60 秒)');
  }

  /* ---------- 周期更新 ---------- */
  function update(dt) {
    const P = G.player;
    // 拾取物旋转 / 吸附
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const p = G.pickups[i];
      p.life -= dt;
      if (p.life <= 0) {
        G.scene.remove(p.sprite);
        if (p.beam) G.scene.remove(p.beam);
        G.pickups.splice(i, 1);
        continue;
      }
      p.sprite.material.rotation = Math.sin(G.t * 1.6 + p.ph) * 0.18;
      p.sprite.position.y = p.pos.y + Math.sin(G.t * 2 + p.ph) * 0.3;
      const d = p.sprite.position.distanceTo(P.pos.clone().add(new THREE.Vector3(0, 1.2, 0)));
      // 墨滴/小字会被吸过来
      if ((p.kind === 'ink' || p.kind === 'glyph') && d < 6) {
        p.sprite.position.lerp(P.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), dt * 5);
      }
      if (d < 2.4) {
        collect(p);
        G.pickups.splice(i, 1);
      }
    }
    // 时缓
    if (G.slowT > 0) {
      G.slowT -= dt;
      if (G.slowT <= 0) {
        G.timeScale = 1;
        FX.tint('none');
        UI.message('时间之墨重新流动。');
      }
    }
    // 冰墙寿命
    for (let i = iceWalls.length - 1; i >= 0; i--) {
      const w = iceWalls[i];
      w.t -= dt;
      if (w.t <= 0) {
        FX.glyphBurst(w.grp.position.clone().add(new THREE.Vector3(0, 2, 0)), '冰碎裂', '#bfe8ff', 14, 8, 0.5);
        SFX.play('hit');
        G.scene.remove(w.grp);
        const ci = G._iceColliders.indexOf(w.col);
        if (ci >= 0) G._iceColliders.splice(ci, 1);
        iceWalls.splice(i, 1);
      }
    }
    // 冰墙阻挡敌人
    if (G._iceColliders) {
      for (const e of G.enemies) {
        for (const c of G._iceColliders) {
          const dx = e.pos.x - c.x, dz = e.pos.z - c.z;
          const d = Math.hypot(dx, dz);
          if (d < c.r && d > 0.001) {
            e.pos.x = c.x + dx / d * c.r;
            e.pos.z = c.z + dz / d * c.r;
          }
        }
      }
    }
    // 轻字领域
    for (let i = G.lightZones.length - 1; i >= 0; i--) {
      const z = G.lightZones[i];
      z.t -= dt;
      z.ring.forEach((s, idx) => {
        const a = G.t + (idx / z.ring.length) * 6.28;
        s.position.set(z.pos.x + Math.cos(a) * z.r, 0.8 + Math.sin(G.t * 2 + idx) * 0.4, z.pos.z + Math.sin(a) * z.r);
        s.material.opacity = Math.min(0.7, z.t);
      });
      if (z.t <= 0) {
        z.ring.forEach(s => G.scene.remove(s));
        G.lightZones.splice(i, 1);
      }
    }
    // 随行墨灯
    if (lantern) {
      lantern.t -= dt;
      const want = P.pos.clone().add(new THREE.Vector3(Math.sin(G.t * 0.7) * 1.4, 3.3 + Math.sin(G.t * 1.8) * 0.25, Math.cos(G.t * 0.7) * 1.4));
      lantern.grp.position.lerp(want, dt * 4);
      lantern.light.intensity = 1.3 + Math.sin(G.t * 7) * 0.18;
      if (lantern.t < 4) lantern.light.intensity *= lantern.t / 4;
      if (lantern.t <= 0) {
        FX.glyphBurst(lantern.grp.position, '灯灭', '#ffd8a0', 6, 4, 0.4);
        G.scene.remove(lantern.grp);
        lantern = null;
      }
    }
    // 传送门
    gateCd = Math.max(0, gateCd - dt);
    for (let i = gates.length - 1; i >= 0; i--) {
      const g = gates[i];
      g.t -= dt;
      g.grp.rotation.y += dt * 1.6;
      if (g.t <= 0) {
        FX.glyphBurst(g.pos.clone().setY(1.5), '门闭', '#b0e8ff', 8, 5, 0.5);
        G.scene.remove(g.grp);
        gates.splice(i, 1);
      }
    }
    if (gates.length === 2 && gateCd <= 0 && !G.over) {
      for (let i = 0; i < 2; i++) {
        if (Util.dist2d(P.pos, gates[i].pos) < 1.8 && Math.abs(P.pos.y - gates[i].pos.y) < 2.5) {
          const other = gates[1 - i];
          FX.glyphBurst(P.pos.clone().setY(1.5), '门启', '#b0e8ff', 12, 8, 0.6);
          P.pos.set(other.pos.x, other.pos.y + 0.2, other.pos.z);
          P.vel.set(0, 0, 0);
          gateCd = 1.5;
          FX.glyphBurst(P.pos.clone().setY(1.5), '至', '#b0e8ff', 12, 8, 0.6);
          SFX.play('dash');
          Sky.ripple(P.pos.clone().setY(3), 0.8);
          break;
        }
      }
    }
    // 准星提示
    const t = aimTarget();
    UI.targetTip(t ? t.name : null);
  }

  /* ---------- 散落的初始活字 ---------- */
  function scatterGlyphs() {
    const spots = [
      { char: '火', pos: new THREE.Vector3(-20, 1.2, -30) },
      { char: '箭', pos: new THREE.Vector3(24, 1.2, -22) },
      { char: '冰', pos: new THREE.Vector3(40, 1.2, 10) },
      { char: '墙', pos: new THREE.Vector3(-36, 1.2, 18) },
      { char: '时', pos: new THREE.Vector3(-60, 1.2, -50) },
      { char: '缓', pos: new THREE.Vector3(60, 1.2, -80) },
      { char: '隐', pos: new THREE.Vector3(-10, 1.2, 50) },
      { char: '身', pos: new THREE.Vector3(10, 1.2, 44) },
      { char: '木', pos: new THREE.Vector3(-52, 1.2, 60) },
      { char: '轻', pos: new THREE.Vector3(88, 1.2, 30) },
      { char: '慢', pos: new THREE.Vector3(-84, 1.2, -40) },
      { char: '风', pos: new THREE.Vector3(-44, 1.2, -12) },
      { char: '刃', pos: new THREE.Vector3(30, 1.2, 28) },
      { char: '影', pos: new THREE.Vector3(-30, 1.2, -70) },
      { char: '愈', pos: new THREE.Vector3(110, 1.2, 10) },
      { char: '心', pos: new THREE.Vector3(0, 1.2, -70) },
      { char: '灯', pos: new THREE.Vector3(-6, 1.2, -40) },
      { char: '引', pos: new THREE.Vector3(24, 1.2, 78) },
      { char: '门', pos: new THREE.Vector3(-70, 1.2, 20) },
      { char: '门', pos: new THREE.Vector3(70, 1.2, -20) },
      { char: '雨', pos: new THREE.Vector3(120, 1.2, -20) },
      { char: '落', pos: new THREE.Vector3(-10, 1.2, 110) },
      { char: '墨', pos: new THREE.Vector3(8, 1.2, -16), kind: 'ink' },
      { char: '墨', pos: new THREE.Vector3(-14, 1.2, 8), kind: 'ink' },
    ];
    for (const s of spots) {
      addPickup({ char: s.char, pos: s.pos, size: 1.1, color: s.kind === 'ink' ? '#9fb8e8' : '#cfe0ff', kind: s.kind || 'glyph', persist: true });
    }
  }

  return {
    addPickup, gainGlyph, useGlyph, registerTogglable, removeTogglable, toggleAim, aimTarget,
    tryCraft, useAbility, writeLight, writeSlow, writeLantern, writeLure, writeGate,
    update, scatterGlyphs,
    RECIPES, made,
  };
})();
