/** Мир: планета, атмосфера, звёзды, стартовый стол, следы и эффекты. */

import * as THREE from 'three';
import { ATMO_TOP, R_PLANET } from './constants';

/** Процедурная карта планеты: океаны, материки, шапки полюсов. */
function planetTexture(): THREE.Texture {
  const w = 1024, h = 512;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#dceaf5');
  grad.addColorStop(0.16, '#1b4d80');
  grad.addColorStop(0.5, '#12395f');
  grad.addColorStop(0.84, '#1b4d80');
  grad.addColorStop(1, '#dceaf5');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // материки — наложение мягких пятен
  let seed = 20250605;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const land = ['#2f6b38', '#3c7a3e', '#5d7a3a', '#6b6f3c', '#7a6a44'];
  for (let i = 0; i < 240; i++) {
    const cx = rnd() * w;
    const cy = h * 0.12 + rnd() * h * 0.76;
    const r = 14 + rnd() * 70;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = land[(rnd() * land.length) | 0];
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      const rr = r * (0.62 + rnd() * 0.65);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.7;
      a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function cloudTexture(): THREE.Texture {
  const w = 1024, h = 512;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  let seed = 777;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 170; i++) {
    const cx = rnd() * w, cy = rnd() * h;
    const r = 8 + rnd() * 42;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.62)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function starField(n: number): THREE.Points {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const rad = 8e6;
    pos[i * 3] = Math.cos(th) * s * rad;
    pos[i * 3 + 1] = u * rad;
    pos[i * 3 + 2] = Math.sin(th) * s * rad;
    const t = 0.65 + Math.random() * 0.35;
    col[i * 3] = t; col[i * 3 + 1] = t; col[i * 3 + 2] = Math.min(1, t + Math.random() * 0.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 22000, vertexColors: true, sizeAttenuation: true }));
}

function launchPad(): THREE.Group {
  const g = new THREE.Group();
  const conc = new THREE.MeshStandardMaterial({ color: 0x9a9a95, roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a5f68, metalness: 0.7, roughness: 0.5 });

  const ground = new THREE.Mesh(new THREE.CircleGeometry(9000, 64), new THREE.MeshStandardMaterial({ color: 0x5d6a44, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.6;
  g.add(ground);

  const apron = new THREE.Mesh(new THREE.CylinderGeometry(70, 74, 1.6, 32), conc);
  apron.position.y = -0.8;
  g.add(apron);

  const flame = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 6, 24, 1, true), steel);
  flame.position.y = -3;
  g.add(flame);

  // башня обслуживания
  const tower = new THREE.Group();
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 48, 0.7), steel);
    leg.position.set(dx, 24, dz);
    tower.add(leg);
  }
  for (let y = 6; y < 48; y += 7) {
    const ring = new THREE.Mesh(new THREE.BoxGeometry(9, 0.45, 9), steel);
    ring.position.y = y;
    tower.add(ring);
  }
  tower.position.set(-14, 0, -13);
  g.add(tower);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 30, 10), steel);
    mast.position.set(Math.cos(a) * 42, 15, Math.sin(a) * 42);
    g.add(mast);
  }
  return g;
}

export interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  planet: THREE.Mesh;
  clouds: THREE.Mesh;
  atmo: THREE.Mesh;
  pad: THREE.Group;
  sun: THREE.DirectionalLight;
  trail: THREE.Line;
  trailPositions: Float32Array;
  trailCount: number;
  debris: THREE.Points;
  stars: THREE.Points;
  dispose: () => void;
}

export const TRAIL_MAX = 4000;

