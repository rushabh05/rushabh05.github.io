// The fixed WebGL layer: a dotted "network globe" with hubs that ping and packets that
// travel along great-circle arcs. On scroll it explodes into a starfield that stays behind
// the page, and it re-assembles at the contact section.

import * as THREE from 'three';

const INK = new THREE.Color('#eceae4');
const ACCENT = new THREE.Color('#c6ff3d');

const pointsVert = /* glsl */ `
  uniform float uTime;
  uniform float uExplode;
  uniform float uIntro;
  uniform float uPR;
  uniform float uSize;
  attribute float aRand;
  attribute float aLand;
  attribute vec3 aScatter;
  varying float vAlpha;
  varying float vAccent;

  void main() {
    float e = clamp(uExplode * 1.6 - aRand * 0.6, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    vec3 p = mix(position, aScatter, e);
    p += e * vec3(sin(uTime * 0.15 + aRand * 20.0), cos(uTime * 0.12 + aRand * 13.0), sin(uTime * 0.1 + aRand * 7.0)) * 0.25;

    float intro = clamp(uIntro * 1.5 - aRand * 0.5, 0.0, 1.0);
    intro = 1.0 - pow(1.0 - intro, 3.0);
    p *= intro;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    vec3 n = normalize(mat3(modelMatrix) * position);
    float facing = smoothstep(-0.45, 0.65, n.z);
    float land = mix(0.22, 1.0, aLand);
    vAlpha = mix(mix(0.07, 1.0, facing) * land, 0.35 + 0.5 * aRand, e) * intro;
    vAccent = step(0.955, aRand) * aLand;

    float tw = 0.7 + 0.3 * sin(uTime * (1.2 + aRand * 2.0) + aRand * 60.0);
    float size = uSize * mix(0.55, 1.15, aLand) * (0.6 + aRand * 0.7) * tw;
    size *= mix(1.0, 1.4, e);
    gl_PointSize = size * uPR / -mv.z;
  }
`;

const pointsFrag = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vAccent;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = pow(smoothstep(0.5, 0.0, d), 1.5);
    gl_FragColor = vec4(mix(uColA, uColB, vAccent), a * vAlpha * uOpacity);
  }
`;

const arcVert = /* glsl */ `
  uniform float uIntro;
  attribute float aT;
  attribute float aSeed;
  varying float vT;
  varying float vSeed;
  varying float vFacing;
  void main() {
    vT = aT;
    vSeed = aSeed;
    vec3 n = normalize(mat3(modelMatrix) * position);
    vFacing = smoothstep(-0.5, 0.6, n.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position * uIntro, 1.0);
  }
`;

const arcFrag = /* glsl */ `
  uniform float uTime;
  uniform float uDraw;
  uniform float uOpacity;
  uniform vec3 uCol;
  uniform vec3 uHot;
  varying float vT;
  varying float vSeed;
  varying float vFacing;
  void main() {
    float drawn = step(vT, uDraw * 1.5 - fract(vSeed * 3.17) * 0.5);
    float speed = 0.16 + fract(vSeed * 7.13) * 0.22;
    float head = fract(uTime * speed + vSeed);
    float d = head - vT;
    float comet = (d > 0.0 && d < 0.2) ? pow(1.0 - d / 0.2, 2.2) : 0.0;
    float a = (0.1 + comet * 1.3) * drawn * mix(0.15, 1.0, vFacing) * uOpacity;
    gl_FragColor = vec4(mix(uCol, uHot, comet), a);
  }
