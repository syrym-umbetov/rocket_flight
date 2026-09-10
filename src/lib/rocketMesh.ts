/** Построение 3D-модели ракеты по выбранной конструкции. */

import * as THREE from 'three';
import { DIAMETER, type Layout, type Parts } from './design';
import type { Kit } from './kit';

const WHITE = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 0.25, roughness: 0.45 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.6, roughness: 0.4 });
const ORANGE = new THREE.MeshStandardMaterial({ color: 0xd9622b, metalness: 0.3, roughness: 0.55 });
const METAL = new THREE.MeshStandardMaterial({ color: 0x8c93a0, metalness: 0.85, roughness: 0.3 });
const NOZZLE = new THREE.MeshStandardMaterial({ color: 0x4a4f5a, metalness: 0.9, roughness: 0.25 });

const R = DIAMETER / 2;

/** Тело вращения для оживального обтекателя. */
function ogiveGeometry(len: number, radius: number) {
  const pts: THREE.Vector2[] = [];
  const rho = (radius * radius + len * len) / (2 * radius);
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const x = len * t;
    const y = Math.sqrt(Math.max(rho * rho - Math.pow(len - x, 2), 0)) - (rho - radius);
    pts.push(new THREE.Vector2(Math.max(y, 0.02), -x));
  }
  return new THREE.LatheGeometry(pts, 28);
}

function noseMesh(p: Parts): THREE.Mesh {
  const len = p.nose.length;
  let geo: THREE.BufferGeometry;
  switch (p.nose.id) {
    case 'ogive':
      geo = ogiveGeometry(len, R);
      break;
    case 'cone':
      geo = new THREE.ConeGeometry(R, len, 28);
      geo.translate(0, -len / 2, 0);
      break;
    case 'blunt': {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const x = len * t;
        pts.push(new THREE.Vector2(Math.max(R * Math.sqrt(Math.max(1 - Math.pow(1 - t, 2), 0.06)), 0.05), -x));
      }
      geo = new THREE.LatheGeometry(pts, 28);
      break;
    }
    default:
      geo = new THREE.CylinderGeometry(R * 0.97, R, len, 28);
      geo.translate(0, -len / 2, 0);
  }
  return new THREE.Mesh(geo, p.nose.id === 'flat' ? DARK : WHITE);
}

function tube(len: number, mat: THREE.Material, radius = R, topR = radius) {
  const g = new THREE.CylinderGeometry(topR, radius, len, 30, 1, true);
  g.translate(0, -len / 2, 0);
  return new THREE.Mesh(g, mat);
}

function finShape(p: Parts): THREE.BufferGeometry {
  const f = p.fins;
  const s = new THREE.Shape();
  if (f.swept) {
    s.moveTo(0, 0);
    s.lineTo(0, -f.chord);
    s.lineTo(f.span, -f.chord * 0.95);
    s.lineTo(f.span, -f.chord * 0.35);
  } else {
    s.moveTo(0, 0);
    s.lineTo(0, -f.chord);
    s.lineTo(f.span, -f.chord * 0.8);
    s.lineTo(f.span, -f.chord * 0.15);
  }
  s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false });
  geo.translate(0, 0, -0.08);
  return geo;
}

function nozzle(bell: number, len: number) {
  const g = new THREE.CylinderGeometry(bell * 0.32, bell, len, 22, 1, true);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, NOZZLE);
  m.material.side = THREE.DoubleSide;
  return m;
}

export interface RocketMeshes {
  root: THREE.Group;        // начало координат — кончик носа, корпус уходит в −Y
  stage1: THREE.Group;      // отделяемая часть
  upper: THREE.Group;
  plume1: THREE.Group;
  plume2: THREE.Group;
}

/**
 * Сборка из кита, сделанного в Blender. Детали клонируются: геометрия и
 * материалы общие, у каждой копии только своя матрица.
 */
