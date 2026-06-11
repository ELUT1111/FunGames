/* =========================================================
 * world.js — 沙海地形、天空、废墟、河流、树木、幽灵NPC、解谜物
 * ========================================================= */
'use strict';

/* ================= 地形 ================= */

// 整平点：兴趣点周围让地面平缓
G.flatSpots = [
  { x: 0,    z: 0,    h: 2.0,  r: 16 },   // 出生地
  { x: -60,  z: -40,  h: 2.5,  r: 22 },   // 废墟群·面包坊街
  { x: 40,   z: -80,  h: 2.5,  r: 20 },   // 拜占庭穹顶
  { x: -90,  z: 60,   h: 3.0,  r: 18 },   // 灯塔
  { x: 44,   z: 0,    h: 3.0,  r: 11 },   // 桥·西岸
  { x: 76,   z: 0,    h: 3.0,  r: 11 },   // 桥·东岸
  { x: 108,  z: 0,    h: 3.0,  r: 24 },   // 学堂广场
  { x: 0,    z: 95,   h: 2.5,  r: 20 },   // 蒸汽机械遗迹
  { x: -120, z: -100, h: -1.0, r: 18 },   // 沉沙之窖
];

function terrainHeight(x, z) {
  // 大尺度沙丘 + 细波纹
  let h = fbm(x * 0.011, z * 0.011, 4) * 9;
  h += Math.abs(fbm(x * 0.005 + 7.3, z * 0.005 - 2.1, 3)) * 7 - 2.5;
  h += fbm(x * 0.06 + 31, z * 0.06 + 17, 2) * 0.7;
  // 干涸河道（沿 z 轴方向，中心 x=60）
  const d = Math.abs(x - 60);
  h -= smoothstep(0, 1, clamp((14 - d) / 10, 0, 1)) * 9;
  // 兴趣点整平
  for (let i = 0; i < G.flatSpots.length; i++) {
    const s = G.flatSpots[i];
    const dd = dist2d(x, z, s.x, s.z);
    const f = 1 - smoothstep(s.r * 0.45, s.r, dd);
    h = lerp(h, s.h, f);
  }
  return h;
}
G.terrainHeight = terrainHeight;

// 地面采样：地形 + 可站立平台（桥面、塔阶……）
G.groundHeight = function (x, z, py) {
  let g = terrainHeight(x, z);
  for (let i = 0; i < G.platforms.length; i++) {
    const p = G.platforms[i];
    if (p.active && !p.active()) continue;
    if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
      if (py === undefined || py > p.y - 0.6) g = Math.max(g, p.y);
    }
  }
  return g;
};

