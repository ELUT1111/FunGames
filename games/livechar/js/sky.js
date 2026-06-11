/* ============================================================
 * 活字灵境 · sky.js
 * 文字星穹:墨色天穹(随世界进度变色)+ 活字星河(可交互涟漪)
 * + 世界活字星座 + 城邦天空齿轮环
 * ============================================================ */
'use strict';

const Sky = (() => {
  let dome = null, galaxy = null, gearRing = null;
  let domeMat = null, galaxyMat = null;
  const ripples = [];           // {pos:Vector3, r, s}
  let pulse = 0;
  const nebulae = [];
  const constellations = [];
  let bossK = 0, bossOn = false;

  // 各阶段天穹/星河配色(顶色, 地平色, 星河色)
  const PALETTES = [
    { top: 0x04050a, hor: 0x0b0d16, star: 0xb8c4e0 },  // 虚空
    { top: 0x070a14, hor: 0x101a2e, star: 0xa8c0f0 },  // 山·钢蓝
    { top: 0x061018, hor: 0x0e2438, star: 0x8ad4e8 },  // 水·青碧
    { top: 0x081208, hor: 0x122a1a, star: 0x9ae8b0 },  // 树·苍翠
    { top: 0x120c04, hor: 0x2e1e0a, star: 0xffd89a },  // 城·琥珀
  ];
  const BOSS_PAL = { top: 0x140204, hor: 0x300810, star: 0xff8090 };
  const cur = { top: new THREE.Color(PALETTES[0].top), hor: new THREE.Color(PALETTES[0].hor), star: new THREE.Color(PALETTES[0].star) };
  const tgt = { top: cur.top.clone(), hor: cur.hor.clone(), star: cur.star.clone() };

  /* ---------- 字形图集(4×4 共 16 字) ---------- */
  function buildAtlas() {
    const CHARS = '山水树城火冰风雷光墨书道天地灵字';
    const S = 512, cell = S / 4;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = Math.floor(cell * 0.7) + 'px "KaiTi","STKaiti","SimSun",serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = cell * 0.12;
    for (let i = 0; i < 16; i++) {
      ctx.fillText(CHARS[i], (i % 4 + 0.5) * cell, (Math.floor(i / 4) + 0.54) * cell);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.flipY = false;   // 点精灵 gl_PointCoord 以左上为原点,与未翻转纹理对齐
    return tex;
  }

  /* ---------- 墨色天穹 ---------- */
  function buildDome() {
    domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: cur.top }, uHor: { value: cur.hor },
        uTime: { value: 0 }, uPulse: { value: 0 }, uBoss: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop, uHor;
        uniform float uTime, uPulse, uBoss;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uHor, uTop, pow(h, 1.35));
          // 流动墨涡暗纹
          float w1 = sin(d.x * 5.0 + uTime * 0.06) * sin(d.z * 4.0 - uTime * 0.045);
          float w2 = sin((d.x + d.y) * 9.0 - uTime * 0.08) * sin(d.z * 7.0 + uTime * 0.05);
          col += (w1 * 0.5 + w2 * 0.5) * 0.014;
          // 地平线晕光
          col += uHor * pow(1.0 - abs(d.y), 6.0) * 0.5;
          // Boss:血色脉动从天顶渗下
          col = mix(col, vec3(0.16, 0.01, 0.03), uBoss * (0.35 + 0.15 * sin(uTime * 1.7)) * pow(h, 0.7));
          // 事件脉冲闪光
          col += uPulse * vec3(0.10, 0.11, 0.14);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    dome = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 20), domeMat);
    G.scene.add(dome);
  }

  /* ---------- 活字星河 ---------- */
  function buildGalaxy() {
    const N_SPIRAL = 1800, N_SHELL = 800, N = N_SPIRAL + N_SHELL;
    const pos = new Float32Array(N * 3);
    const aChar = new Float32Array(N);
    const aSize = new Float32Array(N);
    const aPhase = new Float32Array(N);
    let i = 0;
    // 银河旋臂:三圈螺旋,横贯天空(微倾斜)
    const TILT = 0.32;
    for (; i < N_SPIRAL; i++) {
      const t = Math.random();
      const a = t * Math.PI * 6 + (Math.random() < 0.5 ? Math.PI : 0);  // 双旋臂
      const r = 70 + t * 280 + Util.rand(-16, 16);
      let x = Math.cos(a) * r, z = Math.sin(a) * r;
      let y = 60 + t * 70 + Util.rand(-14, 14);
      // 绕 x 轴倾斜,让星河像一条横跨的天河
      const y2 = y * Math.cos(TILT) - z * Math.sin(TILT) * 0.4;
      pos[i * 3] = x; pos[i * 3 + 1] = Math.max(24, y2 + 40); pos[i * 3 + 2] = z;
      aChar[i] = Math.floor(Math.random() * 16);
      aSize[i] = Util.rand(2.2, 6.5);
      aPhase[i] = Math.random();
    }
    // 外层散星壳
    for (; i < N; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.48;
      const r = Util.rand(300, 430);
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r + 20;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
      aChar[i] = Math.floor(Math.random() * 16);
      aSize[i] = Util.rand(1.6, 4);
      aPhase[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aChar', new THREE.BufferAttribute(aChar, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));

    galaxyMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uAtlas: { value: buildAtlas() },
        uTime: { value: 0 },
        uColor: { value: cur.star },
        uAimDir: { value: new THREE.Vector3(0, 0, -1) },
        uRipple: { value: [new THREE.Vector4(0, 0, 0, -999), new THREE.Vector4(0, 0, 0, -999), new THREE.Vector4(0, 0, 0, -999)] },
        uRippleS: { value: new THREE.Vector3(0, 0, 0) },
      },
      vertexShader: `
        attribute float aChar, aSize, aPhase;
        uniform float uTime;
        uniform vec3 uAimDir;
        uniform vec4 uRipple[3];
        uniform vec3 uRippleS;
        varying vec2 vOff;
        varying float vBright;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          // 闪烁呼吸
          float b = 0.5 + 0.5 * sin(uTime * (0.5 + aPhase * 1.3) + aPhase * 6.2832);
          b = 0.35 + b * 0.65;
          // 准星辉光:视线所指的星字汇聚发亮
          vec3 toP = normalize(wp.xyz - cameraPosition);
          b += pow(max(dot(toP, uAimDir), 0.0), 60.0) * 1.6;
          // 涟漪冲击波:亮度波环扩散
          for (int k = 0; k < 3; k++) {
            float d = distance(wp.xyz, uRipple[k].xyz);
            float band = 1.0 - smoothstep(0.0, 34.0, abs(d - uRipple[k].w));
            b += band * uRippleS[k];
          }
          vBright = b;
          vOff = vec2(mod(aChar, 4.0), floor(aChar / 4.0)) * 0.25;
          vec4 mv = viewMatrix * wp;
          gl_PointSize = min(64.0, aSize * (340.0 / -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas;
        uniform vec3 uColor;
        varying vec2 vOff;
        varying float vBright;
        void main() {
          vec2 uv = vOff + vec2(gl_PointCoord.x, gl_PointCoord.y) * 0.25;
          vec4 t = texture2D(uAtlas, uv);
          if (t.a < 0.04) discard;
          gl_FragColor = vec4(uColor * vBright, t.a * clamp(vBright, 0.0, 1.0));
        }`,
    });
    galaxy = new THREE.Points(geo, galaxyMat);
    galaxy.frustumCulled = false;
    G.scene.add(galaxy);
  }

  /* ---------- 墨云星雾 ---------- */
  function buildNebulae() {
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.SpriteMaterial({
        map: GlyphLib.ink(), color: 0x141a2e, transparent: true,
        opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      });
      const s = new THREE.Sprite(mat);
      const a = Math.random() * Math.PI * 2;
      s.position.set(Math.cos(a) * Util.rand(180, 330), Util.rand(60, 170), Math.sin(a) * Util.rand(180, 330));
      s.scale.setScalar(Util.rand(120, 240));
      G.scene.add(s);
      nebulae.push({ s, sp: Util.rand(0.01, 0.03), ph: Math.random() * 6.28 });
    }
  }

  /* ---------- 世界活字星座 ---------- */
  // 与四区域方位一致,收字时升起巨型星章
  const CONST_DIR = { '山': [-0.6, -0.8], '水': [0.85, -0.5], '树': [-0.4, 0.9], '城': [0.75, 0.75] };
  function addConstellation(g) {
    const dir = CONST_DIR[g] || [0, -1];
    const r = 330;
    const base = new THREE.Vector3(dir[0] * r, 175, dir[1] * r);
    // 巨型主字(远天元素须关闭雾,否则被指数雾吞没)
    const big = GlyphLib.sprite(g, 30, '#ffffff', 0);
    big.material.fog = false;
    big.position.copy(base);
    G.scene.add(big);
    // 周围小星字环
    const minors = [];
    for (let i = 0; i < 9; i++) {
      const m = GlyphLib.sprite(g, Util.rand(3, 6), '#cfe0ff', 0);
      m.material.fog = false;
      const a = (i / 9) * 6.28;
      m.position.copy(base).add(new THREE.Vector3(Math.cos(a) * Util.rand(28, 50), Util.rand(-22, 26), Math.sin(a) * Util.rand(-30, 30)));
      G.scene.add(m);
      minors.push(m);
    }
    constellations.push({ big, minors, born: G.t, ph: Math.random() * 6.28 });
    ripple(base, 2.0);
  }

  /* ---------- 城邦天空齿轮环(蒸汽朋克天空机械) ---------- */
  function buildGearRing() {
    gearRing = new THREE.Group();
    const CHARS = '齿轮工业城邦蒸汽机枢';
    const R = 230;
    for (let i = 0; i < 40; i++) {
      const s = GlyphLib.sprite(CHARS[i % CHARS.length], Util.rand(5, 9), '#ffce7a', 0);
      s.material.fog = false;
      const a = (i / 40) * 6.28;
      s.position.set(Math.cos(a) * R, 150 + Math.sin(a * 3) * 10, Math.sin(a) * R);
      gearRing.add(s);
    }
    gearRing.userData.fade = 0;
    G.scene.add(gearRing);
  }

  /* ---------- 对外接口 ---------- */
  // 涟漪冲击波:从 pos 向星河扩散亮度波纹
  function ripple(pos, strength = 1) {
    if (ripples.length >= 3) ripples.shift();
    ripples.push({ pos: pos.clone(), r: 0, s: strength });
    pulse = Math.min(1, pulse + strength * 0.3);
  }

  function setStage(n) {
    const p = PALETTES[Math.min(n, PALETTES.length - 1)];
    tgt.top.setHex(p.top); tgt.hor.setHex(p.hor); tgt.star.setHex(p.star);
    if (n >= 4 && gearRing) gearRing.userData.show = true;
  }

  function bossMode(on) {
    bossOn = on;
    if (on) { tgt.top.setHex(BOSS_PAL.top); tgt.hor.setHex(BOSS_PAL.hor); tgt.star.setHex(BOSS_PAL.star); }
    else setStage(G.world.count);
  }

  /* ---------- 周期更新 ---------- */
  function update(dt) {
    const P = G.player;
    // 天穹跟随玩家(星河固定于世界原点 → 移动时产生视差)
    if (dome) dome.position.set(P.pos.x, 0, P.pos.z);
    // 配色渐变
    cur.top.lerp(tgt.top, dt * 0.5);
    cur.hor.lerp(tgt.hor, dt * 0.5);
    cur.star.lerp(tgt.star, dt * 0.5);
    // 雾色同步地平色,远景融入天穹而非黑色剪影
    if (G.scene.fog) G.scene.fog.color.copy(cur.hor);
    bossK += ((bossOn ? 1 : 0) - bossK) * dt * 0.8;
    pulse = Math.max(0, pulse - dt * 1.4);
    if (domeMat) {
      domeMat.uniforms.uTime.value = G.t;
      domeMat.uniforms.uPulse.value = pulse;
      domeMat.uniforms.uBoss.value = bossK;
    }
    // 星河旋转与涟漪
    if (galaxy) {
      galaxy.rotation.y += dt * 0.008;
      galaxyMat.uniforms.uTime.value = G.t;
      galaxyMat.uniforms.uAimDir.value.copy(Util.camForward());
      const uR = galaxyMat.uniforms.uRipple.value;
      const uS = galaxyMat.uniforms.uRippleS.value;
      for (let k = 0; k < 3; k++) {
        const rp = ripples[k];
        if (rp) {
          rp.r += 110 * dt;
          rp.s *= Math.pow(0.42, dt);
          uR[k].set(rp.pos.x, rp.pos.y, rp.pos.z, rp.r);
          uS.setComponent(k, rp.s);
        } else {
          uR[k].w = -999;
          uS.setComponent(k, 0);
        }
      }
      for (let k = ripples.length - 1; k >= 0; k--) {
        if (ripples[k].s < 0.03 || ripples[k].r > 700) ripples.splice(k, 1);
      }
    }
    // 墨云漂移
    for (const n of nebulae) {
      n.s.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), n.sp * dt);
      n.s.material.opacity = 0.12 + 0.06 * Math.sin(G.t * 0.4 + n.ph);
      n.s.material.color.copy(cur.hor).multiplyScalar(2.2);
    }
    // 星座淡入与脉动
    for (const c of constellations) {
      const age = G.t - c.born;
      const k = Math.min(1, age / 3);
      c.big.material.opacity = k * (0.5 + 0.2 * Math.sin(G.t * 0.9 + c.ph));
      c.big.material.rotation = Math.sin(G.t * 0.3 + c.ph) * 0.06;
      c.minors.forEach((m, i) => {
        m.material.opacity = k * (0.3 + 0.25 * Math.sin(G.t * 1.6 + i * 1.7 + c.ph));
      });
    }
    // 天空齿轮环
    if (gearRing) {
      if (gearRing.userData.show && gearRing.userData.fade < 1) gearRing.userData.fade += dt * 0.25;
      const f = gearRing.userData.fade;
      if (f > 0) {
        gearRing.rotation.y -= dt * 0.012;
        gearRing.children.forEach((s, i) => {
          s.material.opacity = f * (0.4 + 0.2 * Math.sin(G.t * 1.2 + i));
        });
      }
    }
  }

  function init() {
    buildDome();
    buildGalaxy();
    buildNebulae();
    buildGearRing();
  }

  return { init, update, ripple, setStage, bossMode, addConstellation };
})();