function fromKit(kit: Kit, p: Parts, L: Layout): RocketMeshes {
  const root = new THREE.Group();
  const upper = new THREE.Group();
  const stage1 = new THREE.Group();
  root.add(upper, stage1);

  /** Ставит копию детали началом координат на отметку x от носа. */
  const put = (g: THREE.Group, name: string, x: number, scale?: THREE.Vector3Like) => {
    const src = kit.get(name);
    if (!src) return null;
    const m = src.clone(true);
    m.position.y = -x;
    if (scale) m.scale.set(scale.x, scale.y, scale.z);
    g.add(m);
    return m;
  };
  const sc = (r: number, len: number) => ({ x: r, y: len, z: r });

  // --- верхняя связка ---
  put(upper, `nose_${p.nose.id}`, L.noseStart);
  put(upper, 'tube_unit', L.fairingStart, sc(1, L.fairingEnd - L.fairingStart));
  put(upper, 'band_ring', L.fairingEnd - 0.9, sc(1, 0.75));

  const s2Len = L.s2TankEnd - L.s2TankStart;
  put(upper, 'tube_unit', L.s2TankStart, sc(0.985, s2Len));
  const s2Frames = Math.max(2, Math.floor(s2Len / 2.2));
  for (let i = 0; i < s2Frames; i++) {
    put(upper, 'frame_ring', L.s2TankStart + (s2Len * (i + 1)) / (s2Frames + 1), sc(0.985, 1));
  }
  put(upper, 'skirt_s2', L.s2EngineStart, sc(1, (L.s2EngineEnd - L.s2EngineStart) / 1.8));
  put(upper, 'nozzle_unit', L.s2EngineEnd - 0.5,
    sc(p.s2Engine.bell, 2.2));

  // --- первая ступень ---
  put(stage1, 'interstage', L.interstageStart, sc(1, (L.interstageEnd - L.interstageStart) / 2));

  const s1Len = L.s1TankEnd - L.s1TankStart;
  put(stage1, 'tube_unit', L.s1TankStart, sc(1, s1Len));
  const s1Frames = Math.max(3, Math.floor(s1Len / 2.4));
  for (let i = 0; i < s1Frames; i++) {
    put(stage1, 'frame_ring', L.s1TankStart + (s1Len * (i + 1)) / (s1Frames + 1), sc(1, 1));
  }
  put(stage1, 'band_ring', L.s1TankStart + s1Len * 0.62, sc(1, 1.3));
  const duct = put(stage1, 'cable_duct', L.s1TankStart + 0.5, sc(1, s1Len - 1));
  if (duct) duct.position.x = R * 1.02;

  put(stage1, 'skirt_s1', L.s1EngineStart, sc(1, (L.s1EngineEnd - L.s1EngineStart) / 1.85));

  const nozzleTop = L.s1EngineStart + 0.3;
  const nozzleLen = L.s1EngineEnd - L.s1EngineStart + 0.4;
  if (p.s1EngineCount === 1) {
    put(stage1, 'nozzle_unit', nozzleTop, sc(p.s1Engine.bell, nozzleLen));
  } else {
    for (let i = 0; i < p.s1EngineCount; i++) {
      const a = (i / p.s1EngineCount) * Math.PI * 2;
      const n = put(stage1, 'nozzle_unit', nozzleTop + 0.3,
        sc(p.s1Engine.bell * 0.78, nozzleLen * 0.85));
      if (n) {
        n.position.x = Math.cos(a) * R * 0.45;
        n.position.z = Math.sin(a) * R * 0.45;
      }
    }
  }

  if (p.fins.cna > 0) {
    for (let i = 0; i < 4; i++) {
      const holder = new THREE.Group();
      holder.position.y = -L.finX;
      holder.rotation.y = (i / 4) * Math.PI * 2;
      const blade = kit.get(`fin_${p.fins.id}`)?.clone();
      if (blade) {
        blade.position.x = R - 0.06;
        holder.add(blade);
      }
      stage1.add(holder);
    }
  }

  const plume1 = makePlume(p.s1Engine.bell * (p.s1EngineCount > 1 ? 1.5 : 1.25));
  plume1.position.y = -(L.s1EngineEnd + 1.6);
  stage1.add(plume1);

  const plume2 = makePlume(p.s2Engine.bell * 1.1);
  plume2.position.y = -(L.s2EngineEnd + 1.2);
  upper.add(plume2);

  return { root, stage1, upper, plume1, plume2 };
}

/** Кит используется, когда загрузился; иначе — резервная сборка на примитивах. */
export function buildRocket(p: Parts, L: Layout, kit?: Kit | null): RocketMeshes {
  if (kit && kit.size > 0) return fromKit(kit, p, L);
  return fromPrimitives(p, L);
}

