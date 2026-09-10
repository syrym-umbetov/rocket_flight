'use client';

import type { Telemetry } from './types';

const fmt = (v: number, d = 0) =>
  !isFinite(v) ? '∞' : v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });

function alt(v: number) {
  if (!isFinite(v)) return '∞';
  // перицентр ниже поверхности означает лишь «упадём» — цифра бесполезна
  if (v < 0) return '—';
  return v >= 1000 ? `${fmt(v / 1000, 1)} км` : `${fmt(v)} м`;
}

const PHASE_RU: Record<string, string> = {
  prelaunch: 'Предстартовая подготовка',
  liftoff: 'Отрыв',
  pitchover: 'Манёвр тангажа',
  'gravity-turn': 'Гравитационный разворот',
  stage2: 'Работа второй ступени',
  coast: 'Баллистическая пауза',
  circularize: 'Довыведение',
  done: 'Полёт завершён',
};

export interface HudActions {
  cycleCamera: () => void;
  toggleAutopilot: () => void;
  warpDown: () => void;
  warpUp: () => void;
  pitch: (v: number) => void;
  throttle: (d: number) => void;
}

interface Props { t: Telemetry; warp: number; camera: string; mobile: boolean; actions: HudActions }

export default function HUD({ t, warp, camera, mobile, actions }: Props) {
  return mobile ? <MobileHUD t={t} warp={warp} camera={camera} actions={actions} />
    : <DesktopHUD t={t} warp={warp} camera={camera} />;
}

/* ---------------- телефон ---------------- */

function MobileHUD({ t, warp, camera, actions }: Omit<Props, 'mobile'>) {
  const last = t.events[t.events.length - 1];
  const qPct = Math.min(100, (t.q / 62_000) * 100);
  return (
    <>
      <div className="m-top">
        <div className="m-grid">
          <Cell label="Высота" value={alt(t.alt)} />
          <Cell label="Скорость" value={`${fmt(t.speed)} м/с`} />
          <Cell label="Апоцентр" value={alt(t.apoapsis)} />
          <Cell label="Перицентр" value={alt(t.periapsis)} />
        </div>
        <div className="m-grid m-grid-sec">
          <Cell label="Маха" value={fmt(t.mach, 1)} small />
          <Cell label="Перегр." value={`${fmt(t.gForce, 1)} g`} small />
          <Cell label="Угол атаки" value={`${fmt((t.aoa * 180) / Math.PI, 0)}°`} small
            warn={(t.aoa * 180) / Math.PI > 12 && t.q > 8000} />
          <Cell label="Напор" value={`${fmt(t.q / 1000, 1)} кПа`} small warn={t.q > 45_000} />
        </div>
        <div className="bar"><div className="bar-fill bar-q" style={{ width: `${qPct}%` }} /></div>
        <div className="m-phase">
          <span>T+{fmt(t.time)} с · {PHASE_RU[t.phase] ?? t.phase}</span>
          <span>{t.stage === 0 ? '1 ступень' : t.stage === 1 ? '2 ступень' : 'без тяги'}</span>
        </div>
        {last && <div className={`m-event log-${last.kind}`}>{last.text}</div>}
      </div>

      <div className="m-bottom">
        <div className="fuel-row">
          <FuelBar label="Ст. 1" v={t.fuel1} />
          <FuelBar label="Ст. 2" v={t.fuel2} />
          <FuelBar label="Тяга" v={t.throttle} accent />
        </div>
        <div className="m-buttons">
          <button className="tbtn" onClick={actions.cycleCamera}>{camera}</button>
          <button className={`tbtn${t.autopilot ? ' tbtn-on' : ''}`} onClick={actions.toggleAutopilot}>
            {t.autopilot ? 'Авто' : 'Ручное'}
          </button>
          <button className="tbtn" onClick={actions.warpDown}>−</button>
          <button className="tbtn tbtn-warp">×{warp}</button>
          <button className="tbtn" onClick={actions.warpUp}>+</button>
        </div>
        {!t.autopilot && (
          <div className="m-buttons">
            <button className="tbtn" onPointerDown={() => actions.pitch(-1)}
              onPointerUp={() => actions.pitch(0)} onPointerLeave={() => actions.pitch(0)}>▲ нос вверх</button>
            <button className="tbtn" onPointerDown={() => actions.pitch(1)}
              onPointerUp={() => actions.pitch(0)} onPointerLeave={() => actions.pitch(0)}>▼ нос вниз</button>
            <button className="tbtn" onClick={() => actions.throttle(-0.1)}>Тяга −</button>
            <button className="tbtn" onClick={() => actions.throttle(0.1)}>Тяга +</button>
          </div>
        )}
      </div>
    </>
  );
}

