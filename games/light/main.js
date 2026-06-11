// 棱镜光鱼 PRISM LUMEN · 主逻辑
import * as THREE from 'three';
import { SPECTRUM, MODES, COLOR_OF, FUSIONS, fusionKey, STAGES, WORLD } from './config.js';
import { createWorld, applyRevive, updateWorld, rocks } from './world.js';
import { createPlayer, updatePlayerLook, spawnFish, spawnPredator, steerWander } from './fish.js';
import { initFX, updateFX, burst, prismFlash, shockwave, makeShield } from './fx.js';
import * as ui from './ui.js';

window.__GAME_BOOTED = true;

// ---------- 渲染基础 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

createWorld(scene);
initFX(scene);
ui.initHUD();

// ---------- 实体 ----------
const player = createPlayer(scene);
player.pos.set(0, 0, 0);
const shieldMesh = makeShield(player.group);
const fishes = [], predators = [];
for (let i = 0; i < WORLD.fishCount; i++) spawnFish(scene, fishes, i < 20);
for (let i = 0; i < WORLD.predatorCount; i++) spawnPredator(scene, predators);

// ---------- 游戏状态 ----------
const state = {
  running: false,
  shards: Object.fromEntries(SPECTRUM.map(s => [s.id, 0])),
  total: 0, eaten: 0, revive: 0,
  mode: null, prevMode: null,
  cds: Object.fromEntries(MODES.map(m => [m.id, 0])),
  regenOn: false, stealthT: 0, shieldT: 0,
  fusion: null, fusionT: 0, fusionTick: 0,
  holyUsed: false, holyT: 0,
  iframes: 0, time: 0,
};

// ---------- 输入 ----------
const keys = {};
let mouseX = 0, mouseY = 0;
addEventListener('mousemove', e => {
  mouseX = (e.clientX / innerWidth) * 2 - 1;
  mouseY = (e.clientY / innerHeight) * 2 - 1;
});
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!state.running) return;
  const num = ({ Digit1:0, Digit2:1, Digit3:2, Digit4:3, Digit5:4 })[e.code];
  if (num !== undefined) switchMode(MODES[num]);
  if (e.code === 'Space'){ e.preventDefault(); castAbility(); }
  if (e.code === 'KeyQ') tryFusion();
  if (e.code === 'KeyX') tryHolyForm();
});
addEventListener('keyup', e => keys[e.code] = false);

document.getElementById('btnStart').onclick = () => { ui.showGame(); state.running = true; };
document.getElementById('btnRetry').onclick = () => location.reload();

// ---------- 光谱模式 ----------
function modeUnlocked(m){ return state.shards[m.id] >= m.need; }

function switchMode(m){
  if (!modeUnlocked(m)){
    ui.toast(`需要 ${m.need} 枚${m.label.split('·')[0]}色光谱碎片`, css(COLOR_OF[m.id]));
    return;
  }
  if (state.mode === m.id) return;
  state.prevMode = state.mode;
  state.mode = m.id;
  state.fusion = null; ui.setFusionTag(null);
  // 切换特效：棱镜旋转 + 光谱分离彩带
  prismFlash(player.pos);
  player.group.rotation.y += Math.PI * 2; // 配合下方插值产生快速自旋
  ui.toast(m.label, css(COLOR_OF[m.id]));
  // 即时效果
  state.regenOn = (m.id === 'green');
  if (m.id === 'blue') activateShield();
  if (m.id === 'purple') activateStealth();
  refreshSlots();
}

function activateShield(){
  if (state.cds.blue > 0) return;
  state.shieldT = 6; state.cds.blue = 8;
  shieldMesh.visible = true;
  shockwave(player.pos, 0x66ccff, 18, 0.9);
  // 冻结附近敌人
  for (const e of [...fishes, ...predators]){
    if (e.group.position.distanceTo(player.pos) < 20) e.frozen = 4;
  }
}

function activateStealth(){
  if (state.cds.purple > 0) return;
  state.stealthT = 5; state.cds.purple = 10;
  player.bodyMat.opacity = 0.25; player.finMat.opacity = 0.15;
  ui.toast('虚空潜行 · 隐身穿行', '#b44bff');
}

function castAbility(){
  if (state.holyT > 0) return solarFlare();
  if (state.mode === 'yellow' && state.cds.yellow <= 0){
    state.cds.yellow = 6;
    shockwave(player.pos, 0xffe93b, 34, 1.1);
    let hit = 0;
    for (const e of [...fishes, ...predators]){
      if (e.group.position.distanceTo(player.pos) < 34){ e.stunned = 3.5; hit++; }
    }
    ui.toast(`电磁脉冲 · 麻痹 ${hit} 个生物`, '#ffe93b');
  }
}

