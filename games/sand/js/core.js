/* =========================================================
 * core.js — 全局命名空间、数学工具、噪声、共享纹理
 * ========================================================= */
'use strict';

const G = window.G = {
  // 运行状态
  started: false,
  paused: false,
  locked: false,
  time: 0,
  // 世界复苏进度 0..1（仅由「融入」的记忆驱动）
  restoration: 0,
  restorationTarget: 0,
  // 时间翻转
  flip: 0,             // 0..1 平滑值
  flipActive: false,
  flipTimer: 0,
  flipCooldown: 0,
  // 记忆统计
  absorbed: { gold: 0, blue: 0, gray: 0, black: 0 },
  buried:   { gold: 0, blue: 0, gray: 0, black: 0 },
  decided: 0,
  totalGrains: 10,
  // 玩家
  integrity: 100,
  speedBonus: 0,       // 埋葬记忆获得
  stage: 0,
  // 注册表
  restorables: [],     // {mat, sand:Color, live:Color, sandRough, liveRough, sandEm, liveEm}
  platforms: [],       // {minX,maxX,minZ,maxZ,y, active:()=>bool}
  npcs: [],
  grains: [],
  enemies: [],
  bolts: [],
  updaters: [],        // fn(dt)
  flatSpots: [],       // 地形整平点 {x,z,h,r}
};

/* ---------------- 数学 ---------------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dist2d = (x1, z1, x2, z2) => Math.hypot(x1 - x2, z1 - z2);
const TAU = Math.PI * 2;

/* ---------------- 确定性噪声 ---------------- */
function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v); // 0..1
}
function fbm(x, y, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * (vnoise(x * f, y * f) * 2 - 1); amp *= 0.5; f *= 2.07; }
  return v; // ~ -1..1
}
// 简易伪随机序列（确定性布景用）
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------------- 共享纹理（Canvas 生成） ---------------- */
const TEX = {};

// 柔光圆点（粒子 / 辉光精灵通用）
TEX.glow = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,.65)');
  grd.addColorStop(0.6, 'rgba(255,255,255,.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); return t;
})();

// 硬一点的沙粒点
TEX.dot = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,.9)');
  grd.addColorStop(0.8, 'rgba(255,255,255,.1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

// 沙地波纹凹凸贴图
TEX.sandBump = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x += 4) {
      const ripple = Math.sin((x * 0.5 + vnoise(x * 0.04, y * 0.04) * 40 + y * 0.12)) * 0.5 + 0.5;
      const n = vnoise(x * 0.3, y * 0.3) * 0.35;
      const v = Math.floor(110 + ripple * 70 + n * 60);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 4, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

// 天空中的巨大沙漏投影（翻转特效）
TEX.hourglassSky = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  g.strokeStyle = 'rgba(255,225,150,.9)';
  g.lineWidth = 7;
  g.shadowColor = 'rgba(255,220,140,1)'; g.shadowBlur = 36;
  // 沙漏轮廓：两个对顶弧形腔
  g.beginPath();
  g.moveTo(-110, -170); g.lineTo(110, -170);
  g.bezierCurveTo(110, -60, 18, -22, 10, 0);
  g.bezierCurveTo(18, 22, 110, 60, 110, 170);
  g.lineTo(-110, 170);
  g.bezierCurveTo(-110, 60, -18, 22, -10, 0);
  g.bezierCurveTo(-18, -22, -110, -60, -110, -170);
  g.closePath(); g.stroke();
  // 内部沙
  g.fillStyle = 'rgba(255,215,130,.5)';
  g.beginPath();
  g.moveTo(-58, -170); g.lineTo(58, -170);
  g.bezierCurveTo(48, -90, 14, -40, 6, -8);
  g.lineTo(-6, -8);
  g.bezierCurveTo(-14, -40, -48, -90, -58, -170);
  g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(-80, 170); g.lineTo(80, 170);
  g.lineTo(60, 120); g.lineTo(-60, 120); g.closePath(); g.fill();
  // 中流
  g.fillRect(-2.5, -10, 5, 135);
  const t = new THREE.CanvasTexture(c); return t;
})();

/* ---------------- HUD 辅助 ---------------- */
const $ = id => document.getElementById(id);

let toastTimer = 0;
function toast(text, dur = 2.8) {
  const el = $('toast'); el.textContent = text; el.style.opacity = 1;
  toastTimer = dur;
}
let subTimer = 0;
function subtitle(text, dur = 5) {
  const el = $('subtitle'); el.innerHTML = text; el.style.opacity = 1;
  subTimer = dur;
}
let hintLocked = '';
function setHint(text) {
  const el = $('hint');
  if (text) { el.textContent = text; el.style.opacity = 1; }
  else el.style.opacity = 0;
}
// 每帧由 main 调用
function uiTimersUpdate(dt) {
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').style.opacity = 0; }
  if (subTimer > 0) { subTimer -= dt; if (subTimer <= 0) $('subtitle').style.opacity = 0; }
}

/* 颜色常量 */
const GRAIN_COLORS = {
  gold:  { hex: 0xe8c168, css: '#e8c168', name: '金 · 欢愉与希望' },
  blue:  { hex: 0x7fb6e8, css: '#7fb6e8', name: '蓝 · 悲伤与离别' },
  gray:  { hex: 0xb6bcc6, css: '#9aa0a8', name: '灰 · 恐惧与绝望' },
  black: { hex: 0x57506b, css: '#57506b', name: '黑 · 罪恶与悔恨' },
};
