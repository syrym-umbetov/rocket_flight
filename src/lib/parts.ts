/** Каталог деталей: из них игрок собирает ракету. */

export interface NosePart {
  id: string;
  name: string;
  desc: string;
  cd: number;        // базовый коэффициент лобового сопротивления
  mass: number;      // кг
  length: number;    // м
  cpFactor: number;  // положение ЦД обтекателя в долях длины
  heatTol: number;   // множитель термостойкости
  wave: number;      // множитель волнового сопротивления на трансзвуке
}

export interface FinPart {
  id: string;
  name: string;
  desc: string;
  cna: number;       // производная нормальной силы — стабилизирующая способность
  cd: number;        // добавка к сопротивлению
  mass: number;      // кг
  span: number;      // размах, м (для отрисовки)
  chord: number;     // хорда, м
  swept: boolean;
}

export interface EnginePart {
  id: string;
  name: string;
  desc: string;
  thrustSL: number;  // Н у земли
  thrustVac: number; // Н в вакууме
  ispSL: number;     // с
  ispVac: number;    // с
  mass: number;      // кг
  gimbal: number;    // градусы отклонения сопла
  bell: number;      // радиус сопла, м (для отрисовки)
  stage: 1 | 2;
}

export interface TankPart {
  id: string;
  name: string;
  fuel: number;      // кг топлива
  dry: number;       // кг сухой массы
  length: number;    // м
  stage: 1 | 2;
}

export interface PayloadPart {
  id: string;
  name: string;
  desc: string;
  mass: number;      // кг
}

export const NOSES: NosePart[] = [
  {
    id: 'ogive', name: 'Оживальный', desc: 'Лучшая аэродинамика. Эталон для орбитальных РН.',
    cd: 0.19, mass: 260, length: 6.5, cpFactor: 0.466, heatTol: 1.15, wave: 0.7,
  },
  {
    id: 'cone', name: 'Конический', desc: 'Простой и лёгкий, чуть хуже на трансзвуке.',
    cd: 0.27, mass: 190, length: 5.5, cpFactor: 0.666, heatTol: 1.0, wave: 1.0,
  },
  {
    id: 'blunt', name: 'Затупленный', desc: 'Тяжёлый и тормозной, зато почти не греется.',
    cd: 0.44, mass: 320, length: 3.5, cpFactor: 0.5, heatTol: 1.8, wave: 1.8,
  },
  {
    id: 'flat', name: 'Плоский', desc: 'Огромное сопротивление. Заведомо плохой выбор.',
    cd: 1.5, mass: 150, length: 1.0, cpFactor: 0.5, heatTol: 0.55, wave: 3.0,
  },
];

export const FINS: FinPart[] = [
  {
    id: 'none', name: 'Без стабилизаторов', desc: 'ЦД уходит вперёд — ракета кувыркается.',
    cna: 0, cd: 0, mass: 0, span: 0, chord: 0, swept: false,
  },
  {
    id: 'small', name: 'Малые', desc: 'Лёгкие, но запаса устойчивости почти нет.',
    cna: 5.0, cd: 0.028, mass: 260, span: 1.3, chord: 2.6, swept: false,
  },
  {
    id: 'large', name: 'Большие трапеции', desc: 'Надёжная устойчивость ценой сопротивления.',
    cna: 11.5, cd: 0.062, mass: 520, span: 2.4, chord: 3.6, swept: true,
  },
  {
    id: 'grid', name: 'Решётчатые', desc: 'Сильное демпфирование, но очень тормозные.',
    cna: 8.5, cd: 0.105, mass: 430, span: 1.8, chord: 2.2, swept: false,
  },
];

export const ENGINES: EnginePart[] = [
  {
    id: 'pioneer', name: 'РД-«Пионер»', desc: 'Слабый и лёгкий. В одиночку поднимет только лёгкую РН.',
    thrustSL: 420_000, thrustVac: 480_000, ispSL: 272, ispVac: 302,
    mass: 900, gimbal: 4.5, bell: 0.85, stage: 1,
  },
  {
    id: 'kestrel', name: 'РД-«Кестрел»', desc: 'Средняя тяга, отличный кардан.',
    thrustSL: 720_000, thrustVac: 820_000, ispSL: 265, ispVac: 295,
    mass: 1_250, gimbal: 5, bell: 1.0, stage: 1,
  },
  {
    id: 'falcon', name: 'РД-«Фалькон»', desc: 'Мощный и экономичный, но тяжёлый.',
    thrustSL: 1_050_000, thrustVac: 1_180_000, ispSL: 285, ispVac: 312,
    mass: 2_000, gimbal: 6, bell: 1.15, stage: 1,
  },
  {
    id: 'titan', name: 'РД-«Титан»', desc: 'Огромная тяга, плохой удельный импульс и кардан.',
    thrustSL: 1_750_000, thrustVac: 1_920_000, ispSL: 248, ispVac: 276,
    mass: 3_300, gimbal: 2.5, bell: 1.4, stage: 1,
  },
  {
    id: 'nova', name: 'РД-«Нова-В»', desc: 'Вакуумный маршевый двигатель второй ступени.',
    thrustSL: 90_000, thrustVac: 210_000, ispSL: 180, ispVac: 342,
    mass: 700, gimbal: 4, bell: 0.9, stage: 2,
  },
  {
    id: 'aeon', name: 'РД-«Эон»', desc: 'Экономичный, но слабый: долгий разгон.',
    thrustSL: 30_000, thrustVac: 105_000, ispSL: 150, ispVac: 378,
    mass: 520, gimbal: 5, bell: 1.0, stage: 2,
  },
];

export const TANKS: TankPart[] = [
  { id: 's1-s', name: 'Бак S — 13 т', fuel: 13_000, dry: 2_400, length: 9, stage: 1 },
  { id: 's1-m', name: 'Бак M — 24 т', fuel: 24_000, dry: 4_200, length: 15, stage: 1 },
  { id: 's1-l', name: 'Бак L — 38 т', fuel: 38_000, dry: 6_400, length: 23, stage: 1 },
  { id: 's2-s', name: 'Бак S — 4 т', fuel: 4_000, dry: 1_100, length: 5, stage: 2 },
  { id: 's2-m', name: 'Бак M — 7.5 т', fuel: 7_500, dry: 1_900, length: 8, stage: 2 },
  { id: 's2-l', name: 'Бак L — 12 т', fuel: 12_000, dry: 2_900, length: 12.5, stage: 2 },
];

export const PAYLOADS: PayloadPart[] = [
  { id: 'cube', name: 'Кубсат — 1.5 т', desc: 'Минимальная масса, максимальная свобода.', mass: 1_500 },
  { id: 'sat', name: 'Спутник связи — 4 т', desc: 'Сбалансированная цель.', mass: 4_000 },
  { id: 'station', name: 'Модуль станции — 9 т', desc: 'Тяжёлая цель для мощной РН.', mass: 9_000 },
];

export const byId = <T extends { id: string }>(arr: T[], id: string): T =>
  arr.find((p) => p.id === id) ?? arr[0];