`;

const hubVert = /* glsl */ `
  uniform float uPR;
  uniform float uSize;
  uniform float uIntro;
  attribute float aSeed;
  varying float vSeed;
  varying float vFacing;
  void main() {
    vSeed = aSeed;
    vec3 n = normalize(mat3(modelMatrix) * position);
    vFacing = smoothstep(0.0, 0.6, n.z);
    vec4 mv = modelViewMatrix * vec4(position * uIntro, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPR / -mv.z;
  }
`;

const hubFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uCol;
  varying float vSeed;
  varying float vFacing;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float t = fract(uTime * 0.45 + vSeed);
    float ring = smoothstep(0.07, 0.0, abs(d - t)) * (1.0 - t);
    float core = smoothstep(0.15, 0.07, d);
    float a = (ring * 0.85 + core) * vFacing * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uCol, a);
  }
`;

// cheap smooth pseudo-noise, enough to carve "continents" into the dot sphere
function landNoise(x, y, z) {
  return (
    Math.sin(x * 2.9 + 1.7) * Math.sin(y * 2.5 + 0.3) * Math.sin(z * 3.1 + 2.1) +
    0.55 * Math.sin(x * 5.9 + 0.4) * Math.sin(y * 6.3 + 1.0) * Math.sin(z * 5.1 + 2.6) +
    0.25 * Math.sin(x * 11.0 + 3.0) * Math.sin(y * 9.0) * Math.sin(z * 12.0 + 1.0)
  );
}

export function createGlobe(canvas) {
  const mobile = innerWidth < 900;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  const pr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(innerWidth, innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 7.6);

  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  scene.add(root);
  root.add(tilt);
  tilt.add(spin);
  tilt.rotation.z = -0.38;

  const R = 2;

  // ---- dotted sphere ----
  const N = mobile ? 2600 : 5200;
  const pos = new Float32Array(N * 3);
  const scat = new Float32Array(N * 3);
  const rnd = new Float32Array(N);
  const land = new Float32Array(N);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const landIdx = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    pos.set([x * R, y * R, z * R], i * 3);
    const isLand = landNoise(x, y, z) > 0.05 ? 1 : 0;
    land[i] = isLand;
    if (isLand && Math.abs(y) < 0.85) landIdx.push(i);
    rnd[i] = Math.random();
    // scatter target: a wide shell that fills the viewport
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const rad = 3.2 + Math.random() * 7.5;
    scat.set([Math.cos(a) * s * rad * 1.5, u * rad * 0.9, Math.sin(a) * s * rad - 2.0], i * 3);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('aScatter', new THREE.BufferAttribute(scat, 3));
  pGeo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  pGeo.setAttribute('aLand', new THREE.BufferAttribute(land, 1));
  const pMat = new THREE.ShaderMaterial({
    vertexShader: pointsVert,
    fragmentShader: pointsFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uExplode: { value: 0 }, uIntro: { value: 0 },
      uPR: { value: pr }, uSize: { value: mobile ? 30 : 26 },
      uColA: { value: INK }, uColB: { value: ACCENT }, uOpacity: { value: 1 },
    },
  });
  spin.add(new THREE.Points(pGeo, pMat));

  // ---- hubs + arcs ----
  const HUBS = mobile ? 14 : 22;
  const hubs = [];
  for (let k = 0; k < HUBS && landIdx.length; k++) {
    const i = landIdx[Math.floor(Math.random() * landIdx.length)];
    hubs.push(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).multiplyScalar(1.004));
  }
  const hubGeo = new THREE.BufferGeometry().setFromPoints(hubs);
  hubGeo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(hubs.map(() => Math.random())), 1));
  const hubMat = new THREE.ShaderMaterial({
    vertexShader: hubVert,
    fragmentShader: hubFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: pr }, uSize: { value: 170 }, uIntro: { value: 0 }, uOpacity: { value: 1 }, uCol: { value: ACCENT } },
  });
  spin.add(new THREE.Points(hubGeo, hubMat));

  const ARCS = mobile ? 26 : 48;
  const SEG = 64;
  const arcPos = [];
  const arcT = [];
  const arcSeed = [];
  let made = 0;
  let guard = 0;
  const tmp = new THREE.Vector3();
  while (made < ARCS && guard++ < 2000 && hubs.length > 1) {
    const a = hubs[Math.floor(Math.random() * hubs.length)];
    const b = hubs[Math.floor(Math.random() * hubs.length)];
    const omega = a.angleTo(b);
    if (omega < 0.35 || omega > 2.3) continue;
    const seed = Math.random();
    const lift = 0.05 + omega * 0.12;
    const so = Math.sin(omega);
    let prev = null;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const ka = Math.sin((1 - t) * omega) / so;
      const kb = Math.sin(t * omega) / so;
      tmp.set(a.x * ka + b.x * kb, a.y * ka + b.y * kb, a.z * ka + b.z * kb).setLength(R * (1 + lift * Math.sin(Math.PI * t)));
      if (prev) {
        arcPos.push(prev.x, prev.y, prev.z, tmp.x, tmp.y, tmp.z);
        arcT.push((s - 1) / SEG, t);
        arcSeed.push(seed, seed);
      }
      prev = tmp.clone();
    }
    made++;
  }
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(arcPos, 3));
  arcGeo.setAttribute('aT', new THREE.Float32BufferAttribute(arcT, 1));
  arcGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(arcSeed, 1));
  const arcMat = new THREE.ShaderMaterial({
    vertexShader: arcVert,
    fragmentShader: arcFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uDraw: { value: 0 }, uIntro: { value: 0 }, uOpacity: { value: 1 }, uCol: { value: ACCENT }, uHot: { value: new THREE.Color('#ffffff') } },
  });
  spin.add(new THREE.LineSegments(arcGeo, arcMat));

  // ---- ambient dust ----
  const D = mobile ? 500 : 1100;
  const dust = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 5 + Math.random() * 12;
    dust.set([Math.cos(a) * s * r, u * r, Math.sin(a) * s * r - 4], i * 3);
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dMat = new THREE.PointsMaterial({ size: 0.03, color: INK, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const dustPts = new THREE.Points(dGeo, dMat);
  scene.add(dustPts);

  // ---- state driven from main.js (GSAP tweens these) ----
  const state = { intro: 0, draw: 0, explode: 0, opacity: 1, x: 0, y: 0.3, scale: 1, spin: 0, dust: 0 };

  // pointer + drag-to-spin (mouse only so touch scrolling is untouched)
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let vel = 0;
  let dragging = false;
  let lastX = 0;
  addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = -((e.clientY / innerHeight) * 2 - 1);
    if (dragging) { vel += (e.clientX - lastX) * 0.00055; lastX = e.clientX; }
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!e.target.closest || !e.target.closest('.hero') || e.target.closest('a,button')) return;
    dragging = true; lastX = e.clientX;
  });
  addEventListener('pointerup', () => { dragging = false; });

  let angle = 0;
  function tick(time, dt) {
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    angle += dt * 0.07 + vel;
    vel *= 0.94;
    spin.rotation.y = angle + state.spin;
    tilt.rotation.x = 0.22 - pointer.y * 0.16;
    tilt.rotation.y = pointer.x * 0.22;
    root.position.set(state.x, state.y, 0);
    root.scale.setScalar(state.scale);
    dustPts.rotation.y = time * 0.01 + pointer.x * 0.05;
    dustPts.rotation.x = pointer.y * 0.04;

    const fadeArcs = Math.max(0, 1 - state.explode * 1.8);
    pMat.uniforms.uTime.value = time;
    pMat.uniforms.uExplode.value = state.explode;
    pMat.uniforms.uIntro.value = state.intro;
    pMat.uniforms.uOpacity.value = state.opacity;
    arcMat.uniforms.uTime.value = time;
    arcMat.uniforms.uDraw.value = state.draw;
    arcMat.uniforms.uIntro.value = Math.min(1, state.intro * 1.2);
    arcMat.uniforms.uOpacity.value = state.opacity * fadeArcs;
    hubMat.uniforms.uTime.value = time;
    hubMat.uniforms.uIntro.value = Math.min(1, state.intro * 1.2);
    hubMat.uniforms.uOpacity.value = state.opacity * fadeArcs * Math.min(1, state.draw * 2);
    dMat.opacity = 0.32 * state.dust * state.opacity;

    renderer.render(scene, camera);
  }

  // keep the globe inside the viewport width on portrait screens
  function frame() {
    camera.aspect = innerWidth / innerHeight;
    camera.position.z = Math.max(7.6, 5.8 / camera.aspect);
    camera.updateProjectionMatrix();
  }
  frame();

  function resize() {
    frame();
    renderer.setSize(innerWidth, innerHeight, false);
  }

  return { state, tick, resize, renderer };
}
