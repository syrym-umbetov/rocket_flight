/** Мир: планета, атмосфера, звёзды, стартовый стол, следы и эффекты. */

import * as THREE from 'three';
import { ATMO_TOP, R_PLANET } from './constants';
import { createLaunchPad, type LaunchPad } from './pad';
import { generatePlanet } from './planet';

function dataTexture(data: Uint8Array, w: number, h: number, srgb: boolean) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = true;                       // как у CanvasTexture: строка 0 — север
  t.wrapS = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Свечение атмосферы по краю диска: френелевский ободок на внешней сфере. */
function atmosphereGlow(radius: number) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x74baff) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      intensity: { value: 0 },
    },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vP = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform vec3 sunDir;
      uniform float intensity;
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vec3 V = normalize(cameraPosition - vP);
        float rim = pow(clamp(1.0 - abs(dot(V, normalize(vN))), 0.0, 1.0), 4.2);
        float lit = clamp(dot(normalize(vN), sunDir) * 0.75 + 0.4, 0.0, 1.0);
        float a = rim * intensity * lit;
        gl_FragColor = vec4(glowColor * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), mat);
}

/** Огни городов: видны только на ночной стороне. */
function nightLights(radius: number, map: THREE.Texture) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { lightsMap: { value: map }, sunDir: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: `
      varying vec3 vN;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D lightsMap;
      uniform vec3 sunDir;
      varying vec3 vN;
      varying vec2 vUv;
      void main() {
        float night = smoothstep(0.10, -0.20, dot(normalize(vN), sunDir));
        vec3 c = texture2D(lightsMap, vUv).rgb;
        gl_FragColor = vec4(c * night, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), mat);
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

export interface World {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  planet: THREE.Mesh;
  clouds: THREE.Mesh;
  atmo: THREE.Mesh;
  glow: THREE.Mesh;
  night: THREE.Mesh;
  pad: LaunchPad;
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

  const maps = generatePlanet(lowPower ? 512 : 896);
  const tex = (d: Uint8Array, srgb: boolean) => dataTexture(d, maps.w, maps.h, srgb);
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(R_PLANET, lowPower ? 64 : 112, lowPower ? 40 : 72),
    new THREE.MeshStandardMaterial({
      map: tex(maps.color, true),
      bumpMap: tex(maps.height, false),
      bumpScale: lowPower ? 8 : 16,
      roughnessMap: tex(maps.rough, false),
      roughness: 1,
      metalness: 0,
    }),
  );
  scene.add(planet);

  const night = nightLights(R_PLANET + 300, tex(maps.lights, true));
  scene.add(night);

  // Полюса сферы по умолчанию смотрят вдоль ±Y — то есть точно в стартовую
  // площадку и в плоскость орбиты. Разворачиваем глобус так, чтобы трасса
  // полёта шла по экватору, а не через ледяные шапки.
  const TILT = Math.PI / 2;
  planet.rotation.x = TILT;
  night.rotation.x = TILT;

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(R_PLANET + 7000, lowPower ? 48 : 80, lowPower ? 32 : 52),
    new THREE.MeshStandardMaterial({
      map: tex(maps.clouds, true),
      transparent: true, opacity: 0.9, depthWrite: false, roughness: 1, metalness: 0,
      emissive: new THREE.Color(0x2a3440), emissiveIntensity: 1,
    }),
  );
  // облака крутятся вокруг оси планеты, поэтому наклон вынесен в пивот
  const cloudPivot = new THREE.Group();
  cloudPivot.rotation.x = TILT;
  cloudPivot.add(clouds);
  scene.add(cloudPivot);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R_PLANET + ATMO_TOP, 64, 40),
    new THREE.MeshBasicMaterial({ color: 0x4e9ce6, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false }),
  );
  scene.add(atmo);
  const glow = atmosphereGlow(R_PLANET + ATMO_TOP * 1.15);
  scene.add(glow);

  const sun = new THREE.DirectionalLight(0xfff6e6, 3.4);
  sun.position.set(0.38, 0.92, 0.3).normalize().multiplyScalar(6e6);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x7d90ad, 1.25));
  const fill = new THREE.DirectionalLight(0x6c8fbf, 0.45);
  fill.position.set(-1, -0.3, -0.6).normalize().multiplyScalar(6e6);
  scene.add(fill);

  const pad = createLaunchPad(lowPower);
  pad.group.position.set(0, R_PLANET, 0);
  scene.add(pad.group);

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

  // обе шейдерные оболочки светятся относительно направления на солнце
  const sunDir = sun.position.clone().normalize();
  (glow.material as THREE.ShaderMaterial).uniforms.sunDir.value.copy(sunDir);
  (night.material as THREE.ShaderMaterial).uniforms.sunDir.value.copy(sunDir);

  return { scene, camera, renderer, planet, clouds, atmo, glow, night, pad, sun,
    trail, trailPositions, trailCount: 0, debris, stars, dispose };
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
