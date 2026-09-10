/**
 * Стартовый комплекс.
 *
 * Собирается из простых примитивов, но всё неподвижное сливается в несколько
 * мешей по материалам (`mergeGeometries`): решётчатые фермы — это сотни балок,
 * и отдельными объектами они дали бы сотни вызовов отрисовки на кадр.
 * Подвижны только фермы обслуживания — их три, каждая своим объектом.
 *
 * Размеры в метрах, начало координат — точка опоры ракеты, +Y в зенит.
 *
 * Два ограничения задают всю компоновку:
 *
 * 1. Поверхность планеты проходит ровно через y = 0, и на масштабе площадки
 *    она плоская. Значит **ничего ниже нуля не видно** — приямок и газоходы
 *    строятся не вниз, а вверх: стартовый стол поднят над бетоном, отражатель
 *    стоит внутри него, газоход уходит от стола по поверхности.
 * 2. В конструкторе камера облетает ракету, и башня не должна её закрывать.
 *    Поэтому вся крупная застройка вынесена в западный сектор, за ракету,
 *    а облёт (см. `Game.tsx`) качается в пределах восточного.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const APRON_R = 96;        // бетонная площадка
const APRON_H = 0.9;
const MOUNT_IN = 6.4;      // проём стартового стола
const MOUNT_OUT = 12;
const MOUNT_TOP = 3.0;     // выше поднимать нельзя: скроет стабилизаторы
const DUCT_DEG = 270;      // газоход уходит на юг, в сторону от башни
/** Башня стоит на 180°, поэтому камера конструктора смотрит с юго-востока. */
const VIEW_AZIMUTH = -0.55;

const TOWER_X = -18;       // кабель-заправочная башня стоит западнее оси
const TOWER_HALF = 4.5;
const TOWER_TOP = 64;
const ARM_ROOT = TOWER_X + TOWER_HALF;
const ARM_TIP = -2.2;                   // фермы стыкуются с бортом; ниже них стабилизаторов нет
const ARM_LEN = ARM_TIP - ARM_ROOT;
const ARM_RETRACT = -1.95;              // угол отвода ферм, рад

/** Полярная расстановка: азимут в градусах, радиус в метрах. */
const at = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a) * r, Math.sin(a) * r];
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y_UP = new THREE.Vector3(0, 1, 0);

type MatKey = 'concrete' | 'scorch' | 'steel' | 'paint' | 'tank' | 'berm' | 'asphalt';
type Bin = Map<MatKey, THREE.BufferGeometry[]>;

/**
 * Слить можно только однородные буферы, поэтому индексы снимаются сразу:
 * у коробки это 36 вершин против 24, на таком количестве деталей разница
 * несущественна, а `ExtrudeGeometry` индексов и не имеет.
 */
function put(bin: Bin, key: MatKey, g: THREE.BufferGeometry) {
  let flat = g;
  if (g.index) { flat = g.toNonIndexed(); g.dispose(); }
  const list = bin.get(key);
  if (list) list.push(flat);
  else bin.set(key, [flat]);
}

function box(bin: Bin, key: MatKey, w: number, h: number, d: number,
             x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  put(bin, key, g);
}

/** Балка произвольного наклона — из неё собраны все фермы. */
function beam(bin: Bin, key: MatKey, a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.05) return;
  const g = new THREE.BoxGeometry(t, len, t);
  const q = new THREE.Quaternion().setFromUnitVectors(Y_UP, dir.divideScalar(len));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, V(1, 1, 1)));
  put(bin, key, g);
}

function tube(bin: Bin, key: MatKey, rTop: number, rBot: number, h: number,
              x: number, y: number, z: number, seg = 12) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y, z);
  put(bin, key, g);
}

function ball(bin: Bin, key: MatKey, r: number, x: number, y: number, z: number, seg = 16) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.6)));
  g.translate(x, y, z);
  put(bin, key, g);
}

function octagon(r: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const [x, y] = [Math.cos(a) * r, Math.sin(a) * r];
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/** Плита из плоского контура: выдавливается вверх, верх ложится на `top`. */
function slab(bin: Bin, key: MatKey, shape: THREE.Shape, thickness: number, top: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);           // выдавливание становится вертикальным
  g.translate(0, top - thickness, 0);
  put(bin, key, g);
}