function buildTerrain(scene) {
  const SIZE = 440, SEG = 220;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(0xd0a45c); // 向阳沙
  const cB = new THREE.Color(0xa67c44); // 背阴沙
  const cC = new THREE.Color(0x755834); // 谷底
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    // 简易坡向着色
    const hx = terrainHeight(x + 1.5, z) - h;
    const lit = clamp(0.5 - hx * 0.9, 0, 1);
    tmp.copy(cC).lerp(cB, clamp((h + 6) / 8, 0, 1)).lerp(cA, lit * clamp((h + 4) / 10, 0, 1));
    const n = vnoise(x * 0.2, z * 0.2) * 0.08;
    colors[i * 3] = tmp.r + n; colors[i * 3 + 1] = tmp.g + n; colors[i * 3 + 2] = tmp.b + n * 0.7;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  TEX.sandBump.repeat.set(60, 60);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
    bumpMap: TEX.sandBump, bumpScale: 0.35,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/* ================= 天空 ================= */
function buildSky(scene) {
  const uniforms = {
    uRestore: { value: 0 },
    uFlip: { value: 0 },
    uSun: { value: new THREE.Vector3(0.35, 0.42, -0.6).normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main(){ vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uRestore, uFlip;
      uniform vec3 uSun;
      void main(){
        float h = clamp(vDir.y*0.5+0.5, 0.0, 1.0);
        // 荒芜：尘黄昏 → 复苏：澄澈暖晴
        vec3 dustLow  = vec3(0.88,0.68,0.42), dustHigh = vec3(0.66,0.56,0.46);
        vec3 liveLow  = vec3(1.00,0.88,0.66), liveHigh = vec3(0.42,0.64,0.88);
        vec3 a = mix(dustLow, dustHigh, pow(h,0.8));
        vec3 b = mix(liveLow, liveHigh, pow(h,0.9));
        vec3 col = mix(a, b, uRestore*0.85);
        // 太阳
        float s = max(dot(vDir, uSun), 0.0);
        col += vec3(1.0,0.85,0.6) * (pow(s, 220.0)*1.6 + pow(s, 9.0)*0.28);
        // 翻转时：紫金逆光
        vec3 flipCol = mix(vec3(0.32,0.18,0.45), vec3(1.0,0.85,0.5), pow(h,1.4));
        col = mix(col, flipCol + pow(s,6.0)*0.4, uFlip*0.65);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 18), mat);
  scene.add(sky);
  G.skyUniforms = uniforms;

  // 翻转时天空中的巨大沙漏投影
  const sm = new THREE.SpriteMaterial({
    map: TEX.hourglassSky, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const sp = new THREE.Sprite(sm);
  sp.scale.set(260, 260, 1);
  sp.position.set(60, 170, -160);
  scene.add(sp);
  G.skyHourglass = sp;
  return sky;
}

/* ================= 可复苏材质 ================= */
function restorableMat(opts) {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.sand, roughness: opts.sandRough ?? 1, metalness: opts.metal ?? 0,
    emissive: opts.em ?? 0x000000, emissiveIntensity: 0,
  });
  G.restorables.push({
    mat,
    sand: new THREE.Color(opts.sand), live: new THREE.Color(opts.live),
    sandRough: opts.sandRough ?? 1, liveRough: opts.liveRough ?? 0.8,
    emMax: opts.emMax ?? 0,
  });
  return mat;
}
G.updateRestorables = function () {
  const r = G.restoration;
  for (let i = 0; i < G.restorables.length; i++) {
    const it = G.restorables[i];
    it.mat.color.copy(it.sand).lerp(it.live, r);
    it.mat.roughness = lerp(it.sandRough, it.liveRough, r);
    if (it.emMax > 0) it.mat.emissiveIntensity = it.emMax * smoothstep(0.35, 0.9, r);
  }
};

/* ================= 废墟建筑 ================= */
const MATS = {};
function initMats() {
  MATS.stone = restorableMat({ sand: 0xd6b075, live: 0x97999b, liveRough: 0.85 });
  MATS.brick = restorableMat({ sand: 0xd2a96e, live: 0x9a5440, liveRough: 0.9 });
  MATS.brass = restorableMat({ sand: 0xcfa468, live: 0xc08a35, liveRough: 0.35, metal: 0.85, em: 0xff9a30, emMax: 0.25 });
  MATS.wood  = restorableMat({ sand: 0xcaa269, live: 0x6b4a2c, liveRough: 0.95 });
  MATS.dome  = restorableMat({ sand: 0xd8b277, live: 0x2e6f80, liveRough: 0.4, metal: 0.4 });
  MATS.glassWin = restorableMat({ sand: 0xd0aa70, live: 0xffe9b0, em: 0xffd070, emMax: 1.4, liveRough: 0.2 });
  MATS.obsidian = new THREE.MeshStandardMaterial({ color: 0x241f2e, roughness: 0.35, metalness: 0.3 });
}

function addMesh(scene, geo, mat, x, y, z, ry = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  scene.add(m);
  return m;
}

function makeColumn(scene, x, z, h = 6, broken = false) {
  const gy = terrainHeight(x, z);
  const hh = broken ? h * (0.35 + hash2(x, z) * 0.4) : h;
  addMesh(scene, new THREE.CylinderGeometry(0.55, 0.7, hh, 10), MATS.stone, x, gy + hh / 2, z);
  if (!broken) addMesh(scene, new THREE.BoxGeometry(1.7, 0.5, 1.7), MATS.stone, x, gy + hh + 0.25, z);
}

function makeArch(scene, x, z, ry = 0, w = 5, h = 6) {
  const gy = terrainHeight(x, z);
  const grp = new THREE.Group();
  grp.position.set(x, gy, z); grp.rotation.y = ry;
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, h, 10), MATS.stone);
  c1.position.set(-w / 2, h / 2, 0);
  const c2 = c1.clone(); c2.position.x = w / 2;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(w / 2, 0.5, 8, 20, Math.PI), MATS.brick);
  arc.position.y = h;
  grp.add(c1, c2, arc);
  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(grp);
  return grp;
}

