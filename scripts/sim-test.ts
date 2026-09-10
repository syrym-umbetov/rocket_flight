/**
 * Регрессионный прогон баланса без браузера.
 *
 * Каждая компоновка объявляет ожидаемый исход: скрипт не просто печатает
 * результат, а сверяет его и завершается с кодом 1 при расхождении —
 * поэтому правка характеристик деталей или физики, ломающая баланс,
 * видна сразу, а не в браузере.
 *
 *   npm test           — сводка и итог
 *   npm test -- -v     — плюс подробности по каждому прогону
 */

import { DEFAULT_DESIGN, analyze, type Design } from '../src/lib/design';
import { ORBIT_MIN_PE, simulate, type SimState } from '../src/lib/physics';

/** Исход прогона в терминах игры. */
type Outcome = 'orbit' | 'crash' | 'short' | 'timeout';

const OUTCOME_RU: Record<Outcome, string> = {
  orbit: 'ОРБИТА ',
  crash: 'КРАХ   ',
  short: 'НЕДОЛЁТ',
  timeout: 'ТАЙМАУТ',
};

/** Как игрок увидит результат: орбита, авария, нехватка Δv или зависание. */
function outcomeOf(s: SimState): Outcome {
  if (s.status === 'orbit') return 'orbit';
  if (s.status === 'destroyed') return 'crash';
  if (s.doomed) return 'short';
  return 'timeout';
}

interface Case {
  name: string;
  d: Design;
  expect: Outcome;
  /** Чем именно кейс интересен — попадает в вывод при расхождении. */
  why: string;
}

const cases: Case[] = [
  {
    name: 'Эталон (по умолчанию)', d: { ...DEFAULT_DESIGN },
    expect: 'orbit', why: 'стартовая компоновка обязана выводить нагрузку',
  },
  {
    name: 'Без стабилизаторов', d: { ...DEFAULT_DESIGN, fins: 'none' },
    expect: 'crash', why: 'ЦД впереди ЦМ — кувырок в потоке',
  },
  {
    name: 'Малые стабилизаторы', d: { ...DEFAULT_DESIGN, fins: 'small' },
    expect: 'orbit', why: 'минимального запаса устойчивости должно хватать',
  },
  {
    name: 'Решётчатые стабилизаторы', d: { ...DEFAULT_DESIGN, fins: 'grid' },
    expect: 'orbit', why: 'тормозные, но рабочие',
  },
  {
    name: 'Плоский обтекатель', d: { ...DEFAULT_DESIGN, nose: 'flat' },
    expect: 'crash', why: 'заведомо плохой выбор — нагрев и сопротивление',
  },
  {
    name: 'Затупленный обтекатель', d: { ...DEFAULT_DESIGN, nose: 'blunt' },
    expect: 'orbit', why: 'тормозной, но не смертельный',
  },
  {
    name: 'Кестрел + бак L + станция', d: { ...DEFAULT_DESIGN, s1Tank: 's1-l', payload: 'station' },
    expect: 'orbit', why: 'тяжёлая нагрузка при ТВР ≈ 1.1 всё ещё выводится',
  },
  {
    name: 'Кестрел + баки L + станция',
    d: { ...DEFAULT_DESIGN, s1Tank: 's1-l', s2Tank: 's2-l', payload: 'station' },
    expect: 'short', why: 'ТВР ≈ 1.0: гравитационные потери съедают запас Δv',
  },
  {
    name: 'Станция на баках S', d: { ...DEFAULT_DESIGN, payload: 'station', s1Tank: 's1-s', s2Tank: 's2-s' },
    expect: 'crash', why: 'Δv вдвое меньше нужной',
  },
  {
    name: 'Эон 2-й ступени + станция',
    d: { ...DEFAULT_DESIGN, s2Engine: 'aeon', payload: 'station', s1Engine: 'falcon', s1Tank: 's1-l' },
    expect: 'short', why: 'экономичный, но слабый — долгий разгон стоит перицентра',
  },
  {
    name: 'Плоский обтекатель + станция',
    d: { ...DEFAULT_DESIGN, nose: 'flat', payload: 'station', s1Tank: 's1-l', s1Engine: 'falcon' },
    expect: 'short', why: 'сопротивление съедает Δv даже на мощной РН',
  },
  {
    name: 'Пионер ×1 + баки L + станция',
    d: { ...DEFAULT_DESIGN, s1Engine: 'pioneer', s1Tank: 's1-l', s2Tank: 's2-l', payload: 'station' },
    expect: 'crash', why: 'ТВР < 1 — ракета не отрывается от стола',
  },
  {
    name: 'Пионер ×2 + кубсат',
    d: { ...DEFAULT_DESIGN, s1Engine: 'pioneer', s1EngineCount: 2, s1Tank: 's1-m', s2Tank: 's2-s', payload: 'cube' },
    expect: 'orbit', why: 'связка слабых двигателей — рабочая стратегия',
  },
  {
    name: 'Титан ×4', d: { ...DEFAULT_DESIGN, s1Engine: 'titan', s1EngineCount: 4 },
    expect: 'crash', why: 'ТВР 12 — разрушение скоростным напором',
  },
  {
    name: 'Титан ×2 + бак L + станция',
    d: { ...DEFAULT_DESIGN, s1Engine: 'titan', s1EngineCount: 2, s1Tank: 's1-l', s2Tank: 's2-l', payload: 'station' },
    expect: 'crash', why: 'избыточная тяга губительна и на тяжёлой РН',
  },
  {
    name: 'Мало топлива', d: { ...DEFAULT_DESIGN, s1Tank: 's1-s', s2Tank: 's2-s' },
    expect: 'crash', why: 'ранняя отсечка 1-й ступени в плотных слоях',
  },
  {
    name: 'Фалькон + бак L + станция',
    d: { ...DEFAULT_DESIGN, s1Engine: 'falcon', s1Tank: 's1-l', s2Tank: 's2-l', payload: 'station' },
    expect: 'orbit', why: 'эталонная тяжёлая РН',
  },
  {
    name: 'Фалькон L + Эон', d: { ...DEFAULT_DESIGN, s1Engine: 'falcon', s1Tank: 's1-l', s2Engine: 'aeon' },
    expect: 'orbit', why: 'экономичная вторая ступень с запасом Δv',
  },
  {
    name: 'Кубсат на баках S', d: { ...DEFAULT_DESIGN, payload: 'cube', s1Tank: 's1-s', s2Tank: 's2-s' },
    expect: 'orbit', why: 'самая лёгкая рабочая РН',
  },
];

