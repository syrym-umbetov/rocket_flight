/**
 * Что переживает перезагрузку страницы: последняя компоновка, рекорды по
 * каждой полезной нагрузке и ссылка, которой можно поделиться.
 *
 * Всё в localStorage, и всё в try/catch: в приватном режиме и при
 * запрещённых сайтовых данных обращение к хранилищу бросает исключение,
 * а игра должна просто работать без сохранений.
 */

import { DEFAULT_DESIGN, type Design } from './design';
import { ENGINES, FINS, NOSES, PAYLOADS, TANKS } from './parts';
import { clamp } from './constants';

const DESIGN_KEY = 'rocket-flight.design';
const RECORDS_KEY = 'rocket-flight.records';
const SHARE_PARAM = 'd';

/** Компоновка в строку для ссылки: идентификаторы деталей через точку. */
export function encodeDesign(d: Design): string {
  return [
    d.nose, d.fins, d.payload,
    d.s1Engine, d.s1Tank, String(d.s1EngineCount),
    d.s2Engine, d.s2Tank,
  ].join('.');
}

const has = (list: { id: string }[], id: string) => list.some((x) => x.id === id);

/**
 * Разбор строки компоновки. Каждое поле проверяется по каталогу деталей:
 * чужая или устаревшая ссылка даёт не сломанную ракету, а значение по умолчанию.
 */
export function decodeDesign(code: string | null | undefined): Design | null {
  if (!code) return null;
  const [nose, fins, payload, s1Engine, s1Tank, count, s2Engine, s2Tank] = code.split('.');
  const n = Number(count);
  const d: Design = {
    nose: has(NOSES, nose) ? nose : DEFAULT_DESIGN.nose,
    fins: has(FINS, fins) ? fins : DEFAULT_DESIGN.fins,
    payload: has(PAYLOADS, payload) ? payload : DEFAULT_DESIGN.payload,
    s1Engine: has(ENGINES, s1Engine) ? s1Engine : DEFAULT_DESIGN.s1Engine,
    s1Tank: has(TANKS, s1Tank) ? s1Tank : DEFAULT_DESIGN.s1Tank,
    s1EngineCount: Number.isFinite(n) ? clamp(Math.round(n), 1, 4) : DEFAULT_DESIGN.s1EngineCount,
    s2Engine: has(ENGINES, s2Engine) ? s2Engine : DEFAULT_DESIGN.s2Engine,
    s2Tank: has(TANKS, s2Tank) ? s2Tank : DEFAULT_DESIGN.s2Tank,
  };
  return d;
}

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* приватный режим — просто живём без сохранений */
  }
}

/** Компоновка из ссылки, иначе из прошлой сессии, иначе `null`. */
export function loadDesign(): Design | null {
  if (typeof window === 'undefined') return null;
  const fromUrl = decodeDesign(
    new URLSearchParams(window.location.hash.replace(/^#/, '')).get(SHARE_PARAM),
  );
  if (fromUrl) {
    // Ссылка задаёт стартовую компоновку один раз. Дальше игрок правит её сам,
    // и после перезагрузки должна открыться его версия — поэтому адрес чистим,
    // а присланную компоновку сразу кладём в хранилище.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    saveDesign(fromUrl);
    return fromUrl;
  }
  return decodeDesign(readStore(DESIGN_KEY));
}

export function saveDesign(d: Design) {
  if (typeof window === 'undefined') return;
  writeStore(DESIGN_KEY, encodeDesign(d));
}

/** Ссылка на текущую компоновку. */
export function shareUrl(d: Design): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${SHARE_PARAM}=${encodeDesign(d)}`;
}

export type Records = Record<string, number>;

/** Лучший результат по каждой полезной нагрузке. */
export function loadRecords(): Records {
  const raw = readStore(RECORDS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Records = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Записывает результат, если он лучше прежнего. Возвращает обновлённую таблицу. */
export function saveRecord(records: Records, payloadId: string, score: number): Records {
  if (!(score > (records[payloadId] ?? 0))) return records;
  const next = { ...records, [payloadId]: score };
  writeStore(RECORDS_KEY, JSON.stringify(next));
  return next;
}