// ---------- 融合 ----------
function tryFusion(){
  if (!state.mode || !state.prevMode || state.mode === state.prevMode){
    ui.toast('融合需要先后切换两种不同光谱', '#9fd8ff'); return;
  }
  const f = FUSIONS[fusionKey(state.mode, state.prevMode)];
  if (!f){ ui.toast('这两种光谱无法融合…', '#9fd8ff'); return; }
  state.fusion = f; state.fusionT = 10; state.fusionTick = 0;
  ui.setFusionTag('融合形态 · ' + f.name, css(f.hex));
  ui.toast('光谱融合！' + f.name, css(f.hex));
  prismFlash(player.pos);
  shockwave(player.pos, f.hex, 26, 1.2);
  player.light.color.setHex(f.hex);
}

// ---------- 圣光形态 ----------
function tryHolyForm(){
  const all7 = SPECTRUM.every(s => state.shards[s.id] > 0);
  if (!all7){ ui.toast('集齐七色光谱后方可觉醒', '#ffffff'); return; }
  if (state.holyUsed){ ui.toast('圣光已绽放过，光芒仍在回响', '#ffffff'); return; }
  state.holyUsed = true; state.holyT = 12;
  player.bodyMat.color.setHex(0xffffff);
  player.bodyMat.emissive.setHex(0xffffff);
  player.bodyMat.emissiveIntensity = 1.6;
  player.light.color.setHex(0xffffff); player.light.intensity = 6;
  ui.toast('✦ 纯白圣光形态 ✦ 空格释放太阳耀斑', '#ffffff');
  prismFlash(player.pos);
}

function solarFlare(){
  state.holyT = 0;
  shockwave(player.pos, 0xffffff, 120, 2.0);
  shockwave(player.pos, 0xfff2b0, 90, 1.6);
  let purged = 0;
  for (const e of predators){
    if (e.alive && e.group.position.distanceTo(player.pos) < 110){ killPredator(e); purged++; }
  }
  state.revive = 1; applyRevive(scene, 1, ui.toast);
  ui.toast(`☀ 太阳耀斑！净化 ${purged} 只掠食者，海域彻底复苏`, '#ffffff');
}

// ---------- 吞噬与战斗 ----------
function css(hex){ return '#' + hex.toString(16).padStart(6, '0'); }

function eatFish(f){
  f.alive = false;
  scene.remove(f.group);
  burst(f.group.position, f.hex, 22, 9);
  state.shards[f.colorId]++;
  state.total++; state.eaten++;
  ui.setChip(f.colorId, state.shards[f.colorId]);
  const stage = updatePlayerLook(player, state.shards, state.total);
  ui.setStage(`${STAGES[stage].name} · 体型 ${STAGES[stage].scale.toFixed(2)}`);
  if (state.total === STAGES[stage].at && stage > 0)
    ui.toast('进化 → ' + STAGES[stage].name, css(f.hex));
  // 复苏
  const r = Math.min(1, state.total / WORLD.reviveGoal);
  if (r !== state.revive){ state.revive = r; applyRevive(scene, r, ui.toast); }
  // 解锁提示
  for (const m of MODES)
    if (m.id === f.colorId && state.shards[m.id] === m.need)
      ui.toast(`解锁 ${m.label}（按 ${m.key}）`, css(COLOR_OF[m.id]));
  refreshSlots();
  // 补充新鱼
  spawnFish(scene, fishes, Math.random() < 0.5);
}

function killPredator(e){
  e.alive = false;
  scene.remove(e.group);
  burst(e.group.position, 0xff7733, 36, 14, 0.6);
  setTimeout(() => spawnPredator(scene, predators), 6000);
}

function damagePlayer(amount, from){
  if (state.iframes > 0 || state.stealthT > 0) return;
  if (state.shieldT > 0){
    burst(player.pos, 0x66ccff, 16, 8);
    if (from) from.frozen = 3;
    return;
  }
  player.hp -= amount;
  state.iframes = 1;
  ui.flashDamage();
  if (from){
    const kb = player.pos.clone().sub(from.group.position).normalize().multiplyScalar(18);
    player.vel.add(kb);
  }
  if (player.hp <= 0) gameOver();
}

