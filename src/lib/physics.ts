/** 6-степенной (упрощённый) интегратор полёта ракеты. Чистая математика, без DOM. */

import { Quaternion, Vector3 } from 'three';
import {
  ATMO_TOP, DT, G0, MU, ORBIT_MIN_PE, P_SL, R_PLANET,
  clamp, density, gravityAt, pressureRatio, soundSpeed,
} from './constants';
import {
  DIAMETER, REF_AREA, analyze, baseCd, centerOfPressure, layout, massProps, resolveParts,
  type Design, type DesignStats,
} from './design';

export type Phase =
  | 'prelaunch' | 'liftoff' | 'pitchover' | 'gravity-turn'
  | 'stage2' | 'coast' | 'circularize' | 'done';

export type Status = 'prelaunch' | 'flying' | 'orbit' | 'destroyed';

export interface FlightEvent { t: number; text: string; kind: 'info' | 'good' | 'bad' }

export interface Orbit {
  apoapsis: number;   // высота апоцентра над поверхностью, м
  periapsis: number;  // высота перицентра, м
  eccentricity: number;
  period: number;     // с
  timeToApo: number;  // с
}

export interface SimState {
  t: number;
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;      // ориентация: локальная ось +Y смотрит в нос
  angVel: Vector3;
  stage: 0 | 1 | 2;      // 0 — 1-я ступень, 1 — 2-я ступень, 2 — всё выгорело
  fuel1: number;
  fuel2: number;
  throttle: number;
  phase: Phase;
  status: Status;
  message: string;
  alt: number;
  speed: number;
  vertSpeed: number;
  mach: number;
  q: number;
  maxQ: number;
  maxHeat: number;
  gForce: number;
  maxG: number;
  aoa: number;           // угол атаки, рад
  heatFlux: number;
  heatLoad: number;
  mass: number;
  cmX: number;      // положение центра масс от носа, м
  bodyLen: number;
  thrust: number;
  stability: number;     // клб
  orbit: Orbit;
  events: FlightEvent[];
  separated: boolean;
  sepPos: Vector3 | null;
  sepVel: Vector3 | null;
  sepQuat: Quaternion | null;
  sepAngVel: Vector3 | null;
  doomed: boolean;
  autopilot: boolean;
  manualPitch: number;   // −1..1, ручное управление
  ignitionTimer: number;
  padTimer: number;
  score: number;
  gimbal: Vector3;      // текущее положение привода сопла (|v| <= 1)
  wind: Vector3;
}

const UP0 = new Vector3(0, 1, 0);

export function initialState(): SimState {
  return {
    t: 0,
    pos: new Vector3(0, R_PLANET, 0),
    vel: new Vector3(0, 0, 0),
    quat: new Quaternion(),
    angVel: new Vector3(),
    stage: 0,
    fuel1: 0,
    fuel2: 0,
    throttle: 0,
    phase: 'prelaunch',
    status: 'prelaunch',
    message: '',
    alt: 0, speed: 0, vertSpeed: 0, mach: 0, q: 0, maxQ: 0, maxHeat: 0,
    gForce: 0, maxG: 0, aoa: 0, heatFlux: 0, heatLoad: 0,
    mass: 0, cmX: 0, bodyLen: 0, thrust: 0, stability: 0,
    orbit: { apoapsis: 0, periapsis: 0, eccentricity: 0, period: 0, timeToApo: 0 },
    events: [],
    separated: false, sepPos: null, sepVel: null, sepQuat: null, sepAngVel: null,
    doomed: false,
    autopilot: true,
    manualPitch: 0,
    ignitionTimer: 0,
    padTimer: 0,
    score: 0,
    gimbal: new Vector3(),
    wind: new Vector3(),
  };
}

export function createFlight(design: Design): { state: SimState; stats: DesignStats } {
  const stats = analyze(design);
  const s = initialState();
  s.fuel1 = stats.stage1Fuel;
  s.fuel2 = stats.stage2Fuel;
  s.mass = stats.wetMass;
  s.stability = stats.stabilityFull;
  return { state: s, stats };
}

