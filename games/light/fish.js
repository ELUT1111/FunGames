// 鱼类：玩家棱镜鱼、七色光鱼、深海掠食者
import * as THREE from 'three';
import { SPECTRUM, WORLD, STAGES } from './config.js';

// ============ 玩家棱镜鱼 ============
export function createPlayer(scene){
  const group = new THREE.Group();

  // 主体：八面体水晶棱镜
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.1, roughness: 0.05,
    transmission: 0.92, thickness: 1.6, ior: 1.6,
    transparent: true, opacity: 0.92,
    iridescence: 0.0, iridescenceIOR: 1.6,
    emissive: 0x000000, emissiveIntensity: 1,
  });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), bodyMat);
  body.scale.set(1.5, 0.8, 0.8);
  group.add(body);

  // 尾鳍：两片透明三角
  const finMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 0.85, roughness: 0.1,
    transparent: true, opacity: 0.7, side: THREE.DoubleSide,
  });
  const finGeo = new THREE.ConeGeometry(0.9, 1.8, 3);
  const tail = new THREE.Mesh(finGeo, finMat);
  tail.position.x = -2.4; tail.rotation.z = Math.PI / 2;
  group.add(tail);

  // 体内光核
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), coreMat);
  group.add(core);

  const light = new THREE.PointLight(0xffffff, 0, 30);
  group.add(light);

  scene.add(group);
  return {
    group, body, bodyMat, finMat, tail, core, coreMat, light,
    pos: group.position, vel: new THREE.Vector3(),
    yaw: 0, pitch: 0, speed: 16, scale: 1,
    hp: 100, maxHp: 100, stageIdx: 0,
    stealth: false, shieldT: 0, dashT: 0,
  };
}

// 根据已收集颜色更新棱镜外观
const tmpC = new THREE.Color();
export function updatePlayerLook(p, shards, total){
  const owned = SPECTRUM.filter(s => shards[s.id] > 0);
  // 混合所有已收集颜色（按数量加权）
  if (owned.length === 0){
    p.bodyMat.color.setHex(0xffffff);
    p.bodyMat.emissive.setHex(0x000000);
    p.coreMat.opacity = 0;
    p.light.intensity = 0;
  } else {
    const mix = new THREE.Color(0, 0, 0); let w = 0;
    for (const s of owned){ tmpC.setHex(s.hex); mix.add(tmpC.multiplyScalar(shards[s.id])); w += shards[s.id]; }
    mix.multiplyScalar(1 / w);
    p.bodyMat.color.copy(mix).lerp(new THREE.Color(0xffffff), 0.3);
    p.bodyMat.emissive.copy(mix);
    p.bodyMat.emissiveIntensity = 0.25 + Math.min(0.9, total * 0.03);
    p.coreMat.color.copy(mix);
    p.coreMat.opacity = Math.min(0.9, 0.2 + total * 0.02);
    p.light.color.copy(mix);
    p.light.intensity = Math.min(3, total * 0.12);
  }
  // 多色 → 虹彩
  p.bodyMat.iridescence = Math.min(1, owned.length / 5);
  // 成长阶段
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) if (total >= STAGES[i].at) idx = i;
  if (idx !== p.stageIdx){
    p.stageIdx = idx;
    // 钻石切割面：更高细分的八面体
    if (idx >= 4 && !p.faceted){
      p.faceted = true;
      p.body.geometry.dispose();
      p.body.geometry = new THREE.OctahedronGeometry(1.6, 1);
    }
  }
  p.scale = STAGES[idx].scale;
  return idx;
}

// ============ 七色光鱼（猎物） ============
export function spawnFish(scene, list, forceSmall){
  const s = SPECTRUM[Math.random() * SPECTRUM.length | 0];
  const size = forceSmall ? 0.5 + Math.random() * 0.6 : 0.5 + Math.random() * 2.2;
  const mat = new THREE.MeshStandardMaterial({
    color: s.hex, emissive: s.hex, emissiveIntensity: 0.9,
    transparent: true, opacity: 0.85, roughness: 0.4,
  });
  const geo = new THREE.ConeGeometry(0.45 * size, 1.6 * size, 6);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.z = -Math.PI / 2; // 锥尖朝 +x
  const g = new THREE.Group(); g.add(m);
  const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * (WORLD.radius - 30);
  g.position.set(Math.cos(a) * d, WORLD.floorY + 10 + Math.random() * (WORLD.ceilY - WORLD.floorY - 20), Math.sin(a) * d);
  scene.add(g);
  list.push({
    group: g, mat, colorId: s.id, hex: s.hex, size,
    vel: new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 4),
    wanderT: 0, frozen: 0, stunned: 0, alive: true,
  });
}

// ============ 深海掠食者 ============
export function spawnPredator(scene, list){
  const size = 3.5 + Math.random() * 3;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3c4654, emissive: 0x0a0d12, roughness: 0.7,
    transparent: true, opacity: 0.92,
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.6 * size, 2.4 * size, 7), mat);
  body.rotation.z = -Math.PI / 2;
  g.add(body);
  // 发光眼
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16 * size, 8, 8), eyeMat);
  eye.position.set(0.8 * size, 0.2 * size, 0.3 * size);
  g.add(eye);
  const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * (WORLD.radius - 70);
  g.position.set(Math.cos(a) * d, WORLD.floorY + 12 + Math.random() * 36, Math.sin(a) * d);
  scene.add(g);
  list.push({
    group: g, mat, eyeMat, size,
    vel: new THREE.Vector3().randomDirection().multiplyScalar(6),
    frozen: 0, stunned: 0, burning: 0, hp: 30 + size * 8, alive: true, wanderT: 0,
  });
}

// 通用游动逻辑（边界回弹 + 漫游）
const toCenter = new THREE.Vector3();
export function steerWander(f, dt, speed){
  f.wanderT -= dt;
  if (f.wanderT <= 0){
    f.wanderT = 1.5 + Math.random() * 3;
    f.vel.add(new THREE.Vector3().randomDirection().multiplyScalar(speed * 0.6));
  }
  const p = f.group.position;
  const horiz = Math.hypot(p.x, p.z);
  if (horiz > WORLD.radius * 0.95){
    toCenter.set(-p.x, 0, -p.z).normalize().multiplyScalar(speed * 0.08);
    f.vel.add(toCenter);
  }
  if (p.y < WORLD.floorY + 6) f.vel.y += speed * 0.05;
  if (p.y > WORLD.ceilY - 6) f.vel.y -= speed * 0.05;
  f.vel.clampLength(0, speed);
  p.addScaledVector(f.vel, dt);
  // 朝向速度方向
  if (f.vel.lengthSq() > 0.01){
    const target = Math.atan2(f.vel.z, f.vel.x);
    f.group.rotation.y = -target;
    f.group.rotation.z = Math.asin(THREE.MathUtils.clamp(f.vel.y / (f.vel.length() || 1), -1, 1)) * 0.6;
  }
}
