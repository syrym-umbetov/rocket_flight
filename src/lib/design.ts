/** Конструкция ракеты: геометрия, массы, центровка, характеристики. */

import { G0, clamp } from './constants';
import {
  ENGINES, FINS, NOSES, PAYLOADS, TANKS, byId,
  type EnginePart, type FinPart, type NosePart, type PayloadPart, type TankPart,
} from './parts';

export interface Design {
  nose: string;
  fins: string;
  payload: string;
  s1Engine: string;
  s1Tank: string;
  s1EngineCount: number; // 1..4
  s2Engine: string;
  s2Tank: string;
}

export const DEFAULT_DESIGN: Design = {
  nose: 'ogive',
  fins: 'large',
  payload: 'sat',
  s1Engine: 'kestrel',
  s1Tank: 's1-m',
  s1EngineCount: 1,
  s2Engine: 'nova',
  s2Tank: 's2-m',
};

export const DIAMETER = 3.0;                    // калибр корпуса, м
export const REF_AREA = Math.PI * (DIAMETER / 2) ** 2;

export const FAIRING_LEN = 4.0;
export const INTERSTAGE_LEN = 2.0;
export const S1_ENGINE_LEN = 3.0;
export const S2_ENGINE_LEN = 2.0;

export const FAIRING_MASS = 450;
export const INTERSTAGE_MASS = 300;

export interface Parts {
  nose: NosePart;
  fins: FinPart;
  payload: PayloadPart;
  s1Engine: EnginePart;
  s1Tank: TankPart;
  s2Engine: EnginePart;
  s2Tank: TankPart;
  s1EngineCount: number;
}

export function resolveParts(d: Design): Parts {
  return {
    nose: byId(NOSES, d.nose),
    fins: byId(FINS, d.fins),
    payload: byId(PAYLOADS, d.payload),
    s1Engine: byId(ENGINES, d.s1Engine),
    s1Tank: byId(TANKS, d.s1Tank),
    s2Engine: byId(ENGINES, d.s2Engine),
    s2Tank: byId(TANKS, d.s2Tank),
    s1EngineCount: clamp(Math.round(d.s1EngineCount), 1, 4),
  };
}

/** Продольная разметка: координаты от носа вниз (ось X «вниз по корпусу»). */
export interface Layout {
  noseStart: number; noseEnd: number;
  fairingStart: number; fairingEnd: number;
  s2TankStart: number; s2TankEnd: number;
  s2EngineStart: number; s2EngineEnd: number;
  interstageStart: number; interstageEnd: number;
  s1TankStart: number; s1TankEnd: number;
  s1EngineStart: number; s1EngineEnd: number;
  finX: number;
  totalLength: number;
  stage2Length: number; // длина связки после отделения 1-й ступени
}

export function layout(p: Parts): Layout {
  let x = 0;
  const noseStart = x; x += p.nose.length; const noseEnd = x;
  const fairingStart = x; x += FAIRING_LEN; const fairingEnd = x;
  const s2TankStart = x; x += p.s2Tank.length; const s2TankEnd = x;
  const s2EngineStart = x; x += S2_ENGINE_LEN; const s2EngineEnd = x;
  const stage2Length = x;
  const interstageStart = x; x += INTERSTAGE_LEN; const interstageEnd = x;
  const s1TankStart = x; x += p.s1Tank.length; const s1TankEnd = x;
  const s1EngineStart = x; x += S1_ENGINE_LEN; const s1EngineEnd = x;
  return {
    noseStart, noseEnd, fairingStart, fairingEnd,
    s2TankStart, s2TankEnd, s2EngineStart, s2EngineEnd,
    interstageStart, interstageEnd, s1TankStart, s1TankEnd,
    s1EngineStart, s1EngineEnd,
    finX: s1EngineStart - p.fins.chord * 0.45,
    totalLength: x,
    stage2Length,
  };
}

interface MassItem { m: number; x: number }

/**
 * Массовая сводка при заданном остатке топлива.
 * stage: 0 — обе ступени, 1 — первая отделена, 2 — топливо кончилось.
 */
export function massProps(p: Parts, L: Layout, stage: number, fuel1: number, fuel2: number) {
  const items: MassItem[] = [
    { m: p.nose.mass, x: L.noseStart + p.nose.length * 0.6 },
    { m: FAIRING_MASS + p.payload.mass, x: (L.fairingStart + L.fairingEnd) / 2 },
    { m: p.s2Tank.dry, x: (L.s2TankStart + L.s2TankEnd) / 2 },
    { m: fuel2, x: (L.s2TankStart + L.s2TankEnd) / 2 },
    { m: p.s2Engine.mass, x: (L.s2EngineStart + L.s2EngineEnd) / 2 },
  ];
  if (stage === 0) {
    items.push(
      { m: INTERSTAGE_MASS, x: (L.interstageStart + L.interstageEnd) / 2 },
      { m: p.s1Tank.dry, x: (L.s1TankStart + L.s1TankEnd) / 2 },
      { m: fuel1, x: (L.s1TankStart + L.s1TankEnd) / 2 },
      { m: p.s1Engine.mass * p.s1EngineCount, x: (L.s1EngineStart + L.s1EngineEnd) / 2 },
      { m: p.fins.mass, x: L.finX },
    );
  }
  let mass = 0, mx = 0;
  for (const it of items) { mass += it.m; mx += it.m * it.x; }
  return { mass, cm: mass > 0 ? mx / mass : 0 };
}