/** Оскулирующие элементы орбиты из вектора состояния. */
export function orbitOf(pos: Vector3, vel: Vector3): Orbit {
  const r = pos.length();
  const v = vel.length();
  if (r < 1) return { apoapsis: 0, periapsis: 0, eccentricity: 0, period: 0, timeToApo: 0 };
  const energy = (v * v) / 2 - MU / r;
  const a = -MU / (2 * energy);
  // вектор эксцентриситета
  const h = new Vector3().crossVectors(pos, vel);
  const evec = new Vector3().crossVectors(vel, h).multiplyScalar(1 / MU)
    .sub(pos.clone().multiplyScalar(1 / r));
  const e = evec.length();
  let apo = -Infinity, peri = -Infinity, period = Infinity, timeToApo = Infinity;
  if (energy < 0 && a > 0) {
    apo = a * (1 + e) - R_PLANET;
    peri = a * (1 - e) - R_PLANET;
    period = 2 * Math.PI * Math.sqrt((a * a * a) / MU);
    // истинная аномалия и время до апоцентра
    if (e > 1e-6) {
      const cosNu = clamp(evec.dot(pos) / (e * r), -1, 1);
      let nu = Math.acos(cosNu);
      if (pos.dot(vel) < 0) nu = 2 * Math.PI - nu;
      const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
      const M = E - e * Math.sin(E);
      const n = 2 * Math.PI / period;
      let dt = (Math.PI - M) / n;
      if (dt < 0) dt += period;
      timeToApo = dt;
    } else timeToApo = 0;
  } else {
    apo = Infinity;
    peri = a * (1 - e) - R_PLANET;
    timeToApo = Infinity;
  }
  return { apoapsis: apo, periapsis: peri, eccentricity: e, period, timeToApo };
}

/** Единичный вектор «на восток» в плоскости запуска. */
function eastOf(pos: Vector3, out: Vector3) {
  const up = out.copy(pos).normalize();
  return new Vector3(up.y, -up.x, 0).normalize();
}

const GIMBAL_RATE = 1.25;   // полный ход привода примерно за 0.8 с
const APO_TARGET = 105_000;

/**
 * Ветер: струйное течение с максимумом на 10–11 км плюс порывы.
 * Именно он «пробует на прочность» запас устойчивости.
 */
function windAt(alt: number, t: number, east: Vector3, up: Vector3): Vector3 {
  if (alt < 20 || alt > 26_000) return new Vector3();
  const jet = 34 * Math.exp(-Math.pow((alt - 10_500) / 6_200, 2));
  const gust =
    5.5 * Math.sin(t * 0.63 + 0.4) +
    3.2 * Math.sin(t * 1.77 + 1.9) +
    2.1 * Math.sin(t * 3.41 + 0.7);
  const lateral = 2.4 * Math.sin(t * 0.91 + 2.3);
  const w = east.clone().multiplyScalar(jet + gust);
  w.add(new Vector3().crossVectors(up, east).multiplyScalar(lateral));
  return w;
}

interface Guidance { target: Vector3; throttle: number }

