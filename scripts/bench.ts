/**
 * Скорость интегратора: сколько шагов физики машина успевает за секунду.
 *
 * При ускорении времени ×50 цикл рендера просит до 2500 шагов на кадр, то есть
 * ~150 000 шагов в секунду. Этот прогон показывает, остался ли запас после
 * правок в `step()`.
 *
 *   npm run bench
 */

import { DT } from '../src/lib/constants';
import { DEFAULT_DESIGN } from '../src/lib/design';
import { createFlight, launch, step } from '../src/lib/physics';

const RUNS = 5;
let best = Infinity;
let steps = 0;

for (let run = 0; run < RUNS; run++) {
  const { state, stats } = createFlight(DEFAULT_DESIGN);
  launch(state);
  const t0 = process.hrtime.bigint();
  let n = 0;
  while (state.status === 'flying' && n < 200_000) {
    step(state, stats, DT);
    n++;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  steps = n;
  if (ms < best) best = ms;
}

const perSec = (steps / best) * 1000;
console.log(
  `${steps} шагов за ${best.toFixed(1)} мс — ${Math.round(perSec).toLocaleString('ru-RU')} шагов/с ` +
  `(кадру при ×50 нужно ~150 000/с)`,
);