// 拜占庭穹顶圣堂
function makeDome(scene, x, z) {
  const gy = terrainHeight(x, z);
  const R = 9;
  // 圆形墙体（四个拱门开口 → 用八段弧墙）
  for (let i = 0; i < 8; i++) {
    const a0 = i * TAU / 8 + 0.18, a1 = (i + 1) * TAU / 8 - 0.18;
    const mid = (a0 + a1) / 2, len = R * (a1 - a0) * 0.92;
    const wall = addMesh(scene, new THREE.BoxGeometry(len, 7, 1.1), MATS.brick,
      x + Math.cos(mid) * R, gy + 3.5, z + Math.sin(mid) * R, -mid + Math.PI / 2);
    // 高窗
    addMesh(scene, new THREE.BoxGeometry(len * 0.4, 1.2, 1.2), MATS.glassWin,
      x + Math.cos(mid) * R, gy + 5.6, z + Math.sin(mid) * R, -mid + Math.PI / 2, false);
    void wall;
  }
  // 鼓座 + 穹顶
  addMesh(scene, new THREE.CylinderGeometry(R + 0.6, R + 0.6, 1.2, 24), MATS.stone, x, gy + 7.6, z);
  const dome = addMesh(scene, new THREE.SphereGeometry(R, 24, 12, 0, TAU, 0, Math.PI / 2), MATS.dome, x, gy + 8.2, z);
  dome.castShadow = true;
  // 顶部尖塔
  addMesh(scene, new THREE.CylinderGeometry(0.12, 0.3, 3, 6), MATS.brass, x, gy + 8.2 + R + 1.4, z);
  return { x, z, gy };
}

// 灯塔（可攀爬：螺旋石阶平台）
function makeTower(scene, x, z) {
  const gy = terrainHeight(x, z);
  const H = 13;
  addMesh(scene, new THREE.CylinderGeometry(3.6, 4.6, H, 14), MATS.brick, x, gy + H / 2, z);
  // 顶部灯室
  addMesh(scene, new THREE.CylinderGeometry(4.4, 4.4, 0.8, 14), MATS.stone, x, gy + H + 0.4, z);
  const lamp = addMesh(scene, new THREE.SphereGeometry(1.2, 12, 8), MATS.glassWin, x, gy + H + 1.9, z, 0, false);
  void lamp;
  addMesh(scene, new THREE.ConeGeometry(1.8, 1.6, 10), MATS.dome, x, gy + H + 3.4, z);
  // 螺旋石阶
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const a = i * 0.78;
    const r = 5.6;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const py = gy + 1.4 + i * 1.25;
    const st = addMesh(scene, new THREE.BoxGeometry(3.4, 0.45, 2.2), MATS.stone, px, py, pz, -a);
    void st;
    G.platforms.push({
      minX: px - 1.9, maxX: px + 1.9, minZ: pz - 1.9, maxZ: pz + 1.9, y: py + 0.22,
    });
  }
  // 塔顶平台
  G.platforms.push({ minX: x - 4.2, maxX: x + 4.2, minZ: z - 4.2, maxZ: z + 4.2, y: gy + H + 0.8 });
  return { x, z, topY: gy + H + 0.8 };
}