function guidance(s: SimState, stats: DesignStats): Guidance {
  const up = s.pos.clone().normalize();
  const east = eastOf(s.pos, new Vector3());
  const alt = s.alt;
  const prograde = s.speed > 12 ? s.vel.clone().normalize() : up.clone();
  const horiz = new Vector3().copy(east);

  // угол от вертикали для вектора
  const thetaOf = (v: Vector3) => Math.acos(clamp(v.dot(up), -1, 1));
  const dirAt = (theta: number) =>
    up.clone().multiplyScalar(Math.cos(theta)).add(east.clone().multiplyScalar(Math.sin(theta))).normalize();

  if (s.phase === 'coast') {
    return { target: horiz, throttle: 0 };
  }
  if (s.phase === 'circularize') {
    // тангаж удерживает вертикальную скорость около нуля: вся тяга идёт в разгон
    const theta = clamp(-s.vertSpeed * 0.022, -0.42, 0.42);
    const t = horiz.clone().multiplyScalar(Math.cos(theta))
      .add(up.clone().multiplyScalar(Math.sin(theta))).normalize();
    return { target: t, throttle: 1 };
  }

  let target: Vector3;
  let throttle = 1;

  if (alt < 500) {
    target = up.clone();
  } else if (alt < 2600) {
    // манёвр «кик»: наклон на 10° к востоку
    const f = (alt - 500) / 2100;
    target = dirAt((10 * Math.PI / 180) * f);
  } else {
    // гравитационный разворот: следуем за скоростным вектором, подмешивая программу
    const prog = clamp((alt - 2600) / 46_000, 0, 1);
    const thetaProgram = (Math.PI / 2) * Math.pow(prog, 0.62);
    const thetaPro = thetaOf(prograde);
    let theta = thetaPro * 0.62 + thetaProgram * 0.38;
    theta = clamp(theta, 0, 1.53);
    target = dirAt(theta);
  }

  // ограничение угла атаки: реальная система наведения не позволяет
  // программе тангажа увести нос далеко от набегающего потока
  if (s.q > 3_000 && s.speed > 60) {
    const cosAng = clamp(target.dot(prograde), -1, 1);
    const ang = Math.acos(cosAng);
    const maxAoA = 0.2;
    if (ang > maxAoA) {
      const perp = target.clone().sub(prograde.clone().multiplyScalar(cosAng));
      if (perp.lengthSq() > 1e-12) {
        perp.normalize();
        target = prograde.clone().multiplyScalar(Math.cos(maxAoA))
          .add(perp.multiplyScalar(Math.sin(maxAoA))).normalize();
      }
    }
  }

  // «дроссель на макс. напоре» — бережём конструкцию
  if (s.q > 26_000 && alt < 30_000) throttle = 0.68;
  // не перелетаем целевой апоцентр
  const apo = s.orbit.apoapsis;
  if (apo > APO_TARGET * 0.97 && alt < ATMO_TOP) throttle = Math.min(throttle, 0.35);
  if (apo > APO_TARGET) throttle = 0;

  return { target, throttle };
}

function addEvent(s: SimState, text: string, kind: FlightEvent['kind'] = 'info') {
  if (s.events.length && s.events[s.events.length - 1].text === text) return;
  s.events.push({ t: s.t, text, kind });
  if (s.events.length > 40) s.events.shift();
}

function destroy(s: SimState, msg: string) {
  s.status = 'destroyed';
  s.phase = 'done';
  s.message = msg;
  s.throttle = 0;
  addEvent(s, msg, 'bad');
}