function gameOver(){
  state.running = false;
  ui.showDead(`吞噬 ${state.eaten} 个光生物 · 海洋复苏度 ${Math.round(state.revive * 100)}% · 阶段「${STAGES[player.stageIdx].name}」`);
}

function refreshSlots(){
  for (const m of MODES){
    ui.setSlot(m.id, {
      locked: !modeUnlocked(m),
      active: state.mode === m.id,
      cdFrac: m.cd > 0 ? state.cds[m.id] / m.cd : 0,
    });
  }
}
refreshSlots();
ui.setStage('无色透明 · 体型 1.00');

// ---------- 主循环 ----------
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), camTarget = new THREE.Vector3(), tmpV = new THREE.Vector3();

function tick(){
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;
  updateWorld(state.time);
  updateFX(dt);

  if (state.running){
    updateTimers(dt);
    updatePlayer(dt);
    updateFishes(dt);
    updatePredators(dt);
    ui.setBars(state.revive, (player.hp / player.maxHp) * 100);
  }
  renderer.render(scene, camera);
}

function updateTimers(dt){
  state.iframes = Math.max(0, state.iframes - dt);
  let dirty = false;
  for (const m of MODES){
    if (state.cds[m.id] > 0){ state.cds[m.id] = Math.max(0, state.cds[m.id] - dt); dirty = true; }
  }
  if (dirty) refreshSlots();
  if (state.shieldT > 0){
    state.shieldT -= dt;
    shieldMesh.rotation.y += dt * 0.8;
    if (state.shieldT <= 0) shieldMesh.visible = false;
  }
  if (state.stealthT > 0){
    state.stealthT -= dt;
    if (state.stealthT <= 0){ player.bodyMat.opacity = 0.92; player.finMat.opacity = 0.7; }
  }
  if (state.regenOn && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + dt * 4);
  if (state.holyT > 0){
    state.holyT -= dt;
    if (state.holyT <= 0){ updatePlayerLook(player, state.shards, state.total); player.light.intensity = 3; }
  }
  // 融合持续效果
  if (state.fusion){
    state.fusionT -= dt;
    state.fusionTick -= dt;
    if (state.fusionTick <= 0){
      state.fusionTick = 1.5;
      const f = state.fusion, key = fusionKey(state.mode, state.prevMode);
      shockwave(player.pos, f.hex, 16, 0.8);
      for (const e of predators){
        if (!e.alive || e.group.position.distanceTo(player.pos) > 18) continue;
        if (key === 'blue+red'){ e.burning = 3; e.hp -= 8; }            // 虚空火焰：灼烧
        else if (key === 'green+red'){ e.hp -= 12; }                     // 腐蚀酸液：高伤
        else if (key === 'blue+yellow'){ e.frozen = 2; e.stunned = 2; }  // 雷电风暴：冰冻+麻痹
        else if (key === 'green+yellow'){ e.stunned = 2; }               // 生命藤蔓：麻痹
        if (e.hp <= 0) killPredator(e);
      }
      if (key === 'green+yellow') player.hp = Math.min(player.maxHp, player.hp + 6);
    }
    if (state.fusionT <= 0){ state.fusion = null; ui.setFusionTag(null); }
  }
}

