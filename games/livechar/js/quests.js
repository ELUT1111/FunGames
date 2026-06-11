/* ============================================================
 * 活字灵境 · quests.js
 * 支线系统:《活字谣》残诗拾遗、试炼三坛(永久强化)、
 * 精英狂魉、成就图鉴
 * ============================================================ */
'use strict';

const Quests = (() => {
  /* ---------- 《活字谣》残诗 ---------- */
  const POEM = [
    '一字落虚空,',
    '万象始有形。',
    '山高水流长,',
    '林深城自鸣。',
    '墨尽人未老,',
    '书成天地新。',
  ];
  const POEM_SPOTS = [
    { pos: new THREE.Vector3(-106, 17, -116), hint: '副峰之上' },
    { pos: new THREE.Vector3(61, 1.3, -53),   hint: '河源西岸' },
    { pos: new THREE.Vector3(-40, 1.3, 80),   hint: '林心深处' },
    { pos: new THREE.Vector3(120, 14.5, 120), hint: '齿轮之上' },
    { pos: new THREE.Vector3(58, 1.3, 68),    hint: '裂谷南缘' },
    { pos: new THREE.Vector3(0, 1.3, -170),   hint: '北方虚空' },
  ];
  const poemGot = new Array(POEM.length).fill(false);

  /* ---------- 成就 ---------- */
  const ACH = {
    '初啼':   '初啼 — 第一次击碎墨魉',
    '渡谷':   '渡谷 — 以「桥」字横渡裂谷',
    '拓碑人': '拓碑人 — 拓读全部四座古碑',
    '开匣师': '开匣师 — 开启全部四只文匣',
    '鱼跃':   '鱼跃 — 捕得五尾字鱼',
    '千字文': '千字文 — 累计收集五十枚活字',
    '诗心':   '诗心 — 集齐《活字谣》全六句',
    '三坛圆满': '三坛圆满 — 通过全部试炼',
    '屠狂':   '屠狂 — 讨伐精英狂魉',
    '书成':   '书成 — 击败蚀文之主「噬」',
  };
  const unlocked = new Set();
  const counters = { kills: 0, glyphs: 0, fish: 0, steles: 0, chests: 0 };

  function unlock(id) {
    if (unlocked.has(id) || !ACH[id]) return;
    unlocked.add(id);
    UI.message('成就达成 ✦ ' + ACH[id], 4200);
    SFX.play('glyph');
    if (G.player) Sky.ripple(G.player.pos.clone().setY(3), 0.8);
  }

  /* ---------- 试炼三坛 ---------- */
  const trials = {
    '斩': { state: 'idle', name: '斩之试炼', desc: '60 秒内斩灭八只试炼墨魉', reward: '墨痕斩淬炼(伤害 22→32)',
            pos: new THREE.Vector3(-30, 0, -50), color: '#ff7a8a', t: 0, kills: 0 },
    '行': { state: 'idle', name: '行之试炼', desc: '40 秒内依次穿过六道字环', reward: '墨遁轻盈(冷却减半·耗墨 8→5)',
            pos: new THREE.Vector3(-10, 0, 20), color: '#8af0ff', t: 0, idx: 0, rings: [] },
    '守': { state: 'idle', name: '守之试炼', desc: '在符阵中坚守 30 秒,不得踏出', reward: '反墨盾固化(持续翻倍·反伤 30→45)',
            pos: new THREE.Vector3(110, 0, 30), color: '#ffd87a', t: 0, spawnT: 0 },
  };
  // 行之试炼字环路径(相对祭坛)
  const RING_OFFSETS = [
    [6, 1.5, -4], [14, 2.2, -12], [24, 2.6, -6], [30, 2.0, 6], [24, 1.6, 16], [12, 1.5, 20],
  ];
  let anyActive = null;

  function buildAltar(key) {
    const tr = trials[key];
    const grp = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2.5, 0.9, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a2f3a, emissive: 0x0a0c12, flatShading: true })
    );
    base.position.y = 0.45;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(base.geometry),
      new THREE.LineBasicMaterial({ color: tr.color, transparent: true, opacity: 0.6 })
    );
    base.add(edge);
    grp.add(base);
    const mark = GlyphLib.sprite(key, 1.8, tr.color, 0.95);
    mark.position.y = 2.4;
    grp.add(mark);
    grp.position.copy(tr.pos);
    G.scene.add(grp);
    tr.mark = mark;
    const t = {
      mesh: grp, type: 'altar', name: tr.name + ' · F 启坛(' + tr.desc + ')',
      pos: tr.pos.clone().setY(1.5), radius: 3,
      onUse: () => {
        if (tr.state === 'done') { UI.message('此坛已圆满 —— ' + tr.reward); return; }
        if (anyActive) { UI.message('正有试炼进行中,心无二用。'); return; }
        startTrial(key);
      },
    };
    Systems.registerTogglable(t);
  }

  function startTrial(key) {
    const tr = trials[key];
    if (tr.state !== 'idle') return;
    tr.state = 'active';
    anyActive = key;
    SFX.play('boss');
    FX.shake(0.5);
    Sky.ripple(tr.pos.clone().setY(3), 1.2);
    FX.glyphBurst(tr.pos.clone().setY(2.5), key + '试炼启', tr.color, 18, 9, 0.7);
    if (key === '斩') {
      tr.t = 60; tr.kills = 0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 6.28;
        const e = Combat.spawnEnemy(i % 3 === 2 ? 'ranged' : 'melee',
          tr.pos.clone().add(new THREE.Vector3(Math.cos(a) * Util.rand(9, 15), 0, Math.sin(a) * Util.rand(9, 15))));
        e.trialTag = '斩';
      }
      UI.message('「斩」—— 试炼墨魉自八方而来!');
    } else if (key === '行') {
      tr.t = 40; tr.idx = 0; tr.rings = [];
      for (const off of RING_OFFSETS) {
        const ring = new THREE.Group();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * 6.28;
          const s = GlyphLib.sprite('环', 0.6, '#8af0ff', 0.85);
          s.position.set(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0);
          ring.add(s);
        }
        ring.position.copy(tr.pos).add(new THREE.Vector3(off[0], off[1], off[2]));
        G.scene.add(ring);
        tr.rings.push(ring);
      }
      UI.message('「行」—— 循字环而行,疾如墨风!(Shift 墨遁)');
    } else if (key === '守') {
      tr.t = 30; tr.spawnT = 1.5;
      tr.zone = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 6.28;
        const s = GlyphLib.sprite('守', 0.9, '#ffd87a', 0.8);
        s.position.copy(tr.pos).add(new THREE.Vector3(Math.cos(a) * 10, 1, Math.sin(a) * 10));
        G.scene.add(s);
        tr.zone.push(s);
      }
      UI.message('「守」—— 立于符阵之内,寸步不让!');
    }
  }

  function endTrial(key, success) {
    const tr = trials[key];
    anyActive = null;
    UI.setTrialHud(null);
    // 清理试炼实体
    if (key === '斩') {
      for (const e of G.enemies) {
        if (e.trialTag === '斩' && !e.dead) { e.dead = true; G.scene.remove(e.group); }
      }
    } else if (key === '行') {
      tr.rings.forEach(r => G.scene.remove(r));
      tr.rings = [];
    } else if (key === '守') {
      (tr.zone || []).forEach(s => G.scene.remove(s));
      tr.zone = [];
    }
    if (!success) {
      tr.state = 'idle';
      UI.message(tr.name + ' 未竟 —— 调息之后,可再启坛。');
      SFX.play('hurt');
      return;
    }
    tr.state = 'done';
    if (tr.mark) tr.mark.material.color.setHex(0xffffff);
    SFX.play('win');
    FX.flash(0.35, 500);
    Sky.ripple(tr.pos.clone().setY(3), 1.8);
    FX.glyphBurst(tr.pos.clone().setY(2.5), key + '圆满', '#ffe9b0', 24, 11, 0.8);
    // 永久强化
    if (key === '斩') G.buffs.slashDmg = 32;
    if (key === '行') { G.buffs.dashCd = 0.45; G.buffs.dashCost = 5; }
    if (key === '守') { G.buffs.shieldDur = 1.4; G.buffs.reflectDmg = 45; }
    UI.message(tr.name + ' 圆满!✦ ' + tr.reward, 5200);
    if (Object.values(trials).every(x => x.state === 'done')) unlock('三坛圆满');
  }

  /* ---------- 精英狂魉 ---------- */
  let eliteCd = 50, eliteAlive = false;

  function trySpawnElite(dt) {
    if (G.world.count < 2 || eliteAlive || G.over || G.boss) return;
    eliteCd -= dt;
    if (eliteCd > 0) return;
    eliteCd = 120;
    const P = G.player;
    const a = Math.random() * 6.28;
    const e = Combat.spawnEnemy('melee', P.pos.clone().add(new THREE.Vector3(Math.cos(a) * 55, 0, Math.sin(a) * 55)), { elite: true });
    eliteAlive = true;
    UI.message('远处传来撕纸般的嘶吼 —— 精英「狂魉」出没!', 4600);
    SFX.play('boss');
    Sky.ripple(e.pos.clone().setY(3), 1.4);
  }

  /* ---------- 事件钩子 ---------- */
  function onEnemyKilled(e) {
    counters.kills++;
    unlock('初啼');
    if (e.trialTag === '斩' && trials['斩'].state === 'active') {
      trials['斩'].kills++;
      if (trials['斩'].kills >= 8) endTrial('斩', true);
    }
    if (e.elite) {
      eliteAlive = false;
      unlock('屠狂');
      UI.message('狂魉崩解为漫天残字 —— 拾取它守护的稀有活字!', 4600);
    }
  }
  function onGlyphGain(n) {
    counters.glyphs += n;
    if (counters.glyphs >= 50) unlock('千字文');
  }
  function onFish() {
    counters.fish++;
    if (counters.fish >= 5) unlock('鱼跃');
  }
  function onStele() {
    counters.steles++;
    if (counters.steles >= 4) unlock('拓碑人');
  }
  function onChest() {
    counters.chests++;
    if (counters.chests >= 4) unlock('开匣师');
  }
  function onBridge() { unlock('渡谷'); }
  function onBossDead() { unlock('书成'); }

  function onPoem(idx, pos) {
    if (poemGot[idx]) return;
    poemGot[idx] = true;
    const got = poemGot.filter(Boolean).length;
    UI.message('拾得残句 ——「' + POEM[idx] + '」(' + got + ' / ' + POEM.length + ')', 4600);
    SFX.play('glyph');
    if (pos) FX.glyphBurst(pos, POEM[idx].replace(/[,。]/g, ''), '#d8a4ff', 16, 8, 0.6);
    if (got >= POEM.length) {
      unlock('诗心');
      const P = G.player;
      P.maxHp += 25; P.hp = P.maxHp;
      P.maxInk += 25; P.ink = P.maxInk;
      UI.message('《活字谣》诗成!诗魂入体 —— 墨魂与墨量上限大幅提升!', 6000);
      SFX.play('win');
      FX.flash(0.4, 700);
      Sky.ripple(P.pos.clone().setY(3), 2.2);
    }
  }

  /* ---------- 周期更新 ---------- */
  function update(dt) {
    trySpawnElite(dt);
    const P = G.player;
    if (!anyActive) return;
    const tr = trials[anyActive];
    tr.t -= dt;
    if (anyActive === '斩') {
      UI.setTrialHud('斩之试炼 ' + Math.ceil(tr.t) + 's · ' + tr.kills + ' / 8');
      if (tr.t <= 0) endTrial('斩', false);
    } else if (anyActive === '行') {
      UI.setTrialHud('行之试炼 ' + Math.ceil(tr.t) + 's · 字环 ' + tr.idx + ' / 6');
      tr.rings.forEach((r, i) => {
        r.rotation.y += dt * (i === tr.idx ? 3 : 0.8);
        const on = i === tr.idx;
        r.children.forEach(s => {
          s.material.opacity = i < tr.idx ? 0.15 : (on ? 0.7 + 0.3 * Math.sin(G.t * 6) : 0.45);
          s.material.color.setHex(i < tr.idx ? 0x4a6a70 : (on ? 0xffe9b0 : 0x8af0ff));
        });
      });
      const cur = tr.rings[tr.idx];
      if (cur && P.pos.distanceTo(cur.position) < 2.4) {
        tr.idx++;
        SFX.play('pickup');
        FX.glyphBurst(cur.position.clone(), '环', '#8af0ff', 8, 6, 0.5);
        if (tr.idx >= tr.rings.length) endTrial('行', true);
      }
      if (tr.t <= 0) endTrial('行', false);
    } else if (anyActive === '守') {
      UI.setTrialHud('守之试炼 ' + Math.ceil(tr.t) + 's · 坚守符阵');
      (tr.zone || []).forEach((s, i) => {
        s.material.opacity = 0.5 + 0.3 * Math.sin(G.t * 3 + i);
      });
      if (Util.dist2d(P.pos, trials['守'].pos) > 10.5) { endTrial('守', false); return; }
      tr.spawnT -= dt;
      if (tr.spawnT <= 0) {
        tr.spawnT = 5;
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * 6.28;
          const e = Combat.spawnEnemy(k === 0 ? 'melee' : 'ranged',
            trials['守'].pos.clone().add(new THREE.Vector3(Math.cos(a) * 16, 0, Math.sin(a) * 16)));
          e.trialTag = '守';
        }
      }
      if (tr.t <= 0) {
        // 清掉余敌
        for (const e of G.enemies) {
          if (e.trialTag === '守' && !e.dead) { e.dead = true; G.scene.remove(e.group); }
        }
        endTrial('守', true);
      }
    }
  }

  /* ---------- 初始化 ---------- */
  function init() {
    // 残句拾取物
    POEM_SPOTS.forEach((s, i) => {
      Systems.addPickup({ char: '句', pos: s.pos.clone(), size: 1.1, color: '#d8a4ff', kind: 'poem', idx: i });
    });
    // 三坛
    for (const key of Object.keys(trials)) buildAltar(key);
  }

  /* ---------- 图鉴数据(供书阁面板) ---------- */
  function codexData() {
    return {
      poem: POEM.map((line, i) => ({ line, got: poemGot[i], hint: POEM_SPOTS[i].hint })),
      trials: Object.entries(trials).map(([k, t]) => ({ key: k, name: t.name, desc: t.desc, reward: t.reward, state: t.state })),
      ach: Object.entries(ACH).map(([id, text]) => ({ id, text, got: unlocked.has(id) })),
      counters,
    };
  }

  return {
    init, update, startTrial, codexData, unlock,
    onEnemyKilled, onGlyphGain, onFish, onStele, onChest, onBridge, onBossDead, onPoem,
  };
})();
