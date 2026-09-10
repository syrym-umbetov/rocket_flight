'use client';

import { ENGINES, FINS, NOSES, PAYLOADS, TANKS } from '@/lib/parts';
import { preflightWarnings, type Design, type DesignStats } from '@/lib/design';

interface Props {
  design: Design;
  stats: DesignStats;
  onChange: (patch: Partial<Design>) => void;
  onLaunch: () => void;
  onPreset: (name: 'good' | 'bad') => void;
}

const fmt = (v: number, d = 0) => v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });

export default function BuilderPanel({ design, stats, onChange, onLaunch, onPreset }: Props) {
  const s1Engines = ENGINES.filter((e) => e.stage === 1);
  const s2Engines = ENGINES.filter((e) => e.stage === 2);
  const s1Tanks = TANKS.filter((t) => t.stage === 1);
  const s2Tanks = TANKS.filter((t) => t.stage === 2);
  const checks = preflightWarnings(stats);
  const fatal = checks.filter((c) => c.level === 'bad').length;

  return (
    <>
      <aside className="panel panel-left">
        <h1 className="brand">
          <span className="brand-mark">▲</span> Конструктор орбитальной РН
        </h1>
        <p className="brand-sub">
          Соберите ракету, проверьте расчёт и запускайте. Плохая компоновка развалится в атмосфере —
          хорошая выйдет на орбиту.
        </p>

        <Group title="Головной обтекатель">
          {NOSES.map((n) => (
            <Opt key={n.id} on={design.nose === n.id} onClick={() => onChange({ nose: n.id })}
              title={n.name} sub={`Cx ${n.cd.toFixed(2)} · ${n.mass} кг`} desc={n.desc} />
          ))}
        </Group>

        <Group title="Стабилизаторы">
          {FINS.map((f) => (
            <Opt key={f.id} on={design.fins === f.id} onClick={() => onChange({ fins: f.id })}
              title={f.name} sub={f.cna ? `CNα ${f.cna} · ${f.mass} кг` : 'нет'} desc={f.desc} />
          ))}
        </Group>

        <Group title="Полезная нагрузка">
          {PAYLOADS.map((p) => (
            <Opt key={p.id} on={design.payload === p.id} onClick={() => onChange({ payload: p.id })}
              title={p.name} sub={`${fmt(p.mass / 1000, 1)} т`} desc={p.desc} />
          ))}
        </Group>
      </aside>

      <aside className="panel panel-right">
        <Group title="Двигатель 1-й ступени">
          {s1Engines.map((e) => (
            <Opt key={e.id} on={design.s1Engine === e.id} onClick={() => onChange({ s1Engine: e.id })}
              title={e.name} sub={`${fmt(e.thrustSL / 1000)} кН · Iуд ${e.ispSL}/${e.ispVac} с · кардан ${e.gimbal}°`}
              desc={e.desc} />
          ))}
          <div className="counter">
            <span>Число двигателей</span>
            <div className="counter-btns">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} className={`cbtn${design.s1EngineCount === n ? ' cbtn-on' : ''}`}
                  onClick={() => onChange({ s1EngineCount: n })}>{n}</button>
              ))}
            </div>
          </div>
        </Group>

        <Group title="Бак 1-й ступени">
          {s1Tanks.map((t) => (
            <Opt key={t.id} on={design.s1Tank === t.id} onClick={() => onChange({ s1Tank: t.id })}
              title={t.name} sub={`сухая масса ${fmt(t.dry / 1000, 1)} т · ${t.length} м`} />
          ))}
        </Group>

        <Group title="Вторая ступень">
          {s2Engines.map((e) => (
            <Opt key={e.id} on={design.s2Engine === e.id} onClick={() => onChange({ s2Engine: e.id })}
              title={e.name} sub={`${fmt(e.thrustVac / 1000)} кН в вакууме · Iуд ${e.ispVac} с`} desc={e.desc} />
          ))}
          {s2Tanks.map((t) => (
            <Opt key={t.id} on={design.s2Tank === t.id} onClick={() => onChange({ s2Tank: t.id })}
              title={t.name} sub={`сухая масса ${fmt(t.dry / 1000, 1)} т · ${t.length} м`} />
          ))}
        </Group>
      </aside>

      <section className="panel panel-bottom">
        <div className="stats">
          <Stat label="Стартовая масса" value={`${fmt(stats.wetMass / 1000, 1)} т`} />
          <Stat label="Тяга у земли" value={`${fmt(stats.thrust1SL / 1000)} кН`} />
          <Stat label="ТВР" value={fmt(stats.twr, 2)} tone={stats.twr < 1.05 ? 'bad' : stats.twr > 2.6 ? 'warn' : 'ok'} />
          <Stat label="Δv суммарная" value={`${fmt(stats.dvTotal)} м/с`} tone={stats.dvTotal < 3400 ? 'bad' : stats.dvTotal < 3900 ? 'warn' : 'ok'} />
          <Stat label="Запас устойчивости" value={`${fmt(stats.stabilityFull, 2)} клб`}
            tone={stats.stabilityFull < 0.15 ? 'bad' : stats.stabilityFull < 0.7 ? 'warn' : 'ok'} />
          <Stat label="Длина" value={`${fmt(stats.length, 1)} м`} />
          <Stat label="Работа 1 ст." value={`${fmt(stats.burn1)} с`} />
          <Stat label="Работа 2 ст." value={`${fmt(stats.burn2)} с`} />
        </div>

        <div className="checks">
          {checks.map((c, i) => (
            <div key={i} className={`check check-${c.level}`}>
              <span className="check-dot" />{c.text}
            </div>
          ))}
        </div>

        <div className="launch-row">
          <button className="ghost" onClick={() => onPreset('good')}>Пример удачной РН</button>
          <button className="ghost" onClick={() => onPreset('bad')}>Пример провальной РН</button>
          <button className={`launch${fatal ? ' launch-risky' : ''}`} onClick={onLaunch}>
            {fatal ? 'Всё равно запустить' : 'Запуск'}
          </button>
        </div>
      </section>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="group">
      <div className="group-title">{title}</div>
      {children}
    </div>
  );
}

function Opt({ on, onClick, title, sub, desc }: {
  on: boolean; onClick: () => void; title: string; sub: string; desc?: string;
}) {
  return (
    <button className={`opt${on ? ' opt-on' : ''}`} onClick={onClick}>
      <span className="opt-title">{title}</span>
      <span className="opt-sub">{sub}</span>
      {desc && <span className="opt-desc">{desc}</span>}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value${tone ? ` stat-${tone}` : ''}`}>{value}</span>
    </div>
  );
}