/** Один шаг интегрирования (dt секунд). */
export function step(s: SimState, stats: DesignStats, dt: number): void {
  if (s.status === 'destroyed' || s.status === 'orbit') return;

  const p = stats.parts;
  const L = stats.layout;

  // --- массы и центровка ---
  const mp = massProps(p, L, s.stage === 0 ? 0 : 1, s.fuel1, s.fuel2);
  const mass = Math.max(mp.mass, 1);
  s.mass = mass;
  const { cp, cna } = centerOfPressure(p, L, s.stage === 0 ? 0 : 1);
  const bodyLen = s.stage === 0 ? L.totalLength : L.stage2Length;
  const cmX = mp.cm;
  s.cmX = cmX;
  s.bodyLen = bodyLen;
  const staticMargin = (cp - cmX) / DIAMETER;
  s.stability = staticMargin;

  const r = s.pos.length();
  const alt = r - R_PLANET;
  s.alt = alt;

  const up = s.pos.clone().multiplyScalar(1 / r);
  const axis = UP0.clone().applyQuaternion(s.quat).normalize(); // направление носа

  // --- двигатель ---
  let thrustMag = 0;
  let mdot = 0;
  let gimbalMax = 0;
  let engineX = bodyLen;
  const pr = pressureRatio(alt);

  if (s.ignitionTimer > 0) s.ignitionTimer -= dt;

  const activeEngine = s.stage === 0 ? p.s1Engine : s.stage === 1 ? p.s2Engine : null;
  const count = s.stage === 0 ? p.s1EngineCount : 1;
  const fuelLeft = s.stage === 0 ? s.fuel1 : s.stage === 1 ? s.fuel2 : 0;

  if (activeEngine && fuelLeft > 0 && s.throttle > 0 && s.ignitionTimer <= 0 && s.phase !== 'prelaunch') {
    const th = (activeEngine.thrustVac + (activeEngine.thrustSL - activeEngine.thrustVac) * pr) * count;
    const isp = activeEngine.ispVac + (activeEngine.ispSL - activeEngine.ispVac) * pr;
    thrustMag = th * s.throttle;
    mdot = thrustMag / (isp * G0);
    gimbalMax = (activeEngine.gimbal * Math.PI) / 180;
    engineX = s.stage === 0 ? L.s1EngineEnd : L.s2EngineEnd;
  }
  s.thrust = thrustMag;

  // --- наведение ---
  const g = s.autopilot ? guidance(s, stats) : { target: axis.clone(), throttle: s.throttle };
  if (s.autopilot && s.phase !== 'prelaunch') s.throttle = g.throttle;

  let targetDir = g.target.clone();
  if (!s.autopilot && s.manualPitch !== 0) {
    // ручное управление: доворот в плоскости «верх–восток»
    const east = eastOf(s.pos, new Vector3());
    const cur = Math.acos(clamp(axis.dot(up), -1, 1));
    const theta = clamp(cur + s.manualPitch * 0.5, -0.2, 1.75);
    targetDir = up.clone().multiplyScalar(Math.cos(theta))
      .add(east.clone().multiplyScalar(Math.sin(theta))).normalize();
  }

  // --- аэродинамика ---
  const speed = s.vel.length();
  s.speed = speed;
  s.vertSpeed = s.vel.dot(up);
  const rho = density(alt);
  const q = 0.5 * rho * speed * speed;
  s.q = q;
  if (q > s.maxQ) s.maxQ = q;
  s.mach = speed / soundSpeed(alt);

  const force = new Vector3();
  const torque = new Vector3();

  // скорость относительно воздуха — с учётом ветра
  const eastDir = eastOf(s.pos, new Vector3());
  s.wind.copy(rho > 1e-6 ? windAt(alt, s.t, eastDir, up) : new Vector3());
  const vAir = s.vel.clone().sub(s.wind);
  const vAirLen = vAir.length();

  let aoa = 0;
  if (vAirLen > 1 && rho > 1e-7) {
    const vhat = vAir.clone().multiplyScalar(1 / vAirLen);
    const cosA = clamp(axis.dot(vhat), -1, 1);
    aoa = Math.acos(cosA);
    const sinA = Math.sin(aoa);

    // сопротивление: база + трансзвуковой пик + рост под углом атаки
    const qAir = 0.5 * rho * vAirLen * vAirLen;
    const transonic = 1 + 1.05 * p.nose.wave * Math.exp(-Math.pow((s.mach - 1.08) / 0.34, 2));
    const cd = (baseCd(p, s.stage === 0 ? 0 : 1) * transonic) + 1.9 * sinA * sinA;
    const drag = vhat.clone().multiplyScalar(-qAir * REF_AREA * cd);
    force.add(drag);

    // нормальная сила в ЦД
    // направление набегающего потока поперёк корпуса: сила прижимает корпус
    // в сторону, противоположную поперечной составляющей вектора скорости
    const perp = vhat.clone().sub(axis.clone().multiplyScalar(cosA));
    if (perp.lengthSq() > 1e-12) {
      perp.normalize();
      const fn = perp.multiplyScalar(-qAir * REF_AREA * cna * Math.min(sinA, 0.85));
      force.add(fn);
      const arm = axis.clone().multiplyScalar(-(cp - cmX)); // от ЦМ к ЦД
      torque.add(new Vector3().crossVectors(arm, fn));
    }

    // аэродинамическое демпфирование
    const dampCoef = 0.5 * rho * vAirLen * REF_AREA * (cna * 0.35) * Math.pow(Math.max(cp - cmX, 1.5), 2);
    torque.add(s.angVel.clone().multiplyScalar(-dampCoef));

    s.heatFlux = 1.4e-4 * rho * Math.pow(vAirLen, 3);
    s.heatLoad += (s.heatFlux / p.nose.heatTol) * dt;
    if (s.heatFlux > s.maxHeat) s.maxHeat = s.heatFlux;
  } else {
    s.heatFlux = 0;
  }
  s.aoa = aoa;

  // --- управление вектором тяги ---
  if (thrustMag > 0 && gimbalMax > 0) {
    const err = new Vector3().crossVectors(axis, targetDir); // ось поворота × sin(ошибки)
    const kp = 3.2, kd = 7.5;
    const cmd = err.multiplyScalar(kp).sub(s.angVel.clone().multiplyScalar(kd));
    const mag = cmd.length();
    if (mag > 1) cmd.multiplyScalar(1 / mag);
    // привод не мгновенный: ограничение по скорости перекладки сопла
    const delta = cmd.sub(s.gimbal);
    const maxStep = GIMBAL_RATE * dt;
    if (delta.length() > maxStep) delta.setLength(maxStep);
    s.gimbal.add(delta);
    if (s.gimbal.length() > 1) s.gimbal.normalize();
    const lever = Math.max(engineX - cmX, 1);
    const maxTorque = thrustMag * Math.sin(gimbalMax) * lever;
    torque.add(s.gimbal.clone().multiplyScalar(maxTorque));
  } else if (s.stage === 1 && s.phase !== 'prelaunch') {
    // микродвигатели ориентации на верхней ступени
    const err = new Vector3().crossVectors(axis, targetDir);
    const cmd = err.multiplyScalar(2.0).sub(s.angVel.clone().multiplyScalar(6.0));
    const rcs = 12_000;
    const mag = cmd.length();
    if (mag > 1e-9) torque.add(cmd.multiplyScalar((Math.min(mag, 1) * rcs) / mag));
  }

  // --- тяга ---
  if (thrustMag > 0) force.add(axis.clone().multiplyScalar(thrustMag));

  // --- гравитация ---
  force.add(up.clone().multiplyScalar(-gravityAt(r) * mass));

  // --- интегрирование ---
  const acc = force.multiplyScalar(1 / mass);
  const nonGrav = acc.clone().add(up.clone().multiplyScalar(gravityAt(r)));
  s.gForce = nonGrav.length() / 9.80665;
  if (s.gForce > s.maxG) s.maxG = s.gForce;

  const onPad = s.phase === 'prelaunch' || (alt < 0.6 && s.vertSpeed <= 0.01);
  if (onPad) {
    const netUp = acc.dot(up);
    if (netUp <= 0.02) {
      // держат опоры стартового стола
      s.vel.set(0, 0, 0);
      s.pos.copy(up).multiplyScalar(R_PLANET);
      s.angVel.set(0, 0, 0);
      if (s.phase !== 'prelaunch') {
        s.padTimer += dt;
        if (s.padTimer > 6) destroy(s, 'Тяги не хватило: ракета не оторвалась от стола и взорвалась на старте.');
      }
      s.t += dt;
      if (mdot > 0) { if (s.stage === 0) s.fuel1 -= mdot * dt; else s.fuel2 -= mdot * dt; }
      return;
    }
  }

  s.vel.addScaledVector(acc, dt);
  s.pos.addScaledVector(s.vel, dt);

  // угловая динамика (стержень)
  const inertia = Math.max((mass * bodyLen * bodyLen) / 12, 1);
  s.angVel.addScaledVector(torque.multiplyScalar(1 / inertia), dt);
  s.angVel.multiplyScalar(1 - 0.02 * dt);
  const wLen = s.angVel.length();
  if (wLen > 6) s.angVel.multiplyScalar(6 / wLen);
  if (wLen > 1e-9) {
    const dq = new Quaternion().setFromAxisAngle(s.angVel.clone().normalize(), wLen * dt);
    s.quat.premultiply(dq).normalize();
  }

  // расход топлива
  if (mdot > 0) {
    if (s.stage === 0) s.fuel1 = Math.max(0, s.fuel1 - mdot * dt);
    else s.fuel2 = Math.max(0, s.fuel2 - mdot * dt);
  }

  s.t += dt;

  // отделившаяся ступень
  if (s.separated && s.sepPos && s.sepVel && s.sepQuat && s.sepAngVel) {
    const rs = s.sepPos.length();
    if (rs > R_PLANET - 200) {
      const upS = s.sepPos.clone().multiplyScalar(1 / rs);
      s.sepVel.addScaledVector(upS, -gravityAt(rs) * dt);
      const rhoS = density(rs - R_PLANET);
      const vs = s.sepVel.length();
      if (rhoS > 1e-6 && vs > 1) {
        const dragS = 0.5 * rhoS * vs * vs * REF_AREA * 1.2 / 6000;
        s.sepVel.addScaledVector(s.sepVel.clone().normalize(), -dragS * dt);
      }
      s.sepPos.addScaledVector(s.sepVel, dt);
      const w = s.sepAngVel.length();
      if (w > 1e-6) {
        s.sepQuat.premultiply(new Quaternion().setFromAxisAngle(s.sepAngVel.clone().normalize(), w * dt)).normalize();
      }
    }
  }

  // --- орбита ---
  s.orbit = orbitOf(s.pos, s.vel);

  // --- логика полёта ---
  updatePhase(s, stats);

  // --- условия разрушения ---
  checkFailure(s, stats);
}