/** Плоское кольцо-диск заданной толщины. */
function disc(bin: Bin, key: MatKey, r: number, top: number, thickness = 0.3, seg = 24) {
  const g = new THREE.CylinderGeometry(r, r, thickness, seg);
  g.translate(0, top - thickness / 2, 0);
  put(bin, key, g);
}

/**
 * Решётчатая ферма: четыре пояса, связи по ярусам и раскосы крестом по каждой
 * грани. Решётка открытая не только ради веса — сквозь неё видно ракету.
 */
function lattice(
  bin: Bin, key: MatKey, cx: number, cz: number,
  halfBase: number, halfTop: number, base: number, top: number,
  bays: number, legT: number, braceT: number, cross = true,
) {
  const h = top - base;
  const bay = h / bays;
  const corner = (i: number, y: number) => {
    const s = halfBase + (halfTop - halfBase) * ((y - base) / h);
    return V(cx + (i === 0 || i === 3 ? -s : s), y, cz + (i < 2 ? -s : s));
  };
  for (let b = 0; b < bays; b++) {
    const y0 = base + b * bay;
    const y1 = y0 + bay;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      beam(bin, key, corner(i, y0), corner(i, y1), legT);       // пояс
      beam(bin, key, corner(i, y1), corner(j, y1), braceT);      // связь яруса
      if (cross) {
        beam(bin, key, corner(i, y0), corner(j, y1), braceT);
        beam(bin, key, corner(j, y0), corner(i, y1), braceT);
      } else if (b % 2 === 0) {
        beam(bin, key, corner(i, y0), corner(j, y1), braceT);
      }
    }
  }
  for (let i = 0; i < 4; i++) beam(bin, key, corner(i, base), corner((i + 1) % 4, base), braceT);
}

/* ---------- узлы комплекса ---------- */