function updatePlayer(dt){
  // 鼠标转向
  player.yaw -= mouseX * dt * 2.2;
  player.pitch = THREE.MathUtils.lerp(player.pitch, -mouseY * 0.9, dt * 4);
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.1, 1.1);

  const dashing = keys.ShiftLeft || keys.ShiftRight;
  const redDash = dashing && state.mode === 'red';
  const speed = player.speed * (dashing ? (redDash ? 2.6 : 1.7) : 1);
  fwd.set(Math.cos(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.sin(player.yaw) * Math.cos(player.pitch));
  player.vel.lerp(tmpV.copy(fwd).multiplyScalar(speed), dt * 3);
  player.pos.addScaledVector(player.vel, dt);

  // 边界
  const horiz = Math.hypot(player.pos.x, player.pos.z);
  if (horiz > WORLD.radius){
    const k = WORLD.radius / horiz;
    player.pos.x *= k; player.pos.z *= k;
  }
  player.pos.y = THREE.MathUtils.clamp(player.pos.y, WORLD.floorY + 3, WORLD.ceilY - 3);

  // 朝向 & 缩放
  player.group.rotation.set(0, player.yaw, player.pitch * 0.7);
  const s = player.scale * (state.holyT > 0 ? 1.15 : 1);
  player.group.scale.lerp(tmpV.set(s, s, s), dt * 3);
  player.tail.rotation.x = Math.sin(state.time * 10) * 0.5;

  // 红色冲刺尾焰
  if (redDash && Math.random() < 0.6) burst(player.pos, 0xff5533, 4, 4, 0.35);

  // 岩石碰撞（紫色潜行可穿过；红色冲刺撞碎）
  if (state.stealthT <= 0){
    for (const r of rocks){
      if (!r.alive) continue;
      const d = r.mesh.position.distanceTo(player.pos);
      const minD = r.r + 1.6 * player.scale;
      if (d < minD){
        if (redDash){
          r.alive = false; scene.remove(r.mesh);
          burst(r.mesh.position, 0xff8855, 30, 12, 0.55);
          ui.toast('烈焰冲刺 · 岩石粉碎！', '#ff5533');
        } else {
          tmpV.copy(player.pos).sub(r.mesh.position).normalize();
          player.pos.copy(r.mesh.position).addScaledVector(tmpV, minD);
          player.vel.multiplyScalar(0.4);
        }
      }
    }
  }

  // 相机跟随
  camTarget.copy(player.pos).addScaledVector(fwd, -14 * (1 + player.scale * 0.25)).add(tmpV.set(0, 5 + player.scale, 0));
  camera.position.lerp(camTarget, dt * 4);
  camera.lookAt(player.pos);
}

function updateFishes(dt){
  for (const f of fishes){
    if (!f.alive) continue;
    if (f.frozen > 0){ f.frozen -= dt; f.mat.color.setHex(0x88ccff); continue; }
    if (f.stunned > 0){ f.stunned -= dt; f.group.rotation.z += dt * 6; continue; }
    f.mat.color.setHex(f.hex);
    // 小鱼怕大鱼：靠近时逃逸
    const d = f.group.position.distanceTo(player.pos);
    if (d < 14 && f.size < player.scale && state.stealthT <= 0){
      tmpV.copy(f.group.position).sub(player.pos).normalize().multiplyScalar(8);
      f.vel.add(tmpV.multiplyScalar(dt * 6));
    }
    steerWander(f, dt, 7);
    // 吞噬判定
    if (d < 2 + player.scale * 1.6 && f.size < player.scale * 1.15) eatFish(f);
  }
  // 清理
  for (let i = fishes.length - 1; i >= 0; i--) if (!fishes[i].alive) fishes.splice(i, 1);
}

function updatePredators(dt){
  for (const e of predators){
    if (!e.alive) continue;
    if (e.burning > 0){
      e.burning -= dt; e.hp -= dt * 6;
      if (Math.random() < 0.3) burst(e.group.position, 0xff6633, 3, 5, 0.3);
      if (e.hp <= 0){ killPredator(e); continue; }
    }
    if (e.frozen > 0){ e.frozen -= dt; e.mat.color.setHex(0x9fdcff); continue; }
    if (e.stunned > 0){ e.stunned -= dt; e.group.rotation.z += dt * 4; continue; }
    e.mat.color.setHex(0x3c4654);

    const d = e.group.position.distanceTo(player.pos);
    const playerBigger = player.scale > e.size * 0.8;
    if (d < 50 && state.stealthT <= 0 && !playerBigger){
      // 追击玩家
      tmpV.copy(player.pos).sub(e.group.position).normalize().multiplyScalar(10);
      e.vel.lerp(tmpV, dt * 2);
      e.group.position.addScaledVector(e.vel, dt);
      if (e.vel.lengthSq() > 0.01){
        e.group.rotation.y = -Math.atan2(e.vel.z, e.vel.x);
      }
    } else {
      steerWander(e, dt, 6);
    }
    // 碰撞
    if (d < 2.5 + e.size * 0.8 + player.scale){
      if (state.mode === 'red' && (keys.ShiftLeft || keys.ShiftRight)){
        e.burning = 4; e.hp -= 15;
        burst(e.group.position, 0xff5533, 18, 10);
        if (e.hp <= 0) killPredator(e);
      } else if (playerBigger){
        e.hp -= 20; burst(e.group.position, 0xffffff, 12, 8);
        if (e.hp <= 0){ killPredator(e); ui.toast('反噬掠食者！', '#9fd8ff'); }
        state.iframes = Math.max(state.iframes, 0.6);
      } else {
        damagePlayer(16, e);
      }
    }
  }
}

applyRevive(scene, 0, null);
window.__game = { state, player, fishes, predators }; // 调试句柄
tick();
