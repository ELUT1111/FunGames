/* ============================================================
 * 活字灵境 · combat.js
 * 敌人(浮魉/射煞)、投射物、墨痕斩、反墨盾、最终 Boss「噬」
 * ============================================================ */
'use strict';

const Combat = (() => {
  let spawnTimer = 8, maxAlive = 0;
  const ENEMY_DROPS = ['火', '箭', '冰', '墙', '时', '缓', '隐', '身', '轻', '慢', '木', '风', '刃', '影', '心'];
  const RARE_DROPS = ['雷', '落', '雨', '愈', '灯', '引', '门'];
  let decoy = null, lure = null;
  const meteors = [], pillars = [];

  /* ---------- 敌人 ---------- */
  function spawnEnemy(type, pos, opts = {}) {
    const isRanged = type === 'ranged';
    const elite = !!opts.elite;
    const ch = elite ? '狂' : (isRanged ? '煞' : '魉');
    const group = new THREE.Group();
    const body = GlyphLib.sprite(ch, elite ? 3.2 : (isRanged ? 1.7 : 1.9), elite ? '#ff4a3a' : (isRanged ? '#c08aff' : '#ff7a8a'), 0.95);
    body.position.y = elite ? 1.8 : 1.2;
    group.add(body);
    // 阴影墨晕
    const sh = new THREE.Sprite(new THREE.SpriteMaterial({ map: GlyphLib.ink(), color: 0x1a0a14, transparent: true, opacity: 0.5, depthWrite: false }));
    sh.scale.set(elite ? 3 : 1.8, elite ? 1.5 : 0.9, 1);
    group.add(sh);
    group.position.copy(pos);
    G.scene.add(group);
    const e = {
      group, body, sh, type, elite,
      hp: elite ? 220 : (isRanged ? 36 : 50), maxHp: elite ? 220 : (isRanged ? 36 : 50),
      speed: elite ? 7.5 : (isRanged ? 4.5 : 6.5),
      dmg: elite ? 20 : (isRanged ? 10 : 12),
      pos: group.position,
      atkCd: Util.rand(1, 2.5),
      slowT: 0, slowMark: null,
      radius: elite ? 1.7 : 1.1,
      dead: false,
      ph: Math.random() * 6.28,
    };
    G.enemies.push(e);
    return e;
  }

  function spawnBoss() {
    const group = new THREE.Group();
    const body = GlyphLib.sprite('噬', 9, '#ff4a5a', 1);
    body.position.y = 6;
    group.add(body);
    // 环绕蚀文
    const ring = [];
    for (let i = 0; i < 8; i++) {
      const s = GlyphLib.sprite('吞噬灭蚀绝湮'[i % 6], 1.6, '#b03048', 0.9);
      group.add(s); ring.push(s);
    }
    group.position.set(0, 0, -40);
    G.scene.add(group);
    G.boss = {
      group, body, ring,
      hp: 666, maxHp: 666,
      pos: group.position,
      atkCd: 2, sumCd: 8, slowT: 0,
      radius: 4, dead: false,
    };
    UI.showBossBar(true);
    UI.message('蚀文之主「噬」苏醒了 —— 它要吞掉你写下的世界!');
    SFX.play('boss');
    FX.shake(1.4);
    Sky.bossMode(true);
    Sky.ripple(G.boss.pos.clone().setY(10), 2.8);
    FX.tint('radial-gradient(ellipse at center, rgba(120,10,20,0) 55%, rgba(120,10,20,.22) 100%)');
    FX.glyphBurst(G.boss.pos.clone().add(new THREE.Vector3(0, 6, 0)), '噬蚀灭', '#ff4a5a', 40, 16, 1.2);
  }

  /* ---------- 投射物 ---------- */
  // owner: 'player' | 'enemy'
  function shoot(opts) {
    const s = GlyphLib.sprite(opts.char, opts.size || 0.9, opts.color || '#ffffff');
    s.position.copy(opts.pos);
    G.scene.add(s);
    G.projectiles.push({
      sprite: s, pos: s.position,
      vel: opts.vel, owner: opts.owner,
      dmg: opts.dmg, life: opts.life || 3,
      homing: opts.homing || 0, char: opts.char,
      trailT: 0, trailChar: opts.trailChar || opts.char, color: opts.color || '#ffffff',
    });
  }

  /* ---------- 玩家攻击 ---------- */
  function playerSlash() {
    const P = G.player;
    if (P.atkCd > 0 || P.ink < 3) return;
    P.atkCd = 0.32; P.ink -= 3;
    SFX.play('slash');
    Sky.ripple(P.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0.3);
    // 弹道与准星收敛:从胸口射向准星瞄准点(含辅助吸附)
    const from = P.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    const dir = Util.aimPoint().sub(from).normalize();
    shoot({
      char: '斩', pos: from.addScaledVector(dir, 1.2),
      vel: dir.clone().multiplyScalar(42), owner: 'player', dmg: G.buffs.slashDmg, size: 1.2, color: '#e8f0ff', trailChar: '丿',
    });
  }

  function fireArrow() {
    const P = G.player;
    SFX.play('slash');
    const from = P.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    const dir = Util.aimPoint().sub(from).normalize();
    shoot({
      char: '火', pos: from.addScaledVector(dir, 1.2),
      vel: dir.clone().multiplyScalar(30), owner: 'player', dmg: 45, size: 1.3,
      color: '#ff9a4d', homing: 9, life: 5, trailChar: '炎',
    });
  }

  function shield() {
    const P = G.player;
    if (P.shieldCd > 0 || P.ink < 6) return;
    P.ink -= 6; P.shieldT = G.buffs.shieldDur; P.shieldCd = 1.6;
    SFX.play('shield');
    // 盾视觉:环形「返」字
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28;
      const s = GlyphLib.sprite('返', 0.7, '#ffd87a', 0.9);
      s.position.copy(P.pos).add(new THREE.Vector3(Math.cos(a) * 2, 1.4 + Math.sin(a) * 0.4, Math.sin(a) * 2));
      FX.spawn({ sprite: s, vel: new THREE.Vector3(0, 0.5, 0), life: 0.7, spin: 3 });
    }
  }

  /* ---------- 合文新能力 ---------- */
  // 风刃刃舞:扇形五连穿透刃
  function windBlades() {
    const P = G.player;
    SFX.play('slash');
    const from = P.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    const aim = Util.aimPoint().sub(from).normalize();
    const UP = new THREE.Vector3(0, 1, 0);
    for (let k = -2; k <= 2; k++) {
      const dir = aim.clone().applyAxisAngle(UP, k * 0.13);
      shoot({
        char: '刃', pos: from.clone().addScaledVector(dir, 1.2),
        vel: dir.multiplyScalar(38), owner: 'player', dmg: 18, size: 1.1,
        color: '#bfffd8', life: 1.8, pierce: true, trailChar: '风',
      });
    }
    Sky.ripple(from, 0.5);
  }

  // 天雷落字:轰击落点
  function thunder(at) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 2.4, 34, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    pillar.position.copy(at).setY(at.y + 17);
    G.scene.add(pillar);
    pillars.push({ mesh: pillar, t: 0.5 });
    FX.glyphBurst(at.clone().setY(at.y + 1.5), '雷霆电', '#cfe8ff', 18, 11, 0.8);
    FX.flash(0.3, 250);
    FX.shake(0.7);
    SFX.play('boom');
    Sky.ripple(at, 1.2);
    areaDamage(at, 6.5, 60);
    UI.message('「天雷」—— 一字落,万钧至!');
  }

  // 焚天火雨:火字成雨倾泻
  function fireRain(at) {
    for (let i = 0; i < 9; i++) {
      meteors.push({ t: i * 0.33, pos: at.clone().add(new THREE.Vector3(Util.rand(-7, 7), 0, Util.rand(-7, 7))) });
    }
    SFX.play('craft');
    UI.message('「火雨」—— 焚天之字自空而落!');
  }

  // 墨影分身:嘲讽敌人,到时自爆
  function spawnDecoy() {
    removeDecoy(false);
    const grp = new THREE.Group();
    const s = GlyphLib.sprite('影', 2.2, '#b89aff', 0.85);
    s.position.y = 1.3;
    grp.add(s);
    const sh = new THREE.Sprite(new THREE.SpriteMaterial({ map: GlyphLib.ink(), color: 0x14081e, transparent: true, opacity: 0.5, depthWrite: false }));
    sh.scale.set(2, 1, 1);
    grp.add(sh);
    grp.position.copy(G.player.pos);
    G.scene.add(grp);
    decoy = { grp, pos: grp.position, t: 6, body: s };
    FX.inkSplash(grp.position.clone().setY(1.3), '#2a1640', 2.2, 4);
    UI.message('「分身」—— 墨影替你承受所有目光。');
  }
  function removeDecoy(explode) {
    if (!decoy) return;
    if (explode) {
      FX.glyphBurst(decoy.pos.clone().setY(1.5), '影散爆', '#b89aff', 20, 10, 0.7);
      SFX.play('boom');
      FX.shake(0.5);
      areaDamage(decoy.pos, 6, 45);
      Sky.ripple(decoy.pos.clone().setY(2), 0.9);
    }
    G.scene.remove(decoy.grp);
    decoy = null;
  }

  // 诱敌符印(写「引」)
  function placeLure(at) {
    removeLure();
    const grp = new THREE.Group();
    const f = GlyphLib.flat('引', 3, '#ffd87a', 0.8);
    f.position.y = 0.1;
    grp.add(f);
    const s = GlyphLib.sprite('引', 1.4, '#ffd87a', 0.9);
    s.position.y = 1.6;
    grp.add(s);
    grp.position.copy(at);
    G.scene.add(grp);
    lure = { grp, pos: grp.position, t: 5 };
    FX.glyphBurst(at.clone().setY(1), '引', '#ffd87a', 8, 5, 0.5);
  }
  function removeLure() {
    if (lure) { G.scene.remove(lure.grp); lure = null; }
  }

  // 范围伤害(文字洪流等)
  function areaDamage(pos, r, dmg) {
    for (const e of G.enemies) {
      if (!e.dead && e.pos.distanceTo(pos) < r) hurtEnemy(e, dmg, pos);
    }
    if (G.boss && !G.boss.dead && G.boss.pos.distanceTo(pos) < r + G.boss.radius) hurtBoss(dmg);
  }

  function hurtEnemy(e, dmg, from) {
    e.hp -= dmg;
    SFX.play('hit');
    FX.sparks(e.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), '#ff9aa8', 5);
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    const at = e.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    FX.glyphBurst(at, e.elite ? '狂乱怒嘶' : (e.type === 'ranged' ? '煞咒怨' : '魉影幽'), e.elite ? '#ff6a4a' : '#c08aff', e.elite ? 28 : 16, e.elite ? 12 : 9, e.elite ? 0.8 : 0.6);
    FX.inkSplash(at, '#1a0a20', e.elite ? 3.5 : 2.2, 4);
    SFX.play('boom');
    // 掉落:墨滴 + 概率活字
    Systems.addPickup({ char: '墨', pos: e.pos.clone().setY(1), size: 0.8, color: '#9fb8e8', kind: 'ink' });
    if (Math.random() < 0.75) {
      const ch = ENEMY_DROPS[Math.floor(Math.random() * ENEMY_DROPS.length)];
      Systems.addPickup({ char: ch, pos: e.pos.clone().setY(1).add(new THREE.Vector3(Util.rand(-1, 1), 0, Util.rand(-1, 1))), size: 1, color: '#cfe0ff', kind: 'glyph' });
    }
    // 稀有活字:雷落雨愈灯引门
    if (Math.random() < 0.12) {
      const ch = RARE_DROPS[Math.floor(Math.random() * RARE_DROPS.length)];
      Systems.addPickup({ char: ch, pos: e.pos.clone().setY(1.4), size: 1.1, color: '#ffe9b0', kind: 'glyph' });
    }
    // 精英狂魉:必掉三枚稀有字 + 双倍墨滴
    if (e.elite) {
      for (let k = 0; k < 3; k++) {
        const ch = RARE_DROPS[Math.floor(Math.random() * RARE_DROPS.length)];
        Systems.addPickup({ char: ch, pos: e.pos.clone().setY(1.4).add(new THREE.Vector3(Util.rand(-1.6, 1.6), 0, Util.rand(-1.6, 1.6))), size: 1.2, color: '#ffe9b0', kind: 'glyph' });
      }
      Systems.addPickup({ char: '墨', pos: e.pos.clone().setY(1).add(new THREE.Vector3(1, 0, 1)), size: 0.9, color: '#9fb8e8', kind: 'ink' });
      FX.shake(0.8);
    }
    Quests.onEnemyKilled(e);
    G.scene.remove(e.group);
  }

  function hurtBoss(dmg) {
    const B = G.boss;
    if (!B || B.dead) return;
    B.hp -= dmg;
    SFX.play('hit');
    FX.sparks(B.pos.clone().add(new THREE.Vector3(Util.rand(-2, 2), 6 + Util.rand(-2, 2), 0)), '#ff6a7a', 7);
    UI.setBossHp(B.hp / B.maxHp);
    if (B.hp <= 0) {
      B.dead = true;
      UI.showBossBar(false);
      const at = B.pos.clone().add(new THREE.Vector3(0, 6, 0));
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          FX.glyphBurst(at, '噬蚀灭吞绝湮散墨', '#ff4a5a', 36, 18, 1.1);
          FX.inkSplash(at, '#2a0a10', 8, 8);
          FX.shake(1.5); SFX.play('boom');
        }, i * 350);
      }
      setTimeout(() => {
        G.scene.remove(B.group);
        FX.flash(0.9, 1600);
        SFX.play('win');
        Sky.bossMode(false);
        Sky.ripple(B.pos.clone().setY(10), 3.2);
        Quests.onBossDead();
        UI.showWin();
      }, 1600);
    }
  }

  /* ---------- 世界成长 → 敌潮调度 ---------- */
  function onWorldGrow(count) {
    maxAlive = [0, 3, 5, 7, 8][count] || 8;
    // 每次蜕变即刻在该区域边缘小规模刷怪
    for (let i = 0; i < Math.min(count + 1, 3); i++) {
      const P = G.player;
      const a = Math.random() * 6.28;
      spawnEnemy(Math.random() < 0.4 ? 'ranged' : 'melee',
        P.pos.clone().add(new THREE.Vector3(Math.cos(a) * 24, 0, Math.sin(a) * 24)));
    }
    if (count === 1) UI.message('世界开始苏醒…… 但蚀文残魉也闻墨而来。小心!');
    if (count >= 4 && !G.boss) setTimeout(spawnBoss, 5000);
  }

  /* ---------- 周期更新 ---------- */
  function update(dt) {
    const P = G.player;
    const ts = G.timeScale;
    const sdt = dt * ts;

    // 自然刷怪
    if (maxAlive > 0 && !G.over) {
      spawnTimer -= sdt;
      const alive = G.enemies.filter(e => !e.dead).length;
      if (spawnTimer <= 0 && alive < maxAlive) {
        spawnTimer = Util.rand(6, 11);
        const a = Math.random() * 6.28;
        spawnEnemy(Math.random() < 0.4 ? 'ranged' : 'melee',
          P.pos.clone().add(new THREE.Vector3(Math.cos(a) * 32, 0, Math.sin(a) * 32)));
      }
    }

    // 墨影分身与诱敌符印
    if (decoy) {
      decoy.t -= dt;
      decoy.body.material.opacity = 0.5 + 0.3 * Math.sin(G.t * 6);
      if (decoy.t <= 0) removeDecoy(true);
    }
    if (lure) {
      lure.t -= dt;
      lure.grp.rotation.y += dt * 2;
      if (lure.t <= 0) removeLure();
    }
    // 天雷光柱余辉
    for (let i = pillars.length - 1; i >= 0; i--) {
      const p = pillars[i];
      p.t -= dt;
      p.mesh.material.opacity = Math.max(0, p.t / 0.5) * 0.85;
      p.mesh.scale.x = p.mesh.scale.z = 1 + (1 - p.t / 0.5) * 0.8;
      if (p.t <= 0) { G.scene.remove(p.mesh); pillars.splice(i, 1); }
    }
    // 火雨陨字
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.t -= dt;
      if (m.t <= 0) {
        shoot({
          char: '火', pos: m.pos.clone().setY(m.pos.y + 24),
          vel: new THREE.Vector3(Util.rand(-2, 2), -28, Util.rand(-2, 2)),
          owner: 'player', dmg: 30, size: 1.5, color: '#ff9a4d', life: 2.5, trailChar: '炎', aoe: 4.5,
        });
        meteors.splice(i, 1);
      }
    }

    // 敌人 AI
    const decoyOn = !!(decoy && decoy.t > 0);
    const lureOn = !!(lure && lure.t > 0);
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.dead) { G.enemies.splice(i, 1); continue; }
      e.slowT = Math.max(0, e.slowT - dt);
      const slowK = e.slowT > 0 ? 0.3 : 1;
      const edt = sdt * slowK;
      e.atkCd -= edt;
      // 目标优先级:墨影分身 > 引字符印 > 玩家(隐身时无视)
      let tgt = null;
      if (decoyOn) tgt = decoy.pos;
      else if (lureOn && Util.dist2d(e.pos, lure.pos) < 26) tgt = lure.pos;
      else if (P.invisT <= 0 && !G.over) tgt = P.pos;

      if (tgt) {
        const isPlayer = tgt === P.pos;
        const to = tgt.clone().sub(e.pos); to.y = 0;
        const d = to.length();
        if (e.type === 'melee') {
          if (d > 1.6) e.pos.addScaledVector(to.normalize(), e.speed * edt);
          if (d < 2 && e.atkCd <= 0) {
            e.atkCd = 1.2;
            if (isPlayer) {
              Player.damage(e.dmg);
              FX.sparks(P.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), '#ff5a6a', 6);
            } else {
              // 徒劳地撕咬墨影/符印
              FX.sparks(tgt.clone().add(new THREE.Vector3(0, 1.2, 0)), '#b89aff', 4);
            }
          }
        } else {
          if (d > 14) e.pos.addScaledVector(to.clone().normalize(), e.speed * edt);
          else if (d < 9) e.pos.addScaledVector(to.clone().normalize(), -e.speed * 0.7 * edt);
          if (d < 26 && e.atkCd <= 0) {
            e.atkCd = 2.4;
            const dir = tgt.clone().add(new THREE.Vector3(0, 1.3, 0)).sub(e.pos.clone().setY(e.pos.y + 1.3)).normalize();
            shoot({
              char: '咒', pos: e.pos.clone().add(new THREE.Vector3(0, 1.3, 0)),
              vel: dir.multiplyScalar(14), owner: 'enemy', dmg: e.dmg, color: '#c06aff', size: 0.8, life: 4,
            });
          }
        }
      }
      // 贴地 + 漂浮
      const gh = World.groundHeight(e.pos.x, e.pos.z);
      e.pos.y = Math.max(gh, 0) ;
      e.body.position.y = 1.2 + Math.sin(G.t * 2.4 + e.ph) * 0.2;
      e.body.material.opacity = 0.8 + 0.15 * Math.sin(G.t * 3 + e.ph);
      // 慢字标记
      if (e.slowT > 0 && !e.slowMark) {
        e.slowMark = GlyphLib.sprite('慢', 0.8, '#8af0ff', 0.95);
        e.slowMark.position.y = 2.6;
        e.group.add(e.slowMark);
      } else if (e.slowT <= 0 && e.slowMark) {
        e.group.remove(e.slowMark); e.slowMark = null;
      }
    }

    // Boss AI
    const B = G.boss;
    if (B && !B.dead && !G.over) {
      B.slowT = Math.max(0, B.slowT - dt);
      const slowK = B.slowT > 0 ? 0.4 : 1;
      const bdt = sdt * slowK;
      B.atkCd -= bdt; B.sumCd -= bdt;
      const bossTgt = decoyOn ? decoy.pos : P.pos;
      const toP = bossTgt.clone().sub(B.pos); toP.y = 0;
      if (toP.length() > 10) B.pos.addScaledVector(toP.normalize(), 3.2 * bdt);
      B.body.position.y = 6 + Math.sin(G.t * 1.4) * 0.8;
      B.body.material.rotation = Math.sin(G.t * 0.8) * 0.12;
      B.ring.forEach((s, idx) => {
        const a = G.t * 1.1 + (idx / B.ring.length) * 6.28;
        s.position.set(Math.cos(a) * 6.5, 6 + Math.sin(a * 1.4) * 2.4, Math.sin(a) * 6.5);
      });
      if (B.atkCd <= 0 && (P.invisT <= 0 || decoyOn)) {
        B.atkCd = 2.6;
        // 八方弹幕
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * 6.28 + G.t;
          shoot({
            char: '蚀', pos: B.pos.clone().add(new THREE.Vector3(0, 5, 0)),
            vel: new THREE.Vector3(Math.cos(a) * 11, -1.2, Math.sin(a) * 11),
            owner: 'enemy', dmg: 14, color: '#ff6a7a', size: 1.1, life: 5,
          });
        }
        SFX.play('boss');
      }
      if (B.sumCd <= 0) {
        B.sumCd = 12;
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * 6.28;
          spawnEnemy('melee', B.pos.clone().add(new THREE.Vector3(Math.cos(a) * 8, 0, Math.sin(a) * 8)));
        }
        FX.glyphBurst(B.pos.clone().add(new THREE.Vector3(0, 4, 0)), '魉', '#c08aff', 12, 8);
      }
    }

    // 投射物
    for (let i = G.projectiles.length - 1; i >= 0; i--) {
      const pr = G.projectiles[i];
      const pdt = pr.owner === 'enemy' ? sdt : dt;
      pr.life -= pdt;
      if (pr.life <= 0) {
        G.scene.remove(pr.sprite);
        G.projectiles.splice(i, 1);
        continue;
      }
      // 追踪
      if (pr.homing > 0 && pr.owner === 'player') {
        let best = null, bd = 26;
        for (const e of G.enemies) {
          if (e.dead) continue;
          const d = e.pos.distanceTo(pr.pos);
          if (d < bd) { bd = d; best = e.pos.clone().add(new THREE.Vector3(0, 1.2, 0)); }
        }
        if (G.boss && !G.boss.dead) {
          const d = G.boss.pos.distanceTo(pr.pos);
          if (d < bd) { bd = d; best = G.boss.pos.clone().add(new THREE.Vector3(0, 6, 0)); }
        }
        if (best) {
          const want = best.sub(pr.pos).normalize().multiplyScalar(pr.vel.length());
          pr.vel.lerp(want, Math.min(1, pr.homing * pdt));
        }
      }
      pr.pos.addScaledVector(pr.vel, pdt);
      pr.sprite.material.rotation += pdt * 6;
      // 落地:墨溅消散(火雨等带 aoe 的弹会炸开)
      if (pr.pos.y < World.groundHeight(pr.pos.x, pr.pos.z) + 0.1) {
        if (pr.aoe && pr.owner === 'player') {
          areaDamage(pr.pos, pr.aoe, pr.dmg * 0.8);
          FX.glyphBurst(pr.pos.clone(), '火焚燃', '#ff9a4d', 10, 8, 0.6);
          FX.shake(0.25);
          SFX.play('hit');
        }
        FX.inkSplash(pr.pos.clone(), '#1a1f2e', 1.3, 2);
        G.scene.remove(pr.sprite);
        G.projectiles.splice(i, 1);
        continue;
      }
      // 拖尾
      pr.trailT -= pdt;
      if (pr.trailT <= 0) {
        pr.trailT = 0.06;
        const t = GlyphLib.sprite(pr.trailChar, 0.45, pr.color, 0.6);
        t.position.copy(pr.pos);
        FX.spawn({ sprite: t, vel: new THREE.Vector3(0, 0.4, 0), life: 0.35 });
      }

      // 命中判定
      if (pr.owner === 'player') {
        let consumed = false;
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (pr.pos.distanceTo(e.pos.clone().add(new THREE.Vector3(0, 1.2, 0))) < e.radius + 0.5) {
            if (pr.pierce) {
              // 穿透弹:每个敌人只结算一次,弹体继续飞行
              pr.hitSet = pr.hitSet || new Set();
              if (!pr.hitSet.has(e)) { pr.hitSet.add(e); hurtEnemy(e, pr.dmg, pr.pos); }
            } else {
              hurtEnemy(e, pr.dmg, pr.pos);
              consumed = true;
              break;
            }
          }
        }
        if (!consumed && G.boss && !G.boss.dead &&
            pr.pos.distanceTo(G.boss.pos.clone().add(new THREE.Vector3(0, 6, 0))) < G.boss.radius + 1) {
          if (pr.pierce) {
            if (!pr.bossHit) { pr.bossHit = true; hurtBoss(pr.dmg); }
          } else {
            hurtBoss(pr.dmg);
            consumed = true;
          }
        }
        if (consumed) { G.scene.remove(pr.sprite); G.projectiles.splice(i, 1); continue; }
      } else {
        // 敌方弹 → 玩家 / 反墨盾
        const pc = P.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
        const d = pr.pos.distanceTo(pc);
        if (P.shieldT > 0 && d < 3.2) {
          // 抽象化反弹:咒文化为「返」反击
          pr.owner = 'player';
          pr.dmg = G.buffs.reflectDmg;
          pr.char = '返';
          pr.color = '#ffd87a';
          pr.trailChar = '返';
          G.scene.remove(pr.sprite);
          pr.sprite = GlyphLib.sprite('返', 1.1, '#ffd87a');
          pr.sprite.position.copy(pr.pos);
          G.scene.add(pr.sprite);
          pr.pos = pr.sprite.position;
          // 飞向最近敌人
          let best = null, bd = 1e9;
          for (const e of G.enemies) {
            if (e.dead) continue;
            const dd = e.pos.distanceTo(pr.pos);
            if (dd < bd) { bd = dd; best = e.pos.clone().add(new THREE.Vector3(0, 1.2, 0)); }
          }
          if (!best && G.boss && !G.boss.dead) best = G.boss.pos.clone().add(new THREE.Vector3(0, 6, 0));
          pr.vel = (best ? best.sub(pr.pos).normalize() : pr.vel.clone().normalize().negate()).multiplyScalar(26);
          pr.homing = 6; pr.life = 4;
          FX.sparks(pr.pos, '#ffd87a', 10);
          SFX.play('shield');
        } else if (d < 1.2) {
          Player.damage(pr.dmg);
          G.scene.remove(pr.sprite); G.projectiles.splice(i, 1);
        }
      }
    }
  }

  return {
    update, playerSlash, fireArrow, shield, spawnEnemy, areaDamage, onWorldGrow, hurtEnemy,
    windBlades, thunder, fireRain, spawnDecoy, placeLure,
  };
})();