function updatePhase(s: SimState, stats: DesignStats) {
  const alt = s.alt;
  if (s.phase === 'prelaunch') return;

  if (s.phase === 'liftoff' && alt > 500) { s.phase = 'pitchover'; addEvent(s, 'Начало манёвра тангажа'); }
  if (s.phase === 'pitchover' && alt > 2600) { s.phase = 'gravity-turn'; addEvent(s, 'Гравитационный разворот'); }
  if (alt > 1 && s.padTimer > 0) s.padTimer = 0;

  // разделение ступеней
  if (s.stage === 0 && s.fuel1 <= 0) {
    s.stage = 1;
    s.ignitionTimer = 1.6;
    s.separated = true;
    s.sepPos = s.pos.clone();
    s.sepVel = s.vel.clone();
    s.sepQuat = s.quat.clone();
    s.sepAngVel = new Vector3(0.12, 0, 0.35);
    s.phase = s.phase === 'coast' || s.phase === 'circularize' ? s.phase : 'stage2';
    addEvent(s, 'Отделение первой ступени, запуск второй', 'good');
    if (alt > 55_000) addEvent(s, 'Сброс головного обтекателя');
  }
  if (s.stage === 1 && s.fuel2 <= 0 && s.phase !== 'done') {
    if (s.orbit.periapsis < ORBIT_MIN_PE) {
      s.stage = 2;
      s.throttle = 0;
      addEvent(s, 'Топливо второй ступени израсходовано', 'bad');
    }
  }

  // выход на баллистическую паузу и довыведение
  if (s.phase === 'stage2' || s.phase === 'gravity-turn') {
    if (s.orbit.apoapsis > 100_000 && alt > 55_000) {
      s.phase = 'coast';
      s.throttle = 0;
      addEvent(s, `Выключение двигателя. Апоцентр ${(s.orbit.apoapsis / 1000).toFixed(1)} км`, 'good');
    }
  }
  if (s.phase === 'coast') {
    const burnEstimate = 45;
    if (s.orbit.apoapsis < 80_000 && s.vertSpeed < 0) {
      s.phase = 'circularize';
      addEvent(s, 'Апоцентр падает — включаем двигатель', 'bad');
    } else if (s.orbit.timeToApo < burnEstimate / 2 || s.vertSpeed < 0) {
      s.phase = 'circularize';
      addEvent(s, 'Манёвр довыведения', 'info');
    }
  }
  if (s.phase === 'circularize' && s.orbit.periapsis >= ORBIT_MIN_PE) {
    s.status = 'orbit';
    s.phase = 'done';
    s.throttle = 0;
    s.message = `Орбита достигнута: ${(s.orbit.periapsis / 1000).toFixed(1)} × ${(s.orbit.apoapsis / 1000).toFixed(1)} км`;
    addEvent(s, s.message, 'good');
    s.score = computeScore(s, stats);
  }
}