// 蒸汽朋克机械遗迹：黄铜巨齿轮
function makeGear(scene, x, y, z, R, rx, rz) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.x = rx; grp.rotation.z = rz;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.14, 8, 28), MATS.brass);
  grp.add(ring);
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(R * 2, R * 0.1, R * 0.1), MATS.brass);
    sp.rotation.z = i * Math.PI / 8;
    grp.add(sp);
  }
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(R * 0.18, R * 0.22, R * 0.16), MATS.brass);
    tooth.position.set(Math.cos(a) * (R + R * 0.12), Math.sin(a) * (R + R * 0.12), 0);
    tooth.rotation.z = a;
    grp.add(tooth);
  }
  grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(grp);
  return grp;
}
function makeMachine(scene, x, z) {
  const gy = terrainHeight(x, z);
  const g1 = makeGear(scene, x - 3, gy + 5, z, 4.2, 0, 0);
  const g2 = makeGear(scene, x + 4.4, gy + 3.2, z + 0.4, 2.6, 0, 0);
  const g3 = makeGear(scene, x + 1, gy + 9, z - 1.2, 1.8, 0.4, 0);
  // 支架与管道
  addMesh(scene, new THREE.BoxGeometry(1, 10, 1), MATS.brick, x - 3, gy + 5, z - 1.4);
  addMesh(scene, new THREE.BoxGeometry(1, 7, 1), MATS.brick, x + 4.4, gy + 3.5, z + 1.8);
  addMesh(scene, new THREE.CylinderGeometry(0.4, 0.4, 12, 8), MATS.brass, x - 8, gy + 6, z + 3, 0);
  const pipe = addMesh(scene, new THREE.CylinderGeometry(0.4, 0.4, 9, 8), MATS.brass, x + 2, gy + 1.2, z + 4);
  pipe.rotation.z = Math.PI / 2;
  G.updaters.push(dt => {
    const speed = G.restoration * 0.8 * (1 - 2 * G.flip); // 翻转时倒转
    g1.rotation.z += speed * dt;
    g2.rotation.z -= speed * dt * 1.6;
    g3.rotation.y += speed * dt * 1.1;
  });
}

// 沉沙之窖：黑曜石碑环
function makeCrypt(scene, x, z) {
  const gy = terrainHeight(x, z);
  for (let i = 0; i < 7; i++) {
    const a = i * TAU / 7;
    const h = 5 + hash2(i, 3) * 3;
    const ob = addMesh(scene, new THREE.BoxGeometry(1.4, h, 1.4), MATS.obsidian,
      x + Math.cos(a) * 9, gy + h / 2 - 0.5, z + Math.sin(a) * 9, a);
    ob.rotation.z = (hash2(i, 7) - 0.5) * 0.18;
  }
  // 中央祭石
  addMesh(scene, new THREE.CylinderGeometry(2.2, 2.6, 1, 8), MATS.obsidian, x, gy + 0.5, z);
}

// 远景：被风蚀的巨大文明轮廓（雾中剪影）
function makeSilhouettes(scene) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xc6a36c, fog: true });
  const rnd = mulberry32(99);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * TAU;
    const r = 260 + rnd() * 120;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 18 + rnd() * 50, h = 30 + rnd() * 90;
    const geo = rnd() > 0.5
      ? new THREE.BoxGeometry(w, h, w * 0.8)
      : new THREE.CylinderGeometry(w * 0.3, w * 0.55, h, 7);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, h * 0.22, z);
    m.rotation.y = rnd() * TAU;
    scene.add(m);
    if (rnd() > 0.6) { // 倾斜的尖塔
      const sp = new THREE.Mesh(new THREE.ConeGeometry(w * 0.25, h * 0.8, 6), mat);
      sp.position.set(x + w * 0.7, h * 0.5, z);
      sp.rotation.z = (rnd() - 0.5) * 0.4;
      scene.add(sp);
    }
  }
}

