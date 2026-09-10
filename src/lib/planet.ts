/**
 * Процедурная планета: рельеф генерируется трёхмерным градиентным шумом,
 * который сэмплируется прямо на сфере. Поэтому карта сходится по шву долготы
 * и не размазывается у полюсов — чего не даёт шум, посчитанный в плоскости UV.
 *
 * За один проход строятся три карты: цвет, высоты (для рельефа) и
 * шероховатость — океан должен бликовать на солнце, суша нет.
 */

const F = new Float32Array(3);

/** Классический градиентный шум Перлина с воспроизводимой перестановкой. */
function makeNoise(seed: number) {
  const perm = new Uint8Array(512);
  const src = new Uint8Array(256);
  for (let i = 0; i < 256; i++) src[i] = i;
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = src[i]; src[i] = src[j]; src[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = src[i & 255];

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h: number, x: number, y: number, z: number) => {
    switch (h & 15) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x + z; case 5: return -x + z; case 6: return x - z; case 7: return -x - z;
      case 8: return y + z; case 9: return -y + z; case 10: return y - z; case 11: return -y - z;
      case 12: return y + x; case 13: return -y + z; case 14: return y - x; default: return -y - z;
    }
  };

  return (x: number, y: number, z: number) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    const l = (a: number, b: number, t: number) => a + t * (b - a);
    return l(
      l(l(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
        l(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      l(l(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
        l(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  };
}

type Noise = ReturnType<typeof makeNoise>;

function fbm(n: Noise, x: number, y: number, z: number, octaves: number, gain = 0.5, lac = 2.03) {
  let a = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += a * n(x * f, y * f, z * f);
    norm += a;
    a *= gain; f *= lac;
  }
  return sum / norm;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export interface PlanetMaps {
  w: number;
  h: number;
  color: Uint8Array;
  height: Uint8Array;
  rough: Uint8Array;
  clouds: Uint8Array;
  lights: Uint8Array;
}

/** Палитра биомов: глубина/суша/высота, поверх — широтные пояса. */
function biome(h: number, moisture: number, lat: number, out: Float32Array) {
  const SEA = 0.5;
  if (h < SEA) {
    // океан: от глубокой синевы к шельфовой бирюзе
    const d = smooth(SEA - 0.16, SEA, h);
    out[0] = mix(0.02, 0.09, d);
    out[1] = mix(0.09, 0.34, d);
    out[2] = mix(0.24, 0.44, d);
    return;
  }
  const land = (h - SEA) / (1 - SEA);       // 0 у берега, 1 на вершинах
  // сушу красим по влажности: пустыня — трава — лес
  const dry = clamp01(moisture * 0.75 + smooth(0.55, 0.18, Math.abs(lat)) * 0.45);
  let r = mix(0.62, 0.19, dry), g = mix(0.55, 0.36, dry), b = mix(0.34, 0.15, dry);
  // пляжная полоса
  const beach = smooth(0.035, 0.0, land);
  r = mix(r, 0.76, beach); g = mix(g, 0.71, beach); b = mix(b, 0.52, beach);
  // скалы выше границы леса
  const rock = smooth(0.34, 0.58, land);
  r = mix(r, 0.40, rock); g = mix(g, 0.36, rock); b = mix(b, 0.33, rock);
  // снег на вершинах — тем ниже, чем ближе к полюсу
  const snowLine = mix(0.72, 0.24, smooth(0.35, 1.2, Math.abs(lat)));
  const snow = smooth(snowLine, snowLine + 0.12, land);
  out[0] = mix(r, 0.93, snow); out[1] = mix(g, 0.95, snow); out[2] = mix(b, 0.97, snow);
}

/**
 * Строит все карты планеты за один проход по пикселям.
 * @param w ширина карты; высота вдвое меньше
 */
export function generatePlanet(w = 1024): PlanetMaps {
  const h = w >> 1;
  const nBase = makeNoise(20250605);
  const nDetail = makeNoise(778291);
  const nWarp = makeNoise(4410912);
  const nMoist = makeNoise(31337);
  const nCloud = makeNoise(90210);

  const px = w * h * 4;
  const color = new Uint8Array(px), height = new Uint8Array(px), rough = new Uint8Array(px);
  const clouds = new Uint8Array(px), lights = new Uint8Array(px);

  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI;   // +π/2 север … −π/2 юг
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w * 2 - 1) * Math.PI;
      // точка на единичной сфере — шум берётся здесь, поэтому шва нет
      const x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);

      // искажение области выпрямляет слишком «шумные» береговые линии
      const wx = fbm(nWarp, x * 2.7, y * 2.7, z * 2.7, 2) * 0.28;
      const base = fbm(nBase, x * 1.35 + wx, y * 1.35 + wx, z * 1.35 + wx, 4);
      const det = fbm(nDetail, x * 5.4, y * 5.4, z * 5.4, 4);
      let hh = 0.5 + base * 0.52 + det * 0.13;
      // Дальше идут самые дорогие выборки шума. Больше половины карты — океан,
      // где ни хребты, ни влажность, ни огни не нужны, поэтому считаем их
      // только там, где они видны.
      const landish = hh > 0.47;
      if (landish) {
        // хребты: гребни там, где шум близок к нулю, и только на суше
        const ridge = 1 - Math.abs(fbm(nDetail, x * 3.1 + 11, y * 3.1, z * 3.1, 3));
        hh += ridge * ridge * 0.2 * smooth(0.5, 0.62, hh);
      }
      hh = clamp01(hh);

      const moist = landish ? clamp01(0.5 + fbm(nMoist, x * 2.2, y * 2.2, z * 2.2, 3) * 0.9) : 0.5;

      // полярные шапки: морской лёд и наледь на суше
      const ice = smooth(0.62, 0.92, Math.abs(sl));
      biome(hh, moist, lat, F);
      let r = F[0], g = F[1], b = F[2];
      if (ice > 0) {
        r = mix(r, 0.94, ice); g = mix(g, 0.96, ice); b = mix(b, 0.99, ice);
      }

      const k = (j * w + i) * 4;
      color[k] = r * 255; color[k + 1] = g * 255; color[k + 2] = b * 255; color[k + 3] = 255;

      // карта высот: под водой ровно, на суше — рельеф
      const relief = hh < 0.5 ? 0.5 : hh;
      const hv = relief * 255;
      height[k] = hv; height[k + 1] = hv; height[k + 2] = hv; height[k + 3] = 255;

      // шероховатость в канале G: гладкий океан бликует, суша матовая
      const isSea = hh < 0.5 ? 1 : 0;
      const rg = mix(0.92, 0.13, isSea * (1 - ice));
      rough[k] = 255; rough[k + 1] = rg * 255; rough[k + 2] = 0; rough[k + 3] = 255;

      // облака: широтные пояса плюс объёмный шум
      const band = 0.55 + 0.45 * Math.cos(lat * 6.1);
      const cv = fbm(nCloud, x * 2.9, y * 2.9, z * 2.9, 4, 0.55);
      const cover = smooth(0.06, 0.44, cv * band + 0.06);
      clouds[k] = 255; clouds[k + 1] = 255; clouds[k + 2] = 255;
      clouds[k + 3] = cover * 252;

      // огни городов: на суше, в умеренных широтах, пятнами
      const urban = hh > 0.5
        ? smooth(0.55, 0.85, moist) * (1 - ice)
          * smooth(0.62, 0.42, Math.abs(sl)) * smooth(0.52, 0.62, 1 - Math.abs(hh - 0.54) * 6)
        : 0;
      const lv = urban > 0.01
        ? clamp01(urban * clamp01(fbm(nDetail, x * 26, y * 26, z * 26, 2) * 1.6 + 0.15) * 2.4)
        : 0;
      lights[k] = lv * 255; lights[k + 1] = lv * 216; lights[k + 2] = lv * 150; lights[k + 3] = 255;
    }
  }

  return { w, h, color, height, rough, clouds, lights };
}