const verbose = process.argv.includes('-v') || process.argv.includes('--verbose');
const km = (v: number) => (isFinite(v) ? (v / 1000).toFixed(0) : '∞');

let failed = 0;

for (const c of cases) {
  const st = analyze(c.d);
  const { state } = simulate(c.d);
  const got = outcomeOf(state);
  const ok = got === c.expect;

  // Прогон, кроме исхода, не должен разваливать саму модель.
  const finite =
    isFinite(state.t) && isFinite(state.alt) && isFinite(state.speed) && isFinite(state.mass);
  const orbitSane = got !== 'orbit' || state.orbit.periapsis >= ORBIT_MIN_PE;

  if (!ok || !finite || !orbitSane) failed++;

  const mark = ok && finite && orbitSane ? '  ok  ' : ' FAIL ';
  console.log(
    `${mark}${OUTCOME_RU[got]} | ТВР ${st.twr.toFixed(2)} | уст ${st.stabilityFull.toFixed(2)}/` +
    `${st.stabilityEmpty.toFixed(2)} клб | Δv ${Math.round(st.dvTotal)} | ${c.name}`,
  );
  if (!ok) console.log(`        └─ ожидали «${OUTCOME_RU[c.expect].trim()}»: ${c.why}`);
  if (!finite) console.log('        └─ в состоянии появились NaN/Infinity');
  if (!orbitSane) console.log(`        └─ орбита засчитана при перицентре ${km(state.orbit.periapsis)} км`);
  if (verbose || !ok) {
    console.log(
      `        t=${state.t.toFixed(0)}с maxQ=${(state.maxQ / 1000).toFixed(0)}кПа ` +
      `нагрев=${(state.heatLoad / 1000).toFixed(0)} Ap=${km(state.orbit.apoapsis)} Pe=${km(state.orbit.periapsis)}` +
      (state.message ? ` — ${state.message}` : ''),
    );
  }
}

console.log(
  failed === 0
    ? `\nВсе ${cases.length} компоновок дали ожидаемый исход.`
    : `\nРасхождений: ${failed} из ${cases.length}.`,
);
process.exit(failed === 0 ? 0 : 1);