// 散落瓦砾（实例化）
function makeRubble(scene) {
  const geo = new THREE.BoxGeometry(1, 0.7, 1);
  const inst = new THREE.InstancedMesh(geo, MATS.stone, 120);
  const dummy = new THREE.Object3D();
  const rnd = mulberry32(7);
  const clusters = [[-60, -40], [40, -80], [108, 0], [0, 95], [-90, 60], [20, 30], [-30, -90]];
  for (let i = 0; i < 120; i++) {
    const c = clusters[i % clusters.length];
    const x = c[0] + (rnd() - 0.5) * 34;
    const z = c[1] + (rnd() - 0.5) * 34;
    const s = 0.4 + rnd() * 1.6;
    dummy.position.set(x, terrainHeight(x, z) + s * 0.2, z);
    dummy.rotation.set(rnd() * 0.6, rnd() * TAU, rnd() * 0.6);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);
}

/* ================= 树木（枯木 → 复苏） ================= */
function makeTree(scene, x, z) {
  const gy = terrainHeight(x, z);
  const grp = new THREE.Group();
  grp.position.set(x, gy, z);
  const trunkMat = restorableMat({ sand: 0xc4a06a, live: 0x6e4f30, liveRough: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, 4.4, 7), trunkMat);
  trunk.position.y = 2.2; trunk.castShadow = true;
  grp.add(trunk);
  const rnd = mulberry32((x * 13 + z * 7) | 0);
  const tips = [];
  for (let i = 0; i < 5; i++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 2.2, 5), trunkMat);
    const a = rnd() * TAU;
    br.position.set(Math.cos(a) * 0.5, 3.6 + rnd() * 1.2, Math.sin(a) * 0.5);
    br.rotation.set((rnd() - 0.5) * 1.5, a, (rnd() - 0.5) * 1.5);
    grp.add(br);
    tips.push(br.position.clone().add(new THREE.Vector3(Math.cos(a), 1.2, Math.sin(a))));
  }
  // 叶团：复苏后生长的发光精灵
  const leaves = [];
  const lm = new THREE.SpriteMaterial({
    map: TEX.glow, color: 0x7fb35a, transparent: true, opacity: 0.85, depthWrite: false,
  });
  tips.push(new THREE.Vector3(0, 5.2, 0));
  for (const t of tips) {
    const s = new THREE.Sprite(lm.clone());
    s.position.copy(t);
    s.scale.setScalar(0.001);
    s.material.color.setHSL(0.26 + rnd() * 0.06, 0.5, 0.42 + rnd() * 0.1);
    grp.add(s);
    leaves.push(s);
  }
  scene.add(grp);
  G.updaters.push(() => {
    const grow = smoothstep(0.25, 0.8, G.restoration);
    for (let i = 0; i < leaves.length; i++) {
      leaves[i].scale.setScalar(0.001 + grow * (1.8 + (i % 3) * 0.7));
    }
  });
}

/* ================= 河流 ================= */
function buildRiver(scene) {
  const geo = new THREE.PlaneGeometry(26, 320, 1, 40);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 }, uAlpha: { value: 0 }, uFlow: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms,
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main(){
        vUv = uv;
        vec3 p = position;
        p.y += sin(uv.y*60.0 + uTime*2.0)*0.12 + sin(uv.x*20.0+uTime*3.1)*0.06;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime, uAlpha, uFlow;
      void main(){
        float f = sin(vUv.y*120.0 - uTime*uFlow*3.0 + sin(vUv.x*30.0)*2.0)*0.5+0.5;
        float f2 = sin(vUv.y*47.0 - uTime*uFlow*1.7 + 2.0)*0.5+0.5;
        vec3 col = mix(vec3(0.16,0.38,0.5), vec3(0.55,0.8,0.9), f*0.35+f2*0.3);
        col += vec3(1.0,0.95,0.8)*pow(f*f2, 6.0)*0.8;
        float edge = smoothstep(0.0,0.12,vUv.x)*smoothstep(1.0,0.88,vUv.x);
        gl_FragColor = vec4(col, uAlpha*0.82*edge);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(60, -3.6, 0);
  scene.add(mesh);
  G.updaters.push(dt => {
    uniforms.uTime.value += dt * (1 - 2 * G.flip); // 翻转时逆流
    uniforms.uAlpha.value = smoothstep(0.45, 0.75, G.restoration);
  });
}

/* ================= 幽灵 NPC ================= */
function ghostMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0xaecbe8, transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
}
function makeGhostFigure() {
  const mat = ghostMaterial();
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 1.25, 8), mat);
  body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat);
  head.position.y = 1.95;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 6), mat);
  armL.position.set(-0.42, 1.35, 0); armL.rotation.z = 0.5;
  const armR = armL.clone(); armR.position.x = 0.42; armR.rotation.z = -0.5;
  grp.add(body, head, armL, armR);
  grp.userData.mat = mat;
  grp.userData.armR = armR;
  return grp;
}

