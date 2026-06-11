/* ============================================================
 * 活字灵境 · ui.js
 * HUD、消息、活字工坊面板、目标引导、开始/死亡/胜利界面
 * ============================================================ */
'use strict';

const UI = (() => {
  const $ = id => document.getElementById(id);
  let msgTimer = null;
  let slotA = null, slotB = null;
  let craftOpen = false, codexOpen = false;

  function updatePause() {
    G.paused = craftOpen || codexOpen;
  }

  /* ---------- HUD ---------- */
  function updateBars() {
    const P = G.player;
    $('hp-bar').style.width = (P.hp / P.maxHp * 100) + '%';
    $('ink-bar').style.width = (P.ink / P.maxInk * 100) + '%';
  }
  function setStage(label) { $('stage-label').textContent = label; }
  function litWorldGlyph(g) {
    document.querySelectorAll('#world-glyphs .wg').forEach(el => {
      if (el.dataset.g === g) el.classList.add('lit');
    });
  }
  function setSeals(n) { $('seal-count').textContent = '古印 ' + n + ' / 3'; }

  function message(text, dur = 3400) {
    const el = $('message');
    el.innerHTML = text;
    el.style.opacity = 1;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { el.style.opacity = 0; }, dur);
  }

  function targetTip(text) {
    const el = $('target-tip'), ch = $('crosshair');
    if (text) { el.textContent = text; el.style.opacity = 1; ch.classList.add('can-toggle'); }
    else { el.style.opacity = 0; ch.classList.remove('can-toggle'); }
  }

  /* ---------- 目标引导 ---------- */
  const OBJECTIVES = [
    '寻找悬浮于虚空的发光活字 ——「山」(西北方,跟随光柱)',
    '让更多文字成真 —— 收集「水」(东北方)',
    '世界正在苏醒 —— 收集「树」(西南方)',
    '最后一字 —— 收集「城」(东南方,需渡过裂谷)',
    '蚀文之主「噬」已苏醒 —— 守护你书写的世界!',
  ];
  function onWorldTransformed(g, count) {
    $('objective').textContent = '◈ ' + (OBJECTIVES[count] || OBJECTIVES[4]);
    const lines = {
      '山': '「山」字隆起 —— 平面文字化作层峦叠嶂!',
      '水': '「水」字流淌 —— 墨线化作粼粼大河!',
      '树': '「树」字生长 —— 笔画抽枝,字海成林!',
      '城': '「城」字铸成 —— 蒸汽与铜齿轮的古城拔地而起!',
    };
    message(lines[g] || '', 4200);
  }
  function initObjective() { $('objective').textContent = '◈ ' + OBJECTIVES[0]; }

  /* ---------- 技能槽 ---------- */
  function refreshAbilities() {
    document.querySelectorAll('.ab-slot').forEach((el, i) => {
      const ab = G.abilities[i];
      el.querySelector('.ab-name').textContent = ab ? ab.name.slice(0, 4) : '—';
      el.querySelector('.ab-charge').textContent = ab ? '×' + ab.charges : '';
      el.classList.toggle('ready', !!ab && ab.charges > 0);
    });
  }

  /* ---------- Boss 血条 ---------- */
  function showBossBar(show) { $('boss-bar-wrap').classList.toggle('hidden', !show); }
  function setBossHp(k) { $('boss-bar').style.width = Math.max(0, k * 100) + '%'; }

  /* ---------- 活字工坊 ---------- */
  function toggleCraft(force) {
    craftOpen = force !== undefined ? force : !craftOpen;
    if (craftOpen && codexOpen) { codexOpen = false; $('codex-panel').classList.add('hidden'); }
    $('craft-panel').classList.toggle('hidden', !craftOpen);
    updatePause();
    if (craftOpen) {
      document.exitPointerLock && document.exitPointerLock();
      renderCraft();
    }
  }
  function isCraftOpen() { return craftOpen; }
  function isAnyPanelOpen() { return craftOpen || codexOpen; }

  /* ---------- 书阁(支线图鉴) ---------- */
  function toggleCodex(force) {
    codexOpen = force !== undefined ? force : !codexOpen;
    if (codexOpen && craftOpen) { craftOpen = false; $('craft-panel').classList.add('hidden'); }
    $('codex-panel').classList.toggle('hidden', !codexOpen);
    updatePause();
    if (codexOpen) {
      document.exitPointerLock && document.exitPointerLock();
      renderCodex();
    }
  }
  function renderCodex() {
    const d = Quests.codexData();
    $('poem-list').innerHTML = d.poem.map(p =>
      p.got
        ? '<div>✦ ' + p.line + '</div>'
        : '<div class="miss">· ????????? <span class="hint">(' + p.hint + ')</span></div>'
    ).join('');
    const stateText = { idle: '未试', active: '进行中', done: '✦ 圆满' };
    $('trial-list').innerHTML = d.trials.map(t =>
      '<div class="' + (t.state === 'done' ? 't-done' : '') + '">「' + t.key + '」' + t.name + ' — ' + t.desc +
      '<span class="t-state">' + stateText[t.state] + '</span><br><span style="font-size:12px;color:#8a7a5a">奖励:' + t.reward + '</span></div>'
    ).join('');
    $('ach-list').innerHTML = d.ach.map(a =>
      '<div class="' + (a.got ? 'got' : '') + '">' + (a.got ? '✦ ' : '· ') + a.text + '</div>'
    ).join('');
    $('codex-counters').textContent =
      '斩魉 ' + d.counters.kills + ' · 集字 ' + d.counters.glyphs + ' · 捕鱼 ' + d.counters.fish +
      ' · 拓碑 ' + d.counters.steles + ' / 4 · 开匣 ' + d.counters.chests + ' / 4';
  }

  /* ---------- 试炼 HUD ---------- */
  function setTrialHud(text) {
    const el = $('trial-hud');
    if (text) { el.textContent = '⚔ ' + text; el.style.display = 'block'; }
    else el.style.display = 'none';
  }

  function renderCraft() {
    // 背包
    const grid = $('inv-grid');
    grid.innerHTML = '';
    const entries = Object.entries(G.inv);
    if (!entries.length) {
      grid.innerHTML = '<div class="inv-empty">背包空空 —— 去虚空中收集发光的活字吧</div>';
    }
    for (const [ch, n] of entries) {
      const el = document.createElement('div');
      el.className = 'inv-item';
      el.innerHTML = ch + '<span class="cnt">×' + n + '</span>';
      el.onclick = () => {
        if (!slotA) slotA = ch;
        else if (!slotB) slotB = ch;
        else { slotA = ch; slotB = null; }
        renderCraft();
      };
      grid.appendChild(el);
    }
    // 槽位
    $('slot-a').textContent = slotA || '？';
    $('slot-b').textContent = slotB || '？';
    $('slot-a').classList.toggle('filled', !!slotA);
    $('slot-b').classList.toggle('filled', !!slotB);
    // 预览结果
    const res = $('craft-result');
    if (slotA && slotB) {
      const r = Systems.RECIPES[slotA + '+' + slotB] || Systems.RECIPES[slotB + '+' + slotA];
      res.textContent = r ? r.result : '✕';
      res.classList.toggle('ok', !!r);
    } else { res.textContent = '？'; res.classList.remove('ok'); }
    // 配方
    const list = $('recipe-list');
    list.innerHTML = Object.entries(Systems.RECIPES).map(([k, r]) => {
      const isMade = Systems.made.has(k);
      return '<div class="' + (isMade ? 'made' : '') + '">' + (isMade ? '✦ ' : '· ') + r.desc + '</div>';
    }).join('');
  }

  function bindCraft() {
    $('slot-a').onclick = () => { slotA = null; renderCraft(); };
    $('slot-b').onclick = () => { slotB = null; renderCraft(); };
    $('craft-btn').onclick = () => {
      if (!slotA || !slotB) { message('请先从背包选择两枚活字'); return; }
      const r = Systems.tryCraft(slotA, slotB);
      if (!r) message('这两个字…… 排在一起没有意义。');
      slotA = slotB = null;
      renderCraft();
    };
  }

  /* ---------- 全屏界面 ---------- */
  function showDeath() {
    document.exitPointerLock && document.exitPointerLock();
    $('death-screen').classList.remove('hidden');
  }
  function showWin() {
    G.over = true;
    document.exitPointerLock && document.exitPointerLock();
    $('win-screen').classList.remove('hidden');
  }

  // 开始界面标题字雨
  function titleRain() {
    const el = $('title-glyphs');
    const chars = '活字灵境山水树城火箭冰墙时缓隐身墨魂书桥';
    setInterval(() => {
      if (!el || G.started) return;
      let s = '';
      for (let i = 0; i < 14; i++) s += chars[Math.floor(Math.random() * chars.length)];
      el.textContent = s;
      el.style.opacity = 0.15 + Math.random() * 0.25;
    }, 600);
  }

  function init() {
    bindCraft();
    titleRain();
    refreshAbilities();
  }

  return {
    init, updateBars, setStage, litWorldGlyph, setSeals, message, targetTip,
    onWorldTransformed, initObjective, refreshAbilities,
    showBossBar, setBossHp, toggleCraft, isCraftOpen, isAnyPanelOpen, renderCraft,
    toggleCodex, setTrialHud,
    showDeath, showWin,
  };
})();
