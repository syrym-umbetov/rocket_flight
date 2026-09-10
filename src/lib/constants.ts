/** Физические константы мира (планета уменьшенного масштаба — как в KSP). */

export const G0 = 9.80665;                 // м/с², для расчёта удельного импульса
export const R_PLANET = 600_000;           // радиус планеты, м
export const MU = 3.5316e12;               // гравитационный параметр, м³/с²
export const ATMO_TOP = 70_000;            // граница атмосферы, м
export const SCALE_HEIGHT = 5_600;         // высота однородной атмосферы, м
export const RHO_SL = 1.225;               // плотность воздуха у земли, кг/м³
export const P_SL = 101_325;               // давление у земли, Па
export const ORBIT_MIN_PE = 72_000;        // минимальный перицентр для «орбиты», м

export const DT = 0.02;                    // шаг интегрирования, с

/** Плотность атмосферы на высоте alt (м). */
export function density(alt: number): number {
  if (alt >= ATMO_TOP || alt < -100) return 0;
  return RHO_SL * Math.exp(-Math.max(alt, 0) / SCALE_HEIGHT);
}

/** Атмосферное давление в долях от давления у поверхности (0..1). */
export function pressureRatio(alt: number): number {
  if (alt >= ATMO_TOP || alt < 0) return 0;
  return Math.exp(-alt / SCALE_HEIGHT);
}

/** Скорость звука — грубая модель по высоте. */
export function soundSpeed(alt: number): number {
  if (alt < 11_000) return 340 - alt * 0.0037;
  return 299;
}

/** Ускорение свободного падения на расстоянии r от центра. */
export function gravityAt(r: number): number {
  return MU / (r * r);
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