/** Бетонное поле, стартовый стол с газоотражателем и газоход. */
function padDeck(bin: Bin) {
  slab(bin, 'concrete', octagon(APRON_R), APRON_H + 1.4, APRON_H);

  // выжженный бетон в проёме стола
  disc(bin, 'scorch', MOUNT_IN + 0.6, APRON_H + 0.08, 0.3, 24);

  // газоотражатель — наклонная плита, уводящая струю в газоход
  const wedge = new THREE.BoxGeometry(MOUNT_IN * 1.9, 1.1, MOUNT_IN * 2.1);
  wedge.rotateX(0.4);
  wedge.translate(0, APRON_H + 0.9, -1.6);
  put(bin, 'scorch', wedge);

  // стол: восемь стенок по восьмиугольнику, одна снята под газоход
  const gap = Math.round(DUCT_DEG / 45) % 8;
  const midR = (MOUNT_IN + MOUNT_OUT) / 2;
  const wall = 2 * MOUNT_OUT * Math.tan(Math.PI / 8) + 0.4;
  for (let i = 0; i < 8; i++) {
    if (i === gap) continue;
    const a = (i * Math.PI) / 4;
    box(bin, 'concrete', wall, MOUNT_TOP - APRON_H, MOUNT_OUT - MOUNT_IN,
      Math.cos(a) * midR, (MOUNT_TOP + APRON_H) / 2, Math.sin(a) * midR, -(Math.PI / 2 + a));
  }
  // стальной настил стола и прижимные захваты у среза сопла
  const ring = octagon(MOUNT_OUT);
  const hole = new THREE.Path();
  hole.absarc(0, 0, MOUNT_IN, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  slab(bin, 'steel', ring, 0.5, MOUNT_TOP + 0.5);
  for (let i = 0; i < 4; i++) {
    const [x, z] = at(45 + i * 90, MOUNT_IN + 0.9);
    box(bin, 'paint', 1.4, 2.4, 1.4, x, MOUNT_TOP + 1.7, z, (i * Math.PI) / 4);
  }

  // газоход: две расходящиеся стенки и выжженное дно между ними
  const [dx, dz] = at(DUCT_DEG, 1);
  const nx = -dz, nz = dx;                        // нормаль к оси газохода
  for (const s of [-1, 1]) {
    for (let seg = 0; seg < 4; seg++) {
      const t0 = 9 + seg * 9;
      const t1 = t0 + 9;
      const w0 = 8 + seg * 1.6;
      const w1 = w0 + 1.6;
      beam(bin, 'concrete',
        V(dx * t0 + nx * w0 * s, APRON_H + 1.6, dz * t0 + nz * w0 * s),
        V(dx * t1 + nx * w1 * s, APRON_H + 1.6, dz * t1 + nz * w1 * s), 3.2);
    }
  }
  box(bin, 'scorch', 44, 0.3, 21, dx * 29, APRON_H + 0.1, dz * 29, -Math.atan2(dz, dx));
}

/** Кабель-заправочная башня: ферма, площадки, шахта лифта, кран. */
function serviceTower(bin: Bin, lowPower: boolean) {
  lattice(bin, 'steel', TOWER_X, 0, TOWER_HALF, TOWER_HALF * 0.82, 0, TOWER_TOP,
    lowPower ? 7 : 11, 0.55, 0.3, !lowPower);
  box(bin, 'concrete', 16, 1.6, 16, TOWER_X, APRON_H + 0.8, 0);

  // рабочие площадки — только со стороны ракеты, чтобы не закрывать её силуэт
  for (const y of [17, 34, 51]) {
    box(bin, 'steel', 5.5, 0.3, TOWER_HALF * 2 + 1.6, TOWER_X + TOWER_HALF + 1.6, y, 0);
    box(bin, 'steel', 5.5, 1.0, 0.12, TOWER_X + TOWER_HALF + 1.6, y + 0.65, TOWER_HALF + 0.8);
    box(bin, 'steel', 5.5, 1.0, 0.12, TOWER_X + TOWER_HALF + 1.6, y + 0.65, -TOWER_HALF - 0.8);
  }
  // шахта лифта с тыльной стороны
  box(bin, 'steel', 2.6, TOWER_TOP, 2.6, TOWER_X - TOWER_HALF - 1.3, TOWER_TOP / 2, 0);
  // кран: стрела с противовесом, за ось ракеты не выходит
  box(bin, 'steel', 15, 0.5, 1.2, TOWER_X + 2, TOWER_TOP + 2.4, 0);
  box(bin, 'paint', 2.2, 2, 2.2, TOWER_X - 5, TOWER_TOP + 3.3, 0);
  tube(bin, 'steel', 0.16, 0.34, 12, TOWER_X, TOWER_TOP + 6, 0, 8);
}

/** Одна ферма обслуживания. Отдельным объектом: она отводится перед пуском. */
function serviceArm(mat: THREE.Material): THREE.Group {
  const bin: Bin = new Map();
  const w = 1.5;
  const dir = Math.sign(ARM_LEN);   // ферма растёт от грани башни к оси ракеты
  const len = Math.abs(ARM_LEN);
  const bays = 4;
  const step = len / bays;
  for (let b = 0; b < bays; b++) {
    const x0 = dir * b * step;
    const x1 = dir * (b + 1) * step;
    for (const s of [-1, 1]) {
      beam(bin, 'steel', V(x0, 0.9, s * w), V(x1, 0.9, s * w), 0.22);
      beam(bin, 'steel', V(x0, -0.5, s * w), V(x1, -0.5, s * w), 0.22);
      beam(bin, 'steel', V(x0, -0.5, s * w), V(x1, 0.9, s * w), 0.14);
    }
    beam(bin, 'steel', V(x1, 0.9, -w), V(x1, 0.9, w), 0.14);
    beam(bin, 'steel', V(x1, -0.5, -w), V(x1, -0.5, w), 0.14);
  }
  // наконечник: колпак стыковки и рукава вдоль фермы
  box(bin, 'steel', 1.8, 2.4, w * 2.4, dir * (len + 0.6), 0.2, 0);
  for (const s of [-0.7, 0.7]) {
    const g = new THREE.CylinderGeometry(0.3, 0.3, len * 0.9, 8);
    g.rotateZ(Math.PI / 2);
    g.translate(dir * len * 0.5, -0.5, s * w);
    put(bin, 'steel', g);
  }

  const group = new THREE.Group();
  const geo = bake(bin).get('steel');
  if (geo) group.add(new THREE.Mesh(geo, mat));
  group.position.x = ARM_ROOT;
  return group;
}

/** Молниеотводы за ракетой и тросы между ними. */
function lightningMasts(bin: Bin, lowPower: boolean): THREE.Vector3[] {
  const tops: THREE.Vector3[] = [];
  for (const deg of [118, 180 + 62, 200]) {
    const [x, z] = at(deg, 38);
    lattice(bin, 'steel', x, z, 2.2, 0.7, 0, 62, lowPower ? 5 : 8, 0.34, 0.18, !lowPower);
    tube(bin, 'paint', 0.12, 0.3, 16, x, 70, z, 8);
    box(bin, 'concrete', 7, 1.8, 7, x, APRON_H + 0.9, z);
    tops.push(V(x, 78, z));
  }
  return tops;
}

/** Прожекторные мачты, кабельные каналы и кабель-мачты у стола. */
function padServices(bin: Bin) {
  for (const deg of [95, 150, 215, 265]) {
    const [x, z] = at(deg, 28);
    tube(bin, 'steel', 0.28, 0.5, 20, x, APRON_H + 10, z, 8);
    box(bin, 'steel', 2.6, 0.5, 0.8, x, APRON_H + 20.4, z, (-deg * Math.PI) / 180);
  }
  for (const deg of [150, 205, 250]) {
    const [x1, z1] = at(deg, MOUNT_OUT);
    const [x2, z2] = at(deg, APRON_R);
    const len = Math.hypot(x2 - x1, z2 - z1);
    box(bin, 'concrete', len, 1.1, 3.2, (x1 + x2) / 2, APRON_H + 0.55, (z1 + z2) / 2,
      -Math.atan2(z2 - z1, x2 - x1));
  }
  // две малые кабель-мачты у стола
  for (const deg of [160, 200]) {
    const [x, z] = at(deg, 15);
    lattice(bin, 'steel', x, z, 1.1, 0.9, APRON_H, APRON_H + 12, 3, 0.26, 0.16);
    box(bin, 'steel', 0.5, 0.5, 6, x * 0.75, APRON_H + 10, z * 0.75, -(deg * Math.PI) / 180);
  }
}

/** Дальняя застройка: хранилища, водонапорная башня, бункер, МИК и путь к нему. */
function infrastructure(bin: Bin, lowPower: boolean) {
  // хранилище компонентов топлива
  const [fx, fz] = at(250, 260);
  for (let i = 0; i < 3; i++) {
    const ox = fx + (i - 1) * 28;
    const oz = fz + (i % 2) * 24;
    ball(bin, 'tank', 8, ox, 12, oz, lowPower ? 12 : 18);
    tube(bin, 'steel', 6.5, 7.5, 5, ox, 2.5, oz, 12);
    box(bin, 'concrete', 21, 0.6, 21, ox, 0.3, oz);
  }
  // эстакада трубопровода к площадке
  const [px, pz] = at(250, 104);
  const plen = Math.hypot(px - fx, pz - fz);
  const pang = -Math.atan2(pz - fz, px - fx);
  for (const s of [-1, 0, 1]) {
    box(bin, 'steel', plen, 0.5, 0.5, (fx + px) / 2, 5.4 + Math.abs(s) * 0.9, (fz + pz) / 2 + s * 1.2, pang);
  }
  for (let t = 0.06; t < 1; t += 0.12) {
    box(bin, 'steel', 0.6, 5.4, 0.6, fx + (px - fx) * t, 2.7, fz + (pz - fz) * t);
  }

  // водонапорная башня системы орошения
  const [wx, wz] = at(145, 240);
  lattice(bin, 'steel', wx, wz, 5, 4, 0, 30, 5, 0.4, 0.22, !lowPower);
  tube(bin, 'tank', 9, 9, 13, wx, 36.5, wz, lowPower ? 12 : 20);
  tube(bin, 'tank', 0.6, 9, 5, wx, 45.5, wz, lowPower ? 12 : 20);

  // командный бункер под обваловкой
  const [bx, bz] = at(112, 300);
  box(bin, 'concrete', 40, 8, 22, bx, 4, bz, 0.4);
  box(bin, 'berm', 58, 5.4, 40, bx, 2.7, bz, 0.4);
  tube(bin, 'steel', 0.2, 0.3, 26, bx + 16, 13, bz + 7, 6);

  // монтажно-испытательный корпус и путь транспортёра к площадке
  const [mx, mz] = at(196, 470);
  const rot = -(196 * Math.PI) / 180;
  box(bin, 'concrete', 92, 32, 52, mx, 16, mz, rot);
  box(bin, 'steel', 94, 3, 54, mx, 33.5, mz, rot);
  const [gx, gz] = at(196, 470 - 27);
  box(bin, 'steel', 2, 24, 22, gx, 12, gz, rot);

  const [rx, rz] = at(196, 104);
  const rlen = Math.hypot(rx - gx, rz - gz);
  const rang = -Math.atan2(rz - gz, rx - gx);
  box(bin, 'asphalt', rlen, 0.4, 24, (gx + rx) / 2, 0.2, (gz + rz) / 2, rang);
  const ux = (rx - gx) / rlen;
  const uz = (rz - gz) / rlen;
  for (const s of [-3.4, 3.4]) {
    box(bin, 'steel', rlen, 0.4, 0.6, (gx + rx) / 2 - uz * s, 0.55, (gz + rz) / 2 + ux * s, rang);
  }
}

/* ---------- сборка ---------- */

/** Слить накопленные буферы: один меш на материал. */
function bake(bin: Bin): Map<MatKey, THREE.BufferGeometry> {
  const out = new Map<MatKey, THREE.BufferGeometry>();
  for (const [key, list] of bin) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (merged) {
      merged.computeBoundingSphere();
      out.set(key, merged);
    }
  }
  bin.clear();
  return out;
}