function makeNPC(scene, opts) {
  const fig = makeGhostFigure();
  const gy = terrainHeight(opts.x, opts.z);
  fig.position.set(opts.x, gy, opts.z);
  scene.add(fig);
  const npc = {
    fig, ...opts, baseY: gy, phase: Math.random() * TAU,
    dlgIndex: 0,
  };
  G.npcs.push(npc);
  return npc;
}

function buildNPCs(scene) {
  makeNPC(scene, {
    x: -56, z: -36, name: '面包师的虚影', motion: 'knead',
    linesEarly: ['（虚影模糊不清，只有断续的呢喃……）', '「……炉火……麦香……再等等……」'],
    linesLate: [
      '「客人，尝尝吧——这是今天的第一炉。」',
      '「沙暴来的那天，我还在揉面。我想，等烤完这一炉再走。」',
      '「现在你把记忆带回来了。麦香又回来了。谢谢你，沙漏里的孩子。」',
    ],
  });
  makeNPC(scene, {
    x: 104, z: 6, name: '老教师的虚影', motion: 'write',
    linesEarly: ['（虚影重复着在空中书写的动作……）', '「……下课铃……怎么还不响……」'],
    linesLate: [
      '「孩子们都跑光了，可我总得把这最后一课讲完。」',
      '「我教了一辈子历史。最后才明白，历史不是写在书上，是写在沙里的。」',
      '「风一吹就散。所以你做的事，比我一辈子做的都重要。」',
    ],
  });
  makeNPC(scene, {
    x: -86, z: 54, name: '守塔人的虚影', motion: 'gaze',
    linesEarly: ['（虚影望着塔顶，一动不动……）', '「……灯……要灭了……」'],
    linesLate: [
      '「只要塔上还有光，迷路的人就找得到家。」',
      '「沙海淹没城市那夜，我把最后一桶灯油全倒了进去。」',
      '「塔顶有我留下的东西。如果你能上去——替我再看一眼这片土地。」',
    ],
  });
  // NPC 动画与显隐
  G.updaters.push(dt => {
    const r = G.restoration;
    const op = 0.06 + r * 0.55;
    const ts = 1 - 2 * G.flip;
    for (const n of G.npcs) {
      n.phase += dt * ts;
      const f = n.fig;
      f.traverse(o => { if (o.material) o.material.opacity = op; });
      // 复苏后变得温暖真实
      f.traverse(o => {
        if (o.material) {
          o.material.color.setHSL(lerp(0.58, 0.09, smoothstep(0.6, 0.95, r)), lerp(0.45, 0.35, r), 0.72);
          if (r > 0.75) o.material.blending = THREE.NormalBlending;
        }
      });
      f.position.y = n.baseY + Math.sin(n.phase * 1.4) * 0.06;
      if (n.motion === 'knead') f.userData.armR.rotation.x = Math.sin(n.phase * 4) * 0.5;
      if (n.motion === 'write') f.userData.armR.rotation.x = -0.9 + Math.sin(n.phase * 3) * 0.2;
      if (n.motion === 'gaze') f.rotation.y = Math.sin(n.phase * 0.3) * 0.3;
    }
  });
}

/* ================= 解谜物：断桥 与 碎瓶 ================= */
G.puzzles = [];