function fromPrimitives(p: Parts, L: Layout): RocketMeshes {
  const root = new THREE.Group();
  const upper = new THREE.Group();
  const stage1 = new THREE.Group();
  root.add(upper, stage1);

  const at = (m: THREE.Object3D, x: number) => { m.position.y = -x; return m; };

  // --- верхняя связка ---
  upper.add(at(noseMesh(p), L.noseStart));
  upper.add(at(tube(L.fairingEnd - L.fairingStart, WHITE), L.fairingStart));
  const band = tube(0.6, ORANGE, R * 1.01);
  upper.add(at(band, L.fairingEnd - 0.1));
  upper.add(at(tube(L.s2TankEnd - L.s2TankStart, WHITE, R * 0.98), L.s2TankStart));
  const s2skirt = tube(L.s2EngineEnd - L.s2EngineStart, DARK, R * 0.9);
  upper.add(at(s2skirt, L.s2EngineStart));
  const n2 = nozzle(p.s2Engine.bell, 2.2);
  upper.add(at(n2, L.s2EngineEnd - 0.3));

  // --- первая ступень ---
  stage1.add(at(tube(L.interstageEnd - L.interstageStart, DARK, R * 0.99), L.interstageStart));
  const tank1 = tube(L.s1TankEnd - L.s1TankStart, WHITE, R);
  stage1.add(at(tank1, L.s1TankStart));
  const stripe = tube(1.4, ORANGE, R * 1.008);
  stage1.add(at(stripe, L.s1TankStart + (L.s1TankEnd - L.s1TankStart) * 0.62));
  stage1.add(at(tube(L.s1EngineEnd - L.s1EngineStart, METAL, R * 0.94), L.s1EngineStart));

  const nozzles: THREE.Object3D[] = [];
  if (p.s1EngineCount === 1) {
    nozzles.push(at(nozzle(p.s1Engine.bell, 3.0), L.s1EngineEnd - 0.4));
  } else {
    for (let i = 0; i < p.s1EngineCount; i++) {
      const a = (i / p.s1EngineCount) * Math.PI * 2;
      const off = R * 0.45;
      const n = at(nozzle(p.s1Engine.bell * 0.8, 2.6), L.s1EngineEnd - 0.4);
      n.position.x = Math.cos(a) * off;
      n.position.z = Math.sin(a) * off;
      nozzles.push(n);
    }
  }
  nozzles.forEach((n) => stage1.add(n));

  if (p.fins.cna > 0) {
    const geo = finShape(p);
    for (let i = 0; i < 4; i++) {
      const holder = new THREE.Group();
      holder.position.set(0, -L.finX, 0);
      holder.rotation.y = (i / 4) * Math.PI * 2;
      const blade = new THREE.Mesh(geo, i % 2 === 0 ? ORANGE : DARK);
      blade.position.set(R - 0.06, 0, 0);
      holder.add(blade);
      stage1.add(holder);
    }
  }

  // --- факелы ---
  const plume1 = makePlume(p.s1Engine.bell * (p.s1EngineCount > 1 ? 1.5 : 1.25));
  plume1.position.y = -(L.s1EngineEnd + 1.6);
  stage1.add(plume1);

  const plume2 = makePlume(p.s2Engine.bell * 1.1);
  plume2.position.y = -(L.s2EngineEnd + 1.2);
  upper.add(plume2);

  return { root, stage1, upper, plume1, plume2 };
}

function makePlume(radius: number) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 0.55, 11, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff4d2, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  core.rotation.x = Math.PI;
  core.position.y = -5.5;
  const halo = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 1.15, 22, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.rotation.x = Math.PI;
  halo.position.y = -11;
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.75, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  g.add(core, halo, glow);
  g.visible = false;
  return g;
}

/** Обновление факела: длина зависит от тяги и внешнего давления. */
export function updatePlume(plume: THREE.Group, throttle: number, pressureRatio: number, t: number) {
  if (throttle <= 0.01) { plume.visible = false; return; }
  plume.visible = true;
  const vac = 1 + (1 - pressureRatio) * 1.35;
  const flicker = 0.9 + Math.sin(t * 45) * 0.06 + Math.sin(t * 23.7) * 0.04;
  plume.scale.set(vac * flicker, throttle * vac * flicker, vac * flicker);
}