export interface LaunchPad {
  group: THREE.Group;
  /** Азимут облёта, с которого застройка остаётся сбоку и позади (рад). */
  readonly viewAzimuth: number;
  /** Разводит фермы обслуживания по высоте текущей ракеты. */
  setVehicleLength: (len: number) => void;
  /** 0 — фермы прижаты к ракете, 1 — отведены к башне. */
  setRetract: (t: number) => void;
}

export function createLaunchPad(lowPower = false): LaunchPad {
  const materials: Record<MatKey, THREE.Material> = {
    concrete: new THREE.MeshStandardMaterial({ color: 0x9d9c95, roughness: 0.95, metalness: 0 }),
    scorch: new THREE.MeshStandardMaterial({ color: 0x40403c, roughness: 1, metalness: 0 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5b6069, roughness: 0.5, metalness: 0.68 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xb2452f, roughness: 0.65, metalness: 0.15 }),
    tank: new THREE.MeshStandardMaterial({ color: 0xdde3ea, roughness: 0.45, metalness: 0.3 }),
    berm: new THREE.MeshStandardMaterial({ color: 0x59653f, roughness: 1, metalness: 0 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x3b3d41, roughness: 0.95, metalness: 0 }),
  };

  const group = new THREE.Group();
  const bin: Bin = new Map();

  padDeck(bin);
  serviceTower(bin, lowPower);
  const mastTops = lightningMasts(bin, lowPower);
  padServices(bin);
  infrastructure(bin, lowPower);

  for (const [key, geo] of bake(bin)) {
    const mesh = new THREE.Mesh(geo, materials[key]);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  // тросы молниезащиты — провисающая линия между верхушками мачт
  const pts: number[] = [];
  for (let i = 0; i < mastTops.length - 1; i++) {
    const a = mastTops[i];
    const b = mastTops[i + 1];
    const steps = 14;
    for (let s = 0; s < steps; s++) {
      for (const t of [s / steps, (s + 1) / steps]) {
        const sag = Math.sin(t * Math.PI) * 8;
        pts.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag, a.z + (b.z - a.z) * t);
      }
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x3b4149 })));

  const arms = [0, 1, 2].map(() => serviceArm(materials.steel));
  for (const a of arms) group.add(a);

  let retract = -1;
  const setRetract = (t: number) => {
    if (t === retract) return;
    retract = t;
    for (const a of arms) a.rotation.y = ARM_RETRACT * t;
  };

  const setVehicleLength = (len: number) => {
    // нижняя ферма — у переходного отсека, верхняя — под обтекателем
    const levels = [0.3, 0.57, 0.84].map((f) => Math.min(len * f, TOWER_TOP - 6));
    arms.forEach((a, i) => { a.position.y = levels[i]; });
  };

  setVehicleLength(40);
  setRetract(0);

  return { group, viewAzimuth: VIEW_AZIMUTH, setVehicleLength, setRetract };
}