function buildBridge(scene) {
  const pieces = [];
  const rnd = mulberry32(42);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = lerp(46.5, 73.5, t);
    const arcY = 3.2 + Math.sin(t * Math.PI) * 0.35;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.4, 4.6), MATS.wood);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const to = { pos: new THREE.Vector3(x, arcY, 0), rot: new THREE.Euler(0, 0, Math.cos(t * Math.PI) * 0.12) };
    // 散落在河道底部
    const from = {
      pos: new THREE.Vector3(x + (rnd() - 0.5) * 10, terrainHeight(x, (rnd() - 0.5) * 18) + 0.3 + rnd() * 0.5, (rnd() - 0.5) * 16),
      rot: new THREE.Euler(rnd() * 2 - 1, rnd() * TAU, rnd() * 2 - 1),
    };
    mesh.position.copy(from.pos); mesh.rotation.copy(from.rot);
    scene.add(mesh);
    pieces.push({ mesh, from, to });
  }
  // 两侧残存桥墩
  addMesh(scene, new THREE.BoxGeometry(3.4, 4, 5.4), MATS.brick, 45, terrainHeight(45, 0) - 0.6, 0);
  addMesh(scene, new THREE.BoxGeometry(3.4, 4, 5.4), MATS.brick, 75, terrainHeight(75, 0) - 0.6, 0);

  const puzzle = {
    id: 'bridge', center: new THREE.Vector3(60, 0, 0), radius: 34,
    t: 0, dur: 3.2, pieces, done: false,
    hint: '靠近断桥，按 F 翻转沙漏——让时间倒流，桥会记起自己的形状',
    onComplete() {
      toast('桥，记起了自己的形状');
      G.audio && G.audio.restoreChime();
    },
  };
  G.puzzles.push(puzzle);
  G.platforms.push({
    minX: 45, maxX: 75, minZ: -2.5, maxZ: 2.5, y: 3.5,
    active: () => puzzle.t >= 1,
  });
}

function buildVase(scene) {
  // 穹顶圣堂中央的碎裂花瓶
  const cx = 40, cz = -80;
  const gy = terrainHeight(cx, cz);
  const mat = restorableMat({ sand: 0xd8b88a, live: 0xc7762e, liveRough: 0.45, em: 0xff8830, emMax: 0.15 });
  const pieces = [];
  const rnd = mulberry32(2024);
  const nSeg = 14;
  for (let i = 0; i < nSeg; i++) {
    const layer = Math.floor(i / 5);
    const a = (i % 5) / 5 * TAU + layer * 0.6;
    const yy = 0.28 + layer * 0.5;
    const rr = 0.55 + Math.sin((yy / 1.6) * Math.PI) * 0.33;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.16), mat);
    mesh.castShadow = true;
    const to = {
      pos: new THREE.Vector3(cx + Math.cos(a) * rr, gy + yy, cz + Math.sin(a) * rr),
      rot: new THREE.Euler(0, -a + Math.PI / 2, 0),
    };
    const from = {
      pos: new THREE.Vector3(cx + (rnd() - 0.5) * 7, gy + 0.1 + rnd() * 0.15, cz + (rnd() - 0.5) * 7),
      rot: new THREE.Euler(rnd() * 3, rnd() * TAU, rnd() * 3),
    };
    mesh.position.copy(from.pos); mesh.rotation.copy(from.rot);
    scene.add(mesh);
    pieces.push({ mesh, from, to });
  }
  const puzzle = {
    id: 'vase', center: new THREE.Vector3(cx, gy, cz), radius: 14,
    t: 0, dur: 2.4, pieces, done: false,
    hint: '圣堂中散落着陶瓷碎片……按 F 翻转沙漏，让破碎之物重圆',
    onComplete() {
      toast('花瓶在时光倒流中重圆');
      G.audio && G.audio.restoreChime();
      if (G.onVaseComplete) G.onVaseComplete(new THREE.Vector3(cx, gy + 2.2, cz));
    },
  };
  G.puzzles.push(puzzle);
}

