/* ============================================================
 * 活字灵境 · main.js
 * 场景初始化、光照、输入、主循环
 * ============================================================ */
'use strict';

(function () {
  const canvas = document.getElementById('game');
  function lockPointer() {
    try { canvas.requestPointerLock && canvas.requestPointerLock(); } catch (e) {}
  }

  /* ---------- 渲染器与场景 ---------- */
  function setupScene() {
    G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    G.renderer.setSize(window.innerWidth, window.innerHeight);
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    G.scene = new THREE.Scene();
    G.scene.background = new THREE.Color(0x000000);
    G.scene.fog = new THREE.FogExp2(0x000000, 0.02);

    G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
    G.camera.position.set(0, 5, 22);

    // 极简光照:冷环境光 + 一束"天光"
    G.ambient = new THREE.AmbientLight(0x202028, 1);
    G.scene.add(G.ambient);
    const moon = new THREE.DirectionalLight(0x8a9ac0, 0.7);
    moon.position.set(40, 80, 20);
    G.scene.add(moon);

    window.addEventListener('resize', () => {
      G.camera.aspect = window.innerWidth / window.innerHeight;
      G.camera.updateProjectionMatrix();
      G.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /* ---------- 输入 ---------- */
  function setupInput() {
    window.addEventListener('keydown', e => {
      G.keys[e.code] = true;
      if (!G.started) return;
      switch (e.code) {
        case 'KeyC': UI.toggleCraft(); break;
        case 'KeyJ': UI.toggleCodex(); break;
        case 'KeyF': if (!UI.isAnyPanelOpen() && !G.over) Systems.toggleAim(); break;
        case 'KeyQ': if (!UI.isAnyPanelOpen() && !G.over) Systems.writeLight(); break;
        case 'KeyX': if (!UI.isAnyPanelOpen() && !G.over) Systems.writeSlow(); break;
        case 'KeyR': if (!UI.isAnyPanelOpen() && !G.over) Systems.writeLantern(); break;
        case 'KeyT': if (!UI.isAnyPanelOpen() && !G.over) Systems.writeLure(); break;
        case 'KeyG': if (!UI.isAnyPanelOpen() && !G.over) Systems.writeGate(); break;
        case 'Digit1': Systems.useAbility(0); break;
        case 'Digit2': Systems.useAbility(1); break;
        case 'Digit3': Systems.useAbility(2); break;
        case 'Digit4': Systems.useAbility(3); break;
        case 'Digit5': Systems.useAbility(4); break;
        case 'Digit6': Systems.useAbility(5); break;
        case 'Escape':
          if (UI.isCraftOpen()) UI.toggleCraft(false);
          else UI.toggleCodex(false);
          break;
      }
    });
    window.addEventListener('keyup', e => { G.keys[e.code] = false; });

    // 指针锁定与视角
    canvas.addEventListener('click', () => {
      if (G.started && !UI.isAnyPanelOpen() && !G.over && !G.pointerLocked) {
        lockPointer();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      G.pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', e => {
      if (!G.pointerLocked || G.paused) return;
      G.yaw -= e.movementX * 0.0026;
      // 鼠标上推 = 抬头(俯仰为视线仰角,正值朝上)
      G.pitch = Math.max(-0.8, Math.min(0.85, G.pitch - e.movementY * 0.0022));
    });
    document.addEventListener('mousedown', e => {
      if (!G.started || UI.isAnyPanelOpen() || G.over || !G.pointerLocked) return;
      if (e.button === 0) Combat.playerSlash();
      if (e.button === 2) Combat.shield();
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* ---------- 开始 / 重生 ---------- */
  function setupScreens() {
    document.getElementById('start-btn').onclick = () => {
      SFX.ensure();
      G.started = true;
      document.getElementById('start-screen').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');
      document.getElementById('crosshair').classList.remove('hidden');
      lockPointer();
      UI.initObjective();
      UI.message('你醒来,是一枚名为「人」的活字。<br>这个世界,等待被书写。', 5200);
      SFX.play('glyph');
    };
    document.getElementById('respawn-btn').onclick = () => {
      document.getElementById('death-screen').classList.add('hidden');
      Player.respawn();
      lockPointer();
      UI.message('字魂重凝 —— 已写下的世界仍在。');
    };
  }

  /* ---------- 主循环 ---------- */
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!G.started) { G.renderer.render(G.scene, G.camera); return; }
    if (!G.paused) {
      G.t += dt;
      Player.update(dt);
      World.update(dt);
      Combat.update(dt);
      Systems.update(dt);
      Quests.update(dt);
      Sky.update(dt);
      FX.update(dt);
      UI.updateBars();
    }
    G.renderer.render(G.scene, G.camera);
  }

  /* ---------- 自测模式(#test):自动跑通核心流程 ---------- */
  function runSelfTest() {
    const log = m => console.log('[TEST] ' + m);
    window.addEventListener('error', e => console.log('[TEST-ERROR] ' + e.message + ' @ ' + e.filename + ':' + e.lineno));
    const steps = [
      [300,  () => { document.getElementById('start-btn').click(); log('started'); }],
      [800,  () => { World.transform('山'); log('transform 山'); }],
      [2600, () => { World.transform('水'); log('transform 水'); }],
      [4400, () => { World.transform('树'); log('transform 树'); }],
      [6200, () => { World.transform('城'); log('transform 城'); }],
      [7000, () => {
        Systems.gainGlyph('火'); Systems.gainGlyph('箭');
        const r = Systems.tryCraft('火', '箭');
        log('craft 火+箭 → ' + (r ? r.name : 'FAIL'));
        Systems.useAbility(0); log('useAbility 0');
      }],
      [7600, () => {
        Combat.spawnEnemy('melee', G.player.pos.clone().add(new THREE.Vector3(6, 0, 0)));
        Combat.spawnEnemy('ranged', G.player.pos.clone().add(new THREE.Vector3(-8, 0, 4)));
        Combat.playerSlash(); Combat.shield();
        log('combat spawned+slash+shield, enemies=' + G.enemies.length);
      }],
      [8400, () => {
        Systems.gainGlyph('木'); Systems.gainGlyph('石');
        const r = Systems.tryCraft('木', '石');
        log('craft 木+石 → ' + (r ? r.result : 'FAIL'));
        G.player.pos.set(50, 1, 50);
        World.buildBridge();
        log('bridge built=' + G.world.bridgeBuilt);
      }],
      [9200, () => {
        Systems.gainGlyph('轻'); Systems.writeLight();
        Systems.gainGlyph('慢'); Systems.writeSlow();
        log('writeLight zones=' + G.lightZones.length);
      }],
      [9800, () => {
        const pairs = [['风', '刃'], ['雷', '落'], ['火', '雨'], ['影', '身'], ['愈', '心'], ['金', '木']];
        for (const [a, b] of pairs) {
          Systems.gainGlyph(a); Systems.gainGlyph(b);
          const r = Systems.tryCraft(a, b);
          log('craft ' + a + '+' + b + ' → ' + (r ? (r.name || r.result) : 'FAIL'));
        }
      }],
      [10400, () => {
        Combat.windBlades();
        Combat.thunder(G.player.pos.clone().add(new THREE.Vector3(5, 0, 0)));
        Combat.fireRain(G.player.pos.clone());
        Combat.spawnDecoy();
        Combat.placeLure(G.player.pos.clone().add(new THREE.Vector3(4, 0, 4)));
        log('new combat abilities fired, projectiles=' + G.projectiles.length);
      }],
      [11000, () => {
        Systems.gainGlyph('灯'); Systems.writeLantern();
        Systems.gainGlyph('引'); Systems.writeLure();
        Systems.gainGlyph('门'); Systems.writeGate();
        Systems.gainGlyph('门'); G.player.pos.x += 8; Systems.writeGate();
        log('writes lantern/lure/gates done');
      }],
      [11600, () => {
        // 支线系统:残诗、试炼、成就、书阁
        for (let i = 0; i < 6; i++) Quests.onPoem(i, G.player.pos.clone());
        Quests.startTrial('斩');
        const d = Quests.codexData();
        log('poem all=' + d.poem.every(p => p.got) + ' trial斩=' + d.trials.find(t => t.key === '斩').state +
            ' ach诗心=' + d.ach.find(a => a.id === '诗心').got);
        UI.toggleCodex(true);
        log('codex rendered, poem rows=' + document.querySelectorAll('#poem-list div').length);
        UI.toggleCodex(false);
        // 精英狂魉
        const e = Combat.spawnEnemy('melee', G.player.pos.clone().add(new THREE.Vector3(10, 0, 0)), { elite: true });
        log('elite spawned hp=' + e.hp + ' dmg=' + e.dmg);
      }],
      [12500, () => {
        log('boss=' + (G.boss ? 'alive hp ' + G.boss.hp : 'none'));
        log('player hp=' + G.player.hp + ' ink=' + Math.round(G.player.ink) + ' stage=' + G.player.stage);
        log('worldCount=' + G.world.count + ' particles=' + G.particles.length);
        console.log('TEST_DONE');
      }],
    ];
    for (const [t, fn] of steps) setTimeout(() => { try { fn(); } catch (e) { console.log('[TEST-ERROR] step@' + t + ': ' + e.message + '\n' + e.stack); } }, t);
  }

  /* ---------- 启动 ---------- */
  setupScene();
  Player.init();
  Sky.init();
  World.init();
  Systems.scatterGlyphs();
  Quests.init();
  UI.init();
  setupInput();
  setupScreens();
  requestAnimationFrame(loop);
  if (location.hash === '#test') runSelfTest();
  if (location.hash === '#shot') setTimeout(() => document.getElementById('start-btn').click(), 200);
  if (location.hash === '#shot2' || location.hash === '#shot3') setTimeout(() => {
    document.getElementById('start-btn').click();
    // 跳过补间,直接构建全部实体区域,用于视觉验证
    for (const [g, def] of Object.entries(World.ZONE_DEFS)) {
      G.world.collected[g] = true; G.world.count++;
      G.scene.add(def.build(def.center));
      UI.litWorldGlyph(g);
      Sky.addConstellation(g);
    }
    G.scene.fog.density = 0.0055;
    G.ambient.color.setHex(0x3a3226);
    Sky.setStage(4);
    Player.evolve(4);
    // 玩家放在城区前,镜头看向古城;#shot3 则看向山脉与河流
    if (location.hash === '#shot3') {
      G.player.pos.set(-52, 0, -86);
      G.yaw = 0.86; G.pitch = 0.12;
    } else {
      G.player.pos.set(95, 0, 88);
      G.yaw = Math.PI * 0.78; G.pitch = -0.05;
    }
  }, 200);
})();
