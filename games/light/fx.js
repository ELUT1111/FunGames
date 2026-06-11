// 视觉特效：吞噬光爆、光谱切换彩带、护盾、电磁脉冲、太阳耀斑
import * as THREE from 'three';

const bursts = [];   // 粒子爆 { pts, vels, life, mat }
const rings = [];    // 扩散环 { mesh, life, maxR }
let scene = null;

export function initFX(s){ scene = s; }

// 粒子爆发（吞噬 / 燃烧 / 碎石）
export function burst(pos, hex, count = 24, speed = 10, size = 0.45){
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(count * 3);
  const vels = [];
  for (let i = 0; i < count; i++){
    arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z;
    vels.push(new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.4 + Math.random() * 0.8)));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({ color: hex, size, transparent: true, opacity: 1 });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  bursts.push({ pts, vels, life: 1, mat });
}

// 棱镜切换：从玩家位置散开七彩光带（用多个彩色环）
const RAINBOW = [0xff3b4e, 0xff9233, 0xffe93b, 0x3bff8e, 0x35e8ff, 0x3b6cff, 0xb44bff];
export function prismFlash(pos){
  for (let i = 0; i < RAINBOW.length; i++){
    ring(pos, RAINBOW[i], 4 + i * 2.4, 0.7 + i * 0.06);
  }
  burst(pos, 0xffffff, 30, 14, 0.5);
}

export function ring(pos, hex, maxR = 12, lifeSec = 0.8){
  const geo = new THREE.TorusGeometry(1, 0.12, 8, 48);
  const mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.rotation.x = Math.PI / 2;
  scene.add(mesh);
  rings.push({ mesh, life: lifeSec, t: 0, maxR, lifeSec });
}

// 横向大环（EMP / 耀斑用）
export function shockwave(pos, hex, maxR, lifeSec = 1.2){
  ring(pos, hex, maxR, lifeSec);
  const geo = new THREE.SphereGeometry(1, 24, 16);
  const mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  rings.push({ mesh, life: lifeSec, t: 0, maxR: maxR * 0.8, lifeSec, sphere: true });
}

// 冰霜护盾（跟随玩家的半透明冰球）
export function makeShield(parent){
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x9fdcff, transmission: 0.7, roughness: 0.15, thickness: 0.5,
    transparent: true, opacity: 0.4, emissive: 0x3b9cff, emissiveIntensity: 0.4,
  });
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), mat);
  m.visible = false;
  parent.add(m);
  return m;
}

export function updateFX(dt){
  for (let i = bursts.length - 1; i >= 0; i--){
    const b = bursts[i];
    b.life -= dt;
    const arr = b.pts.geometry.attributes.position;
    for (let j = 0; j < b.vels.length; j++){
      arr.setXYZ(j,
        arr.getX(j) + b.vels[j].x * dt,
        arr.getY(j) + b.vels[j].y * dt,
        arr.getZ(j) + b.vels[j].z * dt);
      b.vels[j].multiplyScalar(1 - dt * 2);
    }
    arr.needsUpdate = true;
    b.mat.opacity = Math.max(0, b.life);
    if (b.life <= 0){
      scene.remove(b.pts);
      b.pts.geometry.dispose(); b.mat.dispose();
      bursts.splice(i, 1);
    }
  }
  for (let i = rings.length - 1; i >= 0; i--){
    const r = rings[i];
    r.t += dt;
    const k = r.t / r.lifeSec;
    if (k >= 1){
      scene.remove(r.mesh);
      r.mesh.geometry.dispose(); r.mesh.material.dispose();
      rings.splice(i, 1);
      continue;
    }
    const s = 1 + (r.maxR - 1) * (1 - Math.pow(1 - k, 2));
    r.mesh.scale.setScalar(s);
    r.mesh.material.opacity = (r.sphere ? 0.35 : 0.9) * (1 - k);
  }
}