// 由 main 每帧调用：翻转时靠近的谜题缓慢重组
G.updatePuzzles = function (dt, playerPos) {
  for (const p of G.puzzles) {
    if (p.done) continue;
    const near = playerPos.distanceTo(p.center) < p.radius;
    if (G.flipActive && near) {
      p.t = Math.min(1, p.t + dt / p.dur);
      if (G.fx) G.fx.puzzleSparkle(p);
    }
    const e = p.t * p.t * (3 - 2 * p.t); // easeInOut
    for (const pc of p.pieces) {
      pc.mesh.position.lerpVectors(pc.from.pos, pc.to.pos, e);
      pc.mesh.rotation.x = lerp(pc.from.rot.x, pc.to.rot.x, e);
      pc.mesh.rotation.y = lerp(pc.from.rot.y, pc.to.rot.y, e);
      pc.mesh.rotation.z = lerp(pc.from.rot.z, pc.to.rot.z, e);
    }
    if (p.t >= 1) { p.done = true; p.onComplete(); }
  }
};

/* ================= 中央圣坛（终局） ================= */
function buildAltar(scene) {
  const grp = new THREE.Group();
  grp.position.set(0, -14, 0); // 初始沉在沙下
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 6.2, 2.2, 10), MATS.stone);
  base.position.y = 1.1; base.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.3, 8, 24), MATS.brass);
  ring.rotation.x = Math.PI / 2; ring.position.y = 2.5;
  // 圣坛上的巨型沙漏
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff6dd, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, clearcoat: 1,
  });
  const bulbT = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), glassMat);
  bulbT.position.y = 6.4;
  const bulbB = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), glassMat);
  bulbB.position.y = 3.9;
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.2, 200, 12, 1, true), beamMat);
  beam.position.y = 100;
  grp.add(base, ring, bulbT, bulbB, beam);
  scene.add(grp);
  G.altar = { grp, beamMat, risen: false, riseT: 0, baseY: terrainHeight(0, 0) };
  G.updaters.push(dt => {
    const A = G.altar;
    if (!A.risen) return;
    A.riseT = Math.min(1, A.riseT + dt * 0.25);
    const e = A.riseT * A.riseT * (3 - 2 * A.riseT);
    A.grp.position.y = lerp(-14, A.baseY - 0.4, e);
    A.beamMat.opacity = e * 0.35;
    A.grp.rotation.y += dt * 0.2;
  });
}

/* ================= 世界总装 ================= */
G.buildWorld = function (scene) {
  initMats();
  buildTerrain(scene);
  buildSky(scene);
  makeSilhouettes(scene);
  buildRiver(scene);
  makeRubble(scene);

  // 废墟群（面包坊街）
  makeArch(scene, -66, -44, 0.4);
  makeArch(scene, -54, -32, -0.9, 4, 5);
  makeColumn(scene, -68, -34, 6, true);
  makeColumn(scene, -50, -46, 6, false);
  makeColumn(scene, -58, -50, 5, true);
  // 砖砌烤炉残骸
  addMesh(scene, new THREE.SphereGeometry(2, 10, 8, 0, TAU, 0, Math.PI / 2), MATS.brick, -60, terrainHeight(-60, -40), -40);

  // 拜占庭穹顶
  makeDome(scene, 40, -80);

  // 灯塔
  G.tower = makeTower(scene, -90, 60);

  // 学堂广场
  makeArch(scene, 100, -8, 1.2, 6, 7);
  makeColumn(scene, 116, 8, 7);
  makeColumn(scene, 112, -10, 7, true);
  makeColumn(scene, 98, 10, 6, true);
  addMesh(scene, new THREE.BoxGeometry(8, 1.2, 5), MATS.stone, 108, terrainHeight(108, 0) + 0.6, 4); // 讲台

  // 蒸汽机械
  makeMachine(scene, 0, 95);

  // 沉沙之窖
  makeCrypt(scene, -120, -100);

  // 树木
  const treeSpots = [[-48, -28], [-70, -52], [30, -68], [52, -90], [96, 14], [120, -4], [8, 84], [-12, 102], [-78, 48], [-26, 116]];
  for (const t of treeSpots) makeTree(scene, t[0], t[1]);

  buildNPCs(scene);
  buildBridge(scene);
  buildVase(scene);
  buildAltar(scene);
};