/** Центр давления по упрощённой методике Барроумена. */
export function centerOfPressure(p: Parts, L: Layout, stage: number) {
  const len = stage === 0 ? L.totalLength : L.stage2Length;
  let cna = 2.0;                      // обтекатель
  let cnx = 2.0 * (p.nose.cpFactor * p.nose.length);
  const bodyCna = 0.6;                // подъёмная сила корпуса под углом атаки
  cna += bodyCna; cnx += bodyCna * len * 0.55;
  if (stage === 0 && p.fins.cna > 0) {
    cna += p.fins.cna;
    cnx += p.fins.cna * L.finX;
  }
  return { cp: cnx / cna, cna };
}

/** Коэффициент лобового сопротивления при нулевом угле атаки. */
export function baseCd(p: Parts, stage: number) {
  const fins = stage === 0 ? p.fins.cd : 0;
  const base = stage === 0 ? 0.11 : 0.07; // донное сопротивление
  return p.nose.cd + fins + base;
}

export interface DesignStats {
  parts: Parts;
  layout: Layout;
  wetMass: number;
  stage1Fuel: number;
  stage2Fuel: number;
  thrust1SL: number;
  twr: number;
  dv1: number;
  dv2: number;
  dvTotal: number;
  stabilityFull: number;   // запас устойчивости в калибрах (полные баки)
  stabilityEmpty: number;  // на выгорании 1-й ступени
  burn1: number;           // время работы 1-й ступени, с
  burn2: number;
  twrStage2: number;
  length: number;
}

export function analyze(d: Design): DesignStats {
  const p = resolveParts(d);
  const L = layout(p);
  const f1 = p.s1Tank.fuel;
  const f2 = p.s2Tank.fuel;

  const full = massProps(p, L, 0, f1, f2);
  const burnout1 = massProps(p, L, 0, 0, f2);
  const stage2Full = massProps(p, L, 1, 0, f2);
  const stage2Dry = massProps(p, L, 1, 0, 0);

  const thrust1SL = p.s1Engine.thrustSL * p.s1EngineCount;
  const twr = thrust1SL / (full.mass * 9.80665);

  const isp1 = (p.s1Engine.ispSL + p.s1Engine.ispVac) / 2;
  const dv1 = isp1 * G0 * Math.log(full.mass / burnout1.mass);
  const dv2 = p.s2Engine.ispVac * G0 * Math.log(stage2Full.mass / stage2Dry.mass);

  const cpFull = centerOfPressure(p, L, 0).cp;
  const cpEmpty = centerOfPressure(p, L, 0).cp;

  const mdot1 = (p.s1Engine.thrustVac * p.s1EngineCount) / (p.s1Engine.ispVac * G0);
  const mdot2 = p.s2Engine.thrustVac / (p.s2Engine.ispVac * G0);

  return {
    parts: p,
    layout: L,
    wetMass: full.mass,
    stage1Fuel: f1,
    stage2Fuel: f2,
    thrust1SL,
    twr,
    dv1, dv2, dvTotal: dv1 + dv2,
    stabilityFull: (cpFull - full.cm) / DIAMETER,
    stabilityEmpty: (cpEmpty - burnout1.cm) / DIAMETER,
    burn1: f1 / mdot1,
    burn2: f2 / mdot2,
    twrStage2: p.s2Engine.thrustVac / (stage2Full.mass * 9.80665),
    length: L.totalLength,
  };
}

/** Предстартовые замечания — подсказки, но запуск не блокируют. */
export function preflightWarnings(s: DesignStats): { level: 'ok' | 'warn' | 'bad'; text: string }[] {
  const out: { level: 'ok' | 'warn' | 'bad'; text: string }[] = [];
  if (s.twr < 1.05) out.push({ level: 'bad', text: `ТВР ${s.twr.toFixed(2)} < 1 — ракета не оторвётся от стола.` });
  else if (s.twr < 1.25) out.push({ level: 'warn', text: `ТВР ${s.twr.toFixed(2)} низковат: большие гравитационные потери.` });
  else if (s.twr > 2.6) out.push({ level: 'warn', text: `ТВР ${s.twr.toFixed(2)} слишком велик: разгон в плотных слоях, риск разрушения на макс. напоре.` });
  else out.push({ level: 'ok', text: `ТВР ${s.twr.toFixed(2)} — в норме (1.3–2.2).` });

  const st = Math.min(s.stabilityFull, s.stabilityEmpty);
  if (st < 0.15) out.push({ level: 'bad', text: `Запас устойчивости ${st.toFixed(2)} клб — ЦД впереди ЦМ, неизбежен кувырок.` });
  else if (st < 0.7) out.push({ level: 'warn', text: `Запас устойчивости ${st.toFixed(2)} клб — на грани, ракету будет мотать.` });
  else if (st > 3.2) out.push({ level: 'warn', text: `Запас устойчивости ${st.toFixed(2)} клб — «флюгерит» за потоком, теряя тягу на разворот.` });
  else out.push({ level: 'ok', text: `Запас устойчивости ${st.toFixed(2)} клб — норма (0.8–2.5).` });

  if (s.dvTotal < 3400) out.push({ level: 'bad', text: `Суммарная Δv ${Math.round(s.dvTotal)} м/с — на орбиту нужно ≈3600–4200 м/с с учётом потерь.` });
  else if (s.dvTotal < 3900) out.push({ level: 'warn', text: `Суммарная Δv ${Math.round(s.dvTotal)} м/с — впритык, потери решат всё.` });
  else out.push({ level: 'ok', text: `Суммарная Δv ${Math.round(s.dvTotal)} м/с — запаса хватает.` });

  if (s.twrStage2 < 0.35) out.push({ level: 'warn', text: `ТВР 2-й ступени ${s.twrStage2.toFixed(2)} — разгон будет очень долгим.` });
  return out;
}
