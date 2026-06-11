// 海洋世界：场景、地形、珊瑚、水母、霓虹之城，以及「灰度→彩色」复苏系统
import * as THREE from 'three';
import { WORLD, SPECTRUM } from './config.js';

const tintables = [];   // { mat, color:THREE.Color, emissive?:THREE.Color, eIntensity }
const jellies = [];     // 水母 { group, mat, baseY, phase }
const neonLights = [];  // 城市霓虹 { mat, light, threshold }
export const rocks = []; // 可撞碎的岩石 { mesh, r, alive }

function tintable(mat, hex, emissiveHex = 0x000000, eIntensity = 1){
  mat.color.setHex(hex);
  tintables.push({
    mat,
    color: new THREE.Color(hex),
    emissive: mat.emissive ? new THREE.Color(emissiveHex) : null,
    eIntensity,
  });
  return mat;
}

const GRAY = new THREE.Color();
function toGray(c, out){
  const g = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
  return out.setRGB(g, g, g);
}

export function createWorld(scene){
  // ---- 雾与背景（随复苏度变化） ----
  scene.fog = new THREE.FogExp2(0x14161a, 0.0085);
  scene.background = new THREE.Color(0x0b0c0f);

  // ---- 灯光 ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(40, 120, 30);
  scene.add(sun);

  // ---- 海底地形 ----
  const groundGeo = new THREE.PlaneGeometry(WORLD.radius * 2.6, WORLD.radius * 2.6, 80, 80);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++){
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, Math.sin(x * 0.045) * Math.cos(y * 0.05) * 6 + Math.sin(x * 0.013 + y * 0.017) * 9);
  }
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05 });
  tintable(groundMat, 0x1d3a55);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = WORLD.floorY;
  scene.add(ground);

  // ---- 岩石（红色冲刺可撞碎） ----
  for (let i = 0; i < 26; i++){
    const r = 3 + Math.random() * 7;
    const geo = new THREE.IcosahedronGeometry(r, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    tintable(mat, 0x4a5a6a);
    const m = new THREE.Mesh(geo, mat);
    const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * (WORLD.radius - 40);
    m.position.set(Math.cos(a) * d, WORLD.floorY + r * 0.6 + Math.random() * 14, Math.sin(a) * d);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(m);
    rocks.push({ mesh: m, r, alive: true });
  }

  // ---- 珊瑚簇（发光体，复苏后霓虹绽放） ----
  const coralHexes = SPECTRUM.map(s => s.hex);
  for (let i = 0; i < 40; i++){
    const g = new THREE.Group();
    const hex = coralHexes[i % coralHexes.length];
    const n = 3 + (Math.random() * 4 | 0);
    for (let j = 0; j < n; j++){
      const h = 3 + Math.random() * 7;
      const geo = new THREE.ConeGeometry(0.5 + Math.random() * 0.9, h, 5);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x000000 });
      tintable(mat, hex, hex, 1.4);
      const c = new THREE.Mesh(geo, mat);
      c.position.set((Math.random() - 0.5) * 5, h / 2, (Math.random() - 0.5) * 5);
      c.rotation.z = (Math.random() - 0.5) * 0.5;
      g.add(c);
    }
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * (WORLD.radius - 30);
    g.position.set(Math.cos(a) * d, WORLD.floorY + 2, Math.sin(a) * d);
    scene.add(g);
  }

  // ---- 水母（幽幽荧光，缓慢升降） ----
  for (let i = 0; i < 18; i++){
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      transparent: true, opacity: 0.45, roughness: 0.3, emissive: 0x000000,
    });
    tintable(mat, 0x66e0ff, 0x66e0ff, 2.0);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    group.add(bell);
    for (let t = 0; t < 5; t++){
      const tn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 4.5, 4), mat);
      tn.position.set(Math.cos(t * 1.26) * 1.2, -2.4, Math.sin(t * 1.26) * 1.2);
      group.add(tn);
    }
    const a = Math.random() * Math.PI * 2, d = Math.random() * WORLD.radius * 0.9;
    const baseY = WORLD.floorY + 18 + Math.random() * 50;
    group.position.set(Math.cos(a) * d, baseY, Math.sin(a) * d);
    scene.add(group);
    jellies.push({ group, baseY, phase: Math.random() * Math.PI * 2 });
  }

  // ---- 海底霓虹之城（远处的塔楼，灯随复苏度逐一点亮） ----
  const cityHexes = [0x35e8ff, 0xff4ecb, 0xffe93b, 0x3bff8e, 0xb44bff];
  for (let i = 0; i < 24; i++){
    const w = 4 + Math.random() * 6, h = 16 + Math.random() * 44;
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    tintable(bodyMat, 0x2a3848);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), bodyMat);
    const a = (i / 24) * Math.PI * 2 + Math.random() * 0.2;
    const d = WORLD.radius * (0.82 + Math.random() * 0.25);
    tower.position.set(Math.cos(a) * d, WORLD.floorY + h / 2, Math.sin(a) * d);
    scene.add(tower);
    // 霓虹灯条
    const hex = cityHexes[i % cityHexes.length];
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x111418 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, h * 0.7, 0.3), neonMat);
    strip.position.copy(tower.position);
    strip.position.z += (tower.position.z > 0 ? -1 : 1) * (w / 2 + 0.2);
    scene.add(strip);
    neonLights.push({ mat: neonMat, hex, threshold: 0.25 + (i / 24) * 0.7, lit: false });
  }

  // ---- 漂浮微粒（海雪） ----
  const pGeo = new THREE.BufferGeometry();
  const pCount = 900, pArr = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++){
    pArr[i * 3]     = (Math.random() - 0.5) * WORLD.radius * 2;
    pArr[i * 3 + 1] = WORLD.floorY + Math.random() * (WORLD.ceilY - WORLD.floorY);
    pArr[i * 3 + 2] = (Math.random() - 0.5) * WORLD.radius * 2;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.35, transparent: true, opacity: 0.5 });
  tintable(pMat, 0x9fd8ff);
  scene.add(new THREE.Points(pGeo, pMat));

  return { hemi, sun };
}

// 复苏度 0..1 → 全场景着色
const fogGray = new THREE.Color(0x14161a), fogBlue = new THREE.Color(0x06283f);
const bgGray = new THREE.Color(0x0b0c0f), bgBlue = new THREE.Color(0x04182b);
export function applyRevive(scene, t, toast){
  scene.fog.color.copy(fogGray).lerp(fogBlue, t);
  scene.background.copy(bgGray).lerp(bgBlue, t);
  for (const it of tintables){
    toGray(it.color, GRAY);
    it.mat.color.copy(GRAY).lerp(it.color, t);
    if (it.emissive){
      it.mat.emissive.copy(it.emissive).multiplyScalar(t * t * it.eIntensity * 0.8);
    }
  }
  for (const n of neonLights){
    if (!n.lit && t >= n.threshold){
      n.lit = true;
      n.mat.color.setHex(n.hex);
      if (toast && Math.random() < 0.3) toast('海底之城 · 霓虹点亮', '#' + n.hex.toString(16).padStart(6, '0'));
    }
  }
}

export function updateWorld(time){
  for (const j of jellies){
    j.group.position.y = j.baseY + Math.sin(time * 0.6 + j.phase) * 3;
    const s = 1 + Math.sin(time * 2.2 + j.phase) * 0.08;
    j.group.scale.set(s, 1 / s, s);
  }
}