export function createWorld(canvas: HTMLCanvasElement, lowPower = false): World {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.6 : 2));
  renderer.setClearColor(0x03050b, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.6, 4e7);

  const stars = starField(lowPower ? 1200 : 2600);
  (stars.material as THREE.PointsMaterial).transparent = true;
  scene.add(stars);

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(R_PLANET, lowPower ? 48 : 72, lowPower ? 32 : 48),
    new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.95, metalness: 0 }),
  );
  scene.add(planet);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(R_PLANET + 6000, lowPower ? 48 : 72, lowPower ? 32 : 48),
    new THREE.MeshStandardMaterial({ map: cloudTexture(), transparent: true, opacity: 0.42, depthWrite: false }),
  );
  scene.add(clouds);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R_PLANET + ATMO_TOP, 64, 40),
    new THREE.MeshBasicMaterial({ color: 0x4e9ce6, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false }),
  );
  scene.add(atmo);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(R_PLANET + ATMO_TOP * 1.9, 64, 40),
    new THREE.MeshBasicMaterial({ color: 0x2f6fbf, transparent: true, opacity: 0.07, side: THREE.BackSide, depthWrite: false }),
  );
  scene.add(halo);

  const sun = new THREE.DirectionalLight(0xfff6e6, 3.4);
  sun.position.set(0.38, 0.92, 0.3).normalize().multiplyScalar(6e6);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x7d90ad, 1.25));
  const fill = new THREE.DirectionalLight(0x6c8fbf, 0.45);
  fill.position.set(-1, -0.3, -0.6).normalize().multiplyScalar(6e6);
  scene.add(fill);

  const pad = launchPad();
  pad.position.set(0, R_PLANET, 0);
  scene.add(pad);

  const trailPositions = new Float32Array(TRAIL_MAX * 3);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  tg.setDrawRange(0, 0);
  const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0x67d2ff, transparent: true, opacity: 0.85 }));
  trail.frustumCulled = false;
  scene.add(trail);

  const debrisCount = 260;
  const dpos = new Float32Array(debrisCount * 3);
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const debris = new THREE.Points(dg, new THREE.PointsMaterial({
    color: 0xffa23a, size: 3.5, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  debris.frustumCulled = false;
  debris.visible = false;
  scene.add(debris);

  const dispose = () => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    renderer.dispose();
  };

  return { scene, camera, renderer, planet, clouds, atmo, pad, sun, trail, trailPositions, trailCount: 0, debris, stars, dispose };
}

export function resetTrail(world: World) {
  world.trailCount = 0;
  world.trail.geometry.setDrawRange(0, 0);
}

export function pushTrail(world: World, p: THREE.Vector3) {
  if (world.trailCount >= TRAIL_MAX) {
    world.trailPositions.copyWithin(0, 3);
    world.trailCount = TRAIL_MAX - 1;
  }
  const i = world.trailCount * 3;
  world.trailPositions[i] = p.x;
  world.trailPositions[i + 1] = p.y;
  world.trailPositions[i + 2] = p.z;
  world.trailCount++;
  world.trail.geometry.setDrawRange(0, world.trailCount);
  (world.trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
}

export interface Explosion { active: boolean; t: number; origin: THREE.Vector3; vel: Float32Array }

export function makeExplosion(): Explosion {
  const n = 260;
  const vel = new Float32Array(n * 3);
  return { active: false, t: 0, origin: new THREE.Vector3(), vel };
}

export function triggerExplosion(ex: Explosion, world: World, origin: THREE.Vector3) {
  ex.active = true;
  ex.t = 0;
  ex.origin.copy(origin);
  const n = ex.vel.length / 3;
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const sp = 25 + Math.random() * 130;
    ex.vel[i * 3] = Math.cos(th) * s * sp;
    ex.vel[i * 3 + 1] = u * sp;
    ex.vel[i * 3 + 2] = Math.sin(th) * s * sp;
  }
  world.debris.visible = true;
  (world.debris.material as THREE.PointsMaterial).opacity = 1;
}

export function updateExplosion(ex: Explosion, world: World, dt: number) {
  if (!ex.active) return;
  ex.t += dt;
  const arr = world.debris.geometry.attributes.position as THREE.BufferAttribute;
  const n = ex.vel.length / 3;
  for (let i = 0; i < n; i++) {
    arr.setXYZ(
      i,
      ex.origin.x + ex.vel[i * 3] * ex.t,
      ex.origin.y + ex.vel[i * 3 + 1] * ex.t - 4.9 * ex.t * ex.t,
      ex.origin.z + ex.vel[i * 3 + 2] * ex.t,
    );
  }
  arr.needsUpdate = true;
  const mat = world.debris.material as THREE.PointsMaterial;
  mat.opacity = Math.max(0, 1 - ex.t / 4.5);
  mat.size = 3.5 + ex.t * 9;
  if (ex.t > 4.5) { ex.active = false; world.debris.visible = false; }
}