function computeScore(s: SimState, stats: DesignStats) {
  const fuelLeft = s.fuel2;
  const base = 1000;
  const efficiency = (fuelLeft / Math.max(stats.stage2Fuel, 1)) * 500;
  const payload = stats.parts.payload.mass / 10;
  const circular = Math.max(0, 300 - Math.abs(s.orbit.apoapsis - s.orbit.periapsis) / 100);
  return Math.round(base + efficiency + payload + circular);
}

function checkFailure(s: SimState, stats: DesignStats) {
  if (s.status !== 'flying') return;
  const p = stats.parts;
  const aoaDeg = (s.aoa * 180) / Math.PI;

  if (s.alt < 0) {
    if (s.t < 3) return;
    if (Math.abs(s.vertSpeed) > 12) {
      destroy(s, `Ракета упала на поверхность на скорости ${Math.round(s.speed)} м/с.`);
    } else {
      destroy(s, 'Ракета вернулась на поверхность. Орбита не достигнута.');
    }
    return;
  }

  const descending = s.stage === 2 && s.vertSpeed < 0;
  if (s.q > 12_000 && aoaDeg > 22) {
    if (descending) destroy(s, 'Аппарат разрушился при неуправляемом входе в плотные слои атмосферы.');
    else destroy(s, `Разрушение от угла атаки: ${aoaDeg.toFixed(0)}° при напоре ${(s.q / 1000).toFixed(0)} кПа. Не хватило устойчивости.`);
    return;
  }
  const structuralQ = 62_000 * (p.fins.id === 'grid' ? 0.85 : 1) * (p.nose.id === 'flat' ? 0.75 : 1);
  if (s.q > structuralQ) {
    destroy(s, `Корпус разрушен скоростным напором ${(s.q / 1000).toFixed(0)} кПа — слишком быстрый разгон в плотных слоях.`);
    return;
  }
  if (s.heatFlux > 8_200 * p.nose.heatTol) {
    destroy(s, 'Прогар обтекателя: тепловой поток превысил предел.');
    return;
  }
  if (s.heatLoad > 240_000) {
    destroy(s, 'Обтекатель выгорел от накопленного нагрева.');
    return;
  }
  if (s.angVel.length() > 2.6 && s.q > 6_000) {
    destroy(s, 'Ракета сорвалась в кувырок и развалилась в потоке.');
    return;
  }
  if (s.maxG > 14 && s.gForce > 14) {
    destroy(s, `Перегрузка ${s.gForce.toFixed(1)} g разрушила конструкцию.`);
    return;
  }
  // топливо кончилось, а перицентр ниже атмосферы — падение неизбежно
  if (s.stage === 2 && !s.doomed && s.orbit.periapsis < ORBIT_MIN_PE) {
    s.doomed = true;
    const pe = s.orbit.periapsis;
    s.message = pe < 0
      ? `Топлива не хватило: перицентр ${(pe / 1000).toFixed(0)} км — баллистическая траектория, аппарат падает.`
      : `Топлива не хватило: перицентр ${(pe / 1000).toFixed(1)} км ниже границы атмосферы — орбита неустойчива.`;
    addEvent(s, s.message, 'bad');
  }
}

export function launch(s: SimState) {
  if (s.phase !== 'prelaunch') return;
  s.phase = 'liftoff';
  s.status = 'flying';
  s.throttle = 1;
  addEvent(s, 'Зажигание. Подъём!', 'good');
}

/** Headless-прогон — используется тестами баланса. */
export function simulate(design: Design, maxTime = 1400) {
  const { state, stats } = createFlight(design);
  launch(state);
  let steps = 0;
  while (state.status === 'flying' && !state.doomed && state.t < maxTime && steps < 400_000) {
    step(state, stats, DT);
    steps++;
  }
  return { state, stats };
}

export { DT, R_PLANET, ATMO_TOP, ORBIT_MIN_PE, P_SL, MU };