function Cell({ label, value, small, warn }: { label: string; value: string; small?: boolean; warn?: boolean }) {
  return (
    <div className={`cell${small ? ' cell-sm' : ''}`}>
      <span className="cell-label">{label}</span>
      <span className={`cell-value${warn ? ' row-warn' : ''}`}>{value}</span>
    </div>
  );
}

/* ---------------- десктоп ---------------- */

function DesktopHUD({ t, warp, camera }: { t: Telemetry; warp: number; camera: string }) {
  const qPct = Math.min(100, (t.q / 62_000) * 100);
  const aoaDeg = (t.aoa * 180) / Math.PI;
  return (
    <>
      <div className="hud hud-tl">
        <div className="hud-title">Телеметрия</div>
        <Row label="Высота" value={alt(t.alt)} />
        <Row label="Скорость" value={`${fmt(t.speed)} м/с`} />
        <Row label="Верт. скорость" value={`${fmt(t.vertSpeed)} м/с`} />
        <Row label="Число Маха" value={fmt(t.mach, 2)} />
        <Row label="Перегрузка" value={`${fmt(t.gForce, 1)} g`} />
        <Row label="Масса" value={`${fmt(t.mass / 1000, 1)} т`} />
        <Row label="Время" value={`T+${fmt(t.time, 0)} с`} />
      </div>

      <div className="hud hud-tr">
        <div className="hud-title">Орбита</div>
        <Row label="Апоцентр" value={alt(t.apoapsis)} />
        <Row label="Перицентр" value={alt(t.periapsis)} />
        <Row label="До апоцентра" value={isFinite(t.timeToApo) ? `${fmt(t.timeToApo)} с` : '—'} />
        <div className="hud-sep" />
        <Row label="Устойчивость" value={`${fmt(t.stability, 2)} клб`} warn={t.stability < 0.5} />
        <Row label="Угол атаки" value={`${fmt(aoaDeg, 1)}°`} warn={aoaDeg > 12 && t.q > 8000} />
        <Row label="Скор. напор" value={`${fmt(t.q / 1000, 1)} кПа`} warn={t.q > 45_000} />
        <div className="bar"><div className="bar-fill bar-q" style={{ width: `${qPct}%` }} /></div>
      </div>

      <div className="hud hud-bl">
        <div className="hud-title">Хроника полёта</div>
        <div className="log">
          {t.events.slice(-6).map((e, i) => (
            <div key={i} className={`log-line log-${e.kind}`}>
              <span className="log-t">T+{fmt(e.t)}</span> {e.text}
            </div>
          ))}
        </div>
      </div>

      <div className="hud hud-bc">
        <div className="stage-row">
          <span className={`chip ${t.stage === 0 ? 'chip-on' : 'chip-off'}`}>1 ступень</span>
          <span className={`chip ${t.stage === 1 ? 'chip-on' : 'chip-off'}`}>2 ступень</span>
          <span className="chip chip-mode">{PHASE_RU[t.phase] ?? t.phase}</span>
          <span className={`chip ${t.autopilot ? 'chip-on' : 'chip-warn'}`}>
            {t.autopilot ? 'Автопилот' : 'Ручное'}
          </span>
          <span className="chip chip-mode">×{warp}</span>
          <span className="chip chip-mode">Камера: {camera}</span>
        </div>
        <div className="fuel-row">
          <FuelBar label="Ступень 1" v={t.fuel1} />
          <FuelBar label="Ступень 2" v={t.fuel2} />
          <FuelBar label="Тяга" v={t.throttle} accent />
        </div>
      </div>
    </>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className={`row-value${warn ? ' row-warn' : ''}`}>{value}</span>
    </div>
  );
}

function FuelBar({ label, v, accent }: { label: string; v: number; accent?: boolean }) {
  return (
    <div className="fuel">
      <span className="fuel-label">{label}</span>
      <div className="bar">
        <div className={`bar-fill ${accent ? 'bar-thr' : 'bar-fuel'}`}
          style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
      </div>
    </div>
  );
}
