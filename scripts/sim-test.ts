import { DEFAULT_DESIGN, analyze, type Design } from '../src/lib/design';
import { simulate } from '../src/lib/physics';

const cases: { name: string; d: Design }[] = [
  { name: 'ЭТАЛОН (по умолчанию)', d: { ...DEFAULT_DESIGN } },
  { name: 'Без стабилизаторов', d: { ...DEFAULT_DESIGN, fins: 'none' } },
  { name: 'Малые стабилизаторы', d: { ...DEFAULT_DESIGN, fins: 'small' } },
  { name: 'Плоский нос', d: { ...DEFAULT_DESIGN, nose: 'flat' } },
  { name: 'Затупленный нос', d: { ...DEFAULT_DESIGN, nose: 'blunt' } },
  { name: 'Кестрел + L бак + станция (ТВР 1.1)', d: { ...DEFAULT_DESIGN, s1Tank: 's1-l', s1Engine: 'kestrel', payload: 'station' } },
  { name: 'ТВР < 1: Эон на 1-й ступени невозможен, берём L бак + станция + L верх', d: { ...DEFAULT_DESIGN, s1Tank: 's1-l', s1Engine: 'kestrel', s2Tank: 's2-l', payload: 'station' } },
  { name: 'Тяжёлая ПН на малых баках (мало Δv)', d: { ...DEFAULT_DESIGN, payload: 'station', s1Tank: 's1-s', s2Tank: 's2-s' } },
  { name: 'Эон 2-я ступень + тяжёлая ПН', d: { ...DEFAULT_DESIGN, s2Engine: 'aeon', payload: 'station', s1Engine: 'falcon', s1Tank: 's1-l' } },
  { name: 'Плоский нос + станция', d: { ...DEFAULT_DESIGN, nose: 'flat', payload: 'station', s1Tank: 's1-l', s1Engine: 'falcon' } },
  { name: 'ТВР<1: Пионер x1 + L баки + станция', d: { ...DEFAULT_DESIGN, s1Engine: 'pioneer', s1Tank: 's1-l', s2Tank: 's2-l', payload: 'station' } },
  { name: 'Пионер x2 + S баки + кубсат', d: { ...DEFAULT_DESIGN, s1Engine: 'pioneer', s1EngineCount: 2, s1Tank: 's1-m', s2Tank: 's2-s', payload: 'cube' } },
  { name: 'Решётчатые стабилизаторы', d: { ...DEFAULT_DESIGN, fins: 'grid' } },
  { name: '4x Титан (перегон)', d: { ...DEFAULT_DESIGN, s1Engine: 'titan', s1EngineCount: 4 } },
  { name: 'Мало топлива', d: { ...DEFAULT_DESIGN, s1Tank: 's1-s', s2Tank: 's2-s' } },
  { name: 'Фалькон + L бак + тяжёлая ПН', d: { ...DEFAULT_DESIGN, s1Engine: 'falcon', s1Tank: 's1-l', s2Tank: 's2-l', payload: 'station' } },
  { name: 'Фалькон L + Эон', d: { ...DEFAULT_DESIGN, s1Engine: 'falcon', s1Tank: 's1-l', s2Engine: 'aeon', s2Tank: 's2-m' } },
  { name: 'Титан x2, L бак', d: { ...DEFAULT_DESIGN, s1Engine: 'titan', s1EngineCount: 2, s1Tank: 's1-l', s2Tank: 's2-l', payload: 'station' } },
  { name: 'Лёгкая: кубсат, S баки', d: { ...DEFAULT_DESIGN, payload: 'cube', s1Tank: 's1-s', s2Tank: 's2-s' } },
];

for (const c of cases) {
  const st = analyze(c.d);
  const { state } = simulate(c.d);
  const res = state.status === 'orbit' ? 'ОРБИТА ' : state.doomed ? 'ПРОВАЛ ' : state.status === 'flying' ? 'ТАЙМАУТ' : 'КРАХ   ';
  console.log(
    `${res} | ТВР ${st.twr.toFixed(2)} | уст ${st.stabilityFull.toFixed(2)}/${st.stabilityEmpty.toFixed(2)} клб | Δv ${Math.round(st.dvTotal)} | ` +
    `t=${state.t.toFixed(0)}с maxQ=${(state.maxQ / 1000).toFixed(0)}кПа heat=${(state.maxHeat / 1000).toFixed(1)} load=${(state.heatLoad / 1000).toFixed(0)}  Ap=${(state.orbit.apoapsis / 1000).toFixed(0)} Pe=${(state.orbit.periapsis / 1000).toFixed(0)} | ${c.name}`
  );
  if (state.status !== 'orbit') console.log(`         └─ ${state.message}`);
}
