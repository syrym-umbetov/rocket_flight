'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DT, R_PLANET, pressureRatio } from '@/lib/constants';
import { DEFAULT_DESIGN, analyze, resolveParts, layout, type Design, type DesignStats } from '@/lib/design';
import { createFlight, launch as igniteRocket, step, type SimState } from '@/lib/physics';
import { loadKit, type Kit } from '@/lib/kit';
import { buildRocket, updatePlume, type RocketMeshes } from '@/lib/rocketMesh';
import {
  createWorld, makeExplosion, pushTrail, resetTrail, triggerExplosion, updateExplosion,
  type Explosion, type World,
} from '@/lib/scene';
import {
  loadDesign, loadRecords, saveDesign, saveRecord, shareUrl, type Records,
} from '@/lib/storage';
import { isMobileNow, useMobile } from '@/lib/useMobile';
import BuilderPanel from './BuilderPanel';
import HUD, { type HudActions } from './HUD';
import type { Telemetry } from './types';

type Mode = 'build' | 'flight';
type CamMode = 'chase' | 'side' | 'orbit';
const CAM_RU: Record<CamMode, string> = { chase: 'сопровождение', side: 'сбоку', orbit: 'обзор' };
const CAM_SHORT: Record<CamMode, string> = { chase: 'Хвост', side: 'Сбоку', orbit: 'Обзор' };

const GOOD_PRESET: Design = {
  nose: 'ogive', fins: 'large', payload: 'sat',
  s1Engine: 'kestrel', s1Tank: 's1-m', s1EngineCount: 1,
  s2Engine: 'nova', s2Tank: 's2-m',
};
const BAD_PRESET: Design = {
  nose: 'flat', fins: 'none', payload: 'station',
  s1Engine: 'titan', s1Tank: 's1-s', s1EngineCount: 3,
  s2Engine: 'aeon', s2Tank: 's2-s',
};

function snapshot(s: SimState): Telemetry {
  return {
    time: s.t, alt: s.alt, speed: s.speed, vertSpeed: s.vertSpeed, mach: s.mach,
    gForce: s.gForce, mass: s.mass, q: s.q, aoa: s.aoa, stability: s.stability,
    apoapsis: s.orbit.apoapsis, periapsis: s.orbit.periapsis, timeToApo: s.orbit.timeToApo,
    stage: s.stage, fuel1: 0, fuel2: 0, throttle: s.throttle, phase: s.phase,
    autopilot: s.autopilot, events: s.events,
  };
}

interface Outcome { ok: boolean; title: string; text: string; score?: number; record?: boolean }

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const rocketRef = useRef<RocketMeshes | null>(null);
  const jettisonRef = useRef<THREE.Group | null>(null);
  const simRef = useRef<SimState | null>(null);
  const statsRef = useRef<DesignStats | null>(null);
  const explosionRef = useRef<Explosion>(makeExplosion());
  const modeRef = useRef<Mode>('build');
  const camRef = useRef<CamMode>('chase');
  const warpRef = useRef(1);
  const pausedRef = useRef(false);
  const camPosRef = useRef(new THREE.Vector3());
  const camOffsetRef = useRef(new THREE.Vector3());
  const buildSpinRef = useRef(0);
  const kitRef = useRef<Kit | null>(null);
  const designRef = useRef<Design>(DEFAULT_DESIGN);
  const recordsRef = useRef<Records>({});

  const detected = useMobile();
  const mobile = detected === true;
  const layoutReady = detected !== null;
  // цикл рендера читает раскладку из ref: он живёт вне React и о состоянии не знает
  const mobileRef = useRef(mobile);
  useEffect(() => { mobileRef.current = mobile; }, [mobile]);

  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [stats, setStats] = useState<DesignStats>(() => analyze(DEFAULT_DESIGN));
  const [mode, setMode] = useState<Mode>('build');
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [warp, setWarp] = useState(1);
  const [paused, setPaused] = useState(false);
  const [camMode, setCamMode] = useState<CamMode>('chase');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [records, setRecords] = useState<Records>({});
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  /** Пересобрать 3D-модель под текущую конструкцию. */
  const rebuildRocket = useCallback((d: Design) => {
    const world = worldRef.current;
    if (!world) return;
    if (rocketRef.current) {
      world.scene.remove(rocketRef.current.root);
      if (jettisonRef.current) world.scene.remove(jettisonRef.current);
      // освобождает только то, что создала сама сборка: детали кита общие
      rocketRef.current.dispose();
    }
    jettisonRef.current = null;
    const parts = resolveParts(d);
    const L = layout(parts);
    const meshes = buildRocket(parts, L, kitRef.current);
    world.scene.add(meshes.root);
    rocketRef.current = meshes;
  }, []);

  // --- инициализация сцены ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // сцена строится раньше, чем useMobile отдаст ответ, поэтому спрашиваем медиа-запрос напрямую
    let world: World;
    try {
      world = createWorld(canvas, isMobileNow());
    } catch (e) {
      // без WebGL показывать пустой холст бессмысленно — объясняем, что случилось.
      // Разовый отказ внешней системы — как раз тот случай, когда состояние
      // выставляется из эффекта.
      console.error('Сцена не создана:', e);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitError('Не удалось запустить WebGL. Включите аппаратное ускорение в браузере или откройте игру на другом устройстве.');
      return;
    }
    worldRef.current = world;

    const { state, stats: st } = createFlight(DEFAULT_DESIGN);
    simRef.current = state;
    statsRef.current = st;
    rebuildRocket(DEFAULT_DESIGN);

    // Кит из Blender приезжает асинхронно: до него ракета собрана на примитивах,
    // после загрузки пересобираем её уже из мешей.
    let alive = true;
    loadKit().then((k) => {
      if (!alive) return;
      kitRef.current = k;
      rebuildRocket(designRef.current);
    }).catch((e) => {
      console.warn('Кит деталей не загрузился, остаёмся на примитивах:', e);
    });

    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      world.renderer.setSize(w, h, false);
      world.camera.aspect = w / h;
      world.camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    // высота холста меняется при переходе «конструктор ↔ полёт» на телефоне
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setInitError('Браузер потерял контекст WebGL. Перезагрузите страницу, чтобы продолжить.');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAcc = 0;
    const up = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const desired = new THREE.Vector3();
    const target = new THREE.Vector3();
    const side = new THREE.Vector3();
    const sepAxis = new THREE.Vector3();
    const POLE = new THREE.Vector3(0, 0, 1);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const real = Math.min((now - last) / 1000, 0.06);
      last = now;

      const s = simRef.current!;
      const stat = statsRef.current!;
      const rocket = rocketRef.current;
      if (!rocket) return;

      // --- физика ---
      // на баллистической паузе ждать в реальном времени бессмысленно
      const autoWarp = s.phase === 'coast' ? Math.max(warpRef.current, 20) : warpRef.current;
      if (modeRef.current === 'flight' && s.status === 'flying' && !pausedRef.current) {
        acc += real * autoWarp;
        let steps = Math.floor(acc / DT);
        acc -= steps * DT;
        steps = Math.min(steps, 2500);
        for (let i = 0; i < steps && s.status === 'flying'; i++) step(s, stat, DT);
      }

      // --- размещение модели ---
      up.copy(s.pos).normalize();
      axis.set(0, 1, 0).applyQuaternion(s.quat).normalize();
      const anchor = stat.layout.totalLength;
      rocket.root.quaternion.copy(s.quat);
      rocket.root.position.copy(s.pos).addScaledVector(axis, anchor);

      const pr = pressureRatio(s.alt);
      const burning = s.thrust > 0;
      updatePlume(rocket.plume1, s.stage === 0 && burning ? s.throttle : 0, pr, s.t);
      updatePlume(rocket.plume2, s.stage === 1 && burning ? s.throttle : 0, pr, s.t);

      // отделившаяся ступень
      if (s.separated && rocket.stage1.parent === rocket.root) {
        rocket.root.remove(rocket.stage1);
        world.scene.add(rocket.stage1);
        jettisonRef.current = rocket.stage1;
        rocket.plume1.visible = false;
      }
      if (jettisonRef.current && s.sepPos && s.sepQuat) {
        sepAxis.set(0, 1, 0).applyQuaternion(s.sepQuat);
        jettisonRef.current.quaternion.copy(s.sepQuat);
        jettisonRef.current.position.copy(s.sepPos).addScaledVector(sepAxis, anchor);
        // далеко улетевший блок только мешает кадру
        jettisonRef.current.visible = s.sepPos.distanceToSquared(s.pos) < 9e6;
      }

      // след
      if (modeRef.current === 'flight' && s.status !== 'destroyed') {
        const i = world.trailCount * 3;
        const dx = world.trailPositions[i - 3] - s.pos.x;
        const dy = world.trailPositions[i - 2] - s.pos.y;
        const dz = world.trailPositions[i - 1] - s.pos.z;
        if (world.trailCount === 0 || dx * dx + dy * dy + dz * dz > 400) pushTrail(world, s.pos);
      }

      // --- взрыв ---
      const ex = explosionRef.current;
      if (s.status === 'destroyed' && !ex.active && ex.t === 0) {
        triggerExplosion(ex, world, rocket.root.position);
        rocket.root.visible = false;
      }
      updateExplosion(ex, world, real);

      // --- камера ---
      const alt = Math.max(s.alt, 0);
      const len = stat.layout.totalLength;
      // Дистанция считается из поля зрения и высоты кадра, свободной от панелей:
      // на телефоне HUD занимает верх и низ, поэтому камеру нужно отодвинуть.
      const hpx = world.renderer.domElement.clientHeight || 800;
      const hudPx = modeRef.current === 'flight' && mobileRef.current ? 170 : 0;
      const framePart = 0.55 * (Math.max(hpx - hudPx, 120) / hpx);
      const fitDist = (len / 2) / Math.tan(((world.camera.fov * Math.PI) / 180 / 2) * framePart);

      if (modeRef.current === 'build') {
        buildSpinRef.current += real * 0.16;
        const d = fitDist * 1.3;
        const a = buildSpinRef.current;
        desired.set(Math.cos(a) * d, R_PLANET + len * 0.75, Math.sin(a) * d);
        target.set(0, R_PLANET + len * 0.5, 0);
      } else if (camRef.current === 'orbit') {
        const d = Math.max(alt * 2.4 + 12_000, 40_000);
        side.crossVectors(up, POLE).normalize();
        desired.copy(s.pos).addScaledVector(side, d).addScaledVector(up, d * 0.35);
        target.copy(s.pos);
      } else if (camRef.current === 'side') {
        const d = fitDist * 1.15 + Math.min(alt * 0.02, 220);
        side.crossVectors(up, POLE).normalize();
        desired.copy(rocket.root.position).addScaledVector(side, d).addScaledVector(up, len * 0.15);
        target.copy(rocket.root.position).addScaledVector(axis, -len * 0.45);
      } else {
        const d = fitDist + Math.min(s.speed * 0.05, 260);
        side.crossVectors(axis, up).normalize();
        if (side.lengthSq() < 0.01) side.set(1, 0, 0);
        desired.copy(rocket.root.position)
          .addScaledVector(axis, -len * 0.9)
          .addScaledVector(side, d)
          .addScaledVector(up, d * 0.28);
        target.copy(rocket.root.position).addScaledVector(axis, -len * 0.55);
      }

      const anchorPos = modeRef.current === 'build' ? target : rocket.root.position;
      camOffsetRef.current.copy(desired).sub(anchorPos);
      const k = modeRef.current === 'build' ? 1 : 1 - Math.pow(0.004, real);
      if (camPosRef.current.lengthSq() === 0) camPosRef.current.copy(camOffsetRef.current);
      camPosRef.current.lerp(camOffsetRef.current, k);
      world.camera.position.copy(anchorPos).add(camPosRef.current);
      world.camera.up.copy(up);
      world.camera.lookAt(target);

      world.clouds.rotation.y += real * 0.00004;
      world.stars.position.copy(world.camera.position);

      // небо: у поверхности голубое, с высотой чернеет
      const camAlt = world.camera.position.length() - R_PLANET;
      const skyT = Math.exp(-Math.max(camAlt, 0) / 13_000);
      const atmoMat = world.atmo.material as THREE.MeshBasicMaterial;
      atmoMat.opacity = 0.88 * Math.pow(skyT, 1.1);
      atmoMat.color.setRGB(0.28 + 0.26 * skyT, 0.55 + 0.19 * skyT, 0.86 + 0.1 * skyT);
      (world.stars.material as THREE.PointsMaterial).opacity = 1 - skyT * 0.95;
      // ободок атмосферы имеет смысл только когда виден край диска
      const glowMat = world.glow.material as THREE.ShaderMaterial;
      glowMat.uniforms.intensity.value = 0.75 * Math.min(1, Math.max(0, (camAlt - 85_000) / 90_000));

      world.renderer.render(world.scene, world.camera);

      // --- телеметрия в React ---
      hudAcc += real;
      if (hudAcc > 0.1 && modeRef.current === 'flight') {
        hudAcc = 0;
        const snap = snapshot(s);
        snap.fuel1 = stat.stage1Fuel > 0 ? s.fuel1 / stat.stage1Fuel : 0;
        snap.fuel2 = stat.stage2Fuel > 0 ? s.fuel2 / stat.stage2Fuel : 0;
        setTelemetry(snap);
        setWarp(autoWarp);

        // Итог полёта показывается один раз: пока текст не изменился, состояние
        // не трогаем, иначе оверлей перерисовывался бы десять раз в секунду.
        let next: Outcome | null = null;
        if (s.status === 'orbit') {
          const prev = recordsRef.current;
          const updated = saveRecord(prev, stat.parts.payload.id, s.score);
          if (updated !== prev) { recordsRef.current = updated; setRecords(updated); }
          next = {
            ok: true, title: 'Миссия выполнена', text: s.message,
            score: s.score, record: updated !== prev,
          };
        } else if (s.status === 'destroyed') {
          next = { ok: false, title: 'Авария', text: s.message };
        } else if (s.doomed) {
          next = { ok: false, title: 'Задача не выполнена', text: s.message };
        }
        if (next) {
          const n = next;
          setOutcome((cur) => (cur && cur.title === n.title && cur.text === n.text ? cur : n));
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      world.dispose();
      worldRef.current = null;
    };
  }, [rebuildRocket]);

  // --- действия: общие для клавиатуры и экранных кнопок ---
  const cycleCamera = useCallback(() => {
    const order: CamMode[] = ['chase', 'side', 'orbit'];
    const next = order[(order.indexOf(camRef.current) + 1) % order.length];
    camRef.current = next; setCamMode(next);
  }, []);
  const toggleAutopilot = useCallback(() => {
    const s = simRef.current;
    if (!s) return;
    s.autopilot = !s.autopilot;
    if (!s.autopilot) s.throttle = 1;
    setTelemetry((t) => (t ? { ...t, autopilot: s.autopilot } : t));
  }, []);
  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, []);
  const warpUp = useCallback(() => {
    const v = warpRef.current >= 20 ? 50 : warpRef.current >= 5 ? 20 : warpRef.current >= 2 ? 5 : 2;
    warpRef.current = v; setWarp(v);
  }, []);
  const warpDown = useCallback(() => {
    const v = warpRef.current > 20 ? 20 : warpRef.current > 5 ? 5 : warpRef.current > 2 ? 2 : 1;
    warpRef.current = v; setWarp(v);
  }, []);
  const setPitch = useCallback((v: number) => {
    if (simRef.current) simRef.current.manualPitch = v;
  }, []);
  const nudgeThrottle = useCallback((d: number) => {
    const s = simRef.current;
    if (s) s.throttle = Math.max(0, Math.min(1, s.throttle + d));
  }, []);

  const actions: HudActions = {
    cycleCamera, toggleAutopilot, togglePause, warpDown, warpUp,
    pitch: setPitch, throttle: nudgeThrottle,
  };

  // --- клавиатура ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = simRef.current;
      if (!s) return;
      if (e.code === 'KeyC') cycleCamera();
      if (modeRef.current !== 'flight') return;
      if (e.code === 'KeyA') toggleAutopilot();
      if (e.code === 'Space' || e.code === 'KeyP') { togglePause(); e.preventDefault(); }
      if (e.code === 'Period' || e.code === 'BracketRight') warpUp();
      if (e.code === 'Comma' || e.code === 'BracketLeft') warpDown();
      if (e.code === 'ArrowUp') { s.manualPitch = -1; e.preventDefault(); }
      if (e.code === 'ArrowDown') { s.manualPitch = 1; e.preventDefault(); }
      if (e.code === 'ArrowLeft') nudgeThrottle(-0.1);
      if (e.code === 'ArrowRight') nudgeThrottle(0.1);
    };
    const onUp = (e: KeyboardEvent) => {
      const s = simRef.current;
      if (s && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) s.manualPitch = 0;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); };
  }, [cycleCamera, toggleAutopilot, togglePause, warpUp, warpDown, nudgeThrottle]);

  const applyDesign = useCallback((d: Design) => {
    designRef.current = d;
    setDesign(d);
    setStats(analyze(d));
    saveDesign(d);
    const { state, stats: st } = createFlight(d);
    simRef.current = state;
    statsRef.current = st;
    rebuildRocket(d);
    const world = worldRef.current;
    if (world) resetTrail(world);
    camPosRef.current.set(0, 0, 0);
  }, [rebuildRocket]);

  // Компоновку из ссылки или прошлой сессии подхватываем уже после монтирования:
  // страница отдаётся статикой, и чтение localStorage при рендере разошлось бы
  // с серверной разметкой.
  useEffect(() => {
    const stored = loadRecords();
    recordsRef.current = stored;
    // хранилище — внешняя система, а не производное состояние: читаем один раз
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecords(stored);
    const saved = loadDesign();
    if (saved) applyDesign(saved);
    // намеренно только при монтировании
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = useCallback((patch: Partial<Design>) => {
    applyDesign({ ...design, ...patch });
  }, [design, applyDesign]);

  const onPreset = useCallback((name: 'good' | 'bad') => {
    applyDesign(name === 'good' ? { ...GOOD_PRESET } : { ...BAD_PRESET });
  }, [applyDesign]);

  const onShare = useCallback(() => {
    const url = shareUrl(designRef.current);
    // адресная строка обновляется всегда: буфер обмена доступен не в каждом браузере
    window.history.replaceState(null, '', url);
    const inBar = 'Ссылка на компоновку — в адресной строке';
    const clip = navigator.clipboard;
    if (clip) clip.writeText(url).then(() => setShareNote('Ссылка на компоновку скопирована')).catch(() => setShareNote(inBar));
    else setShareNote(inBar);
  }, []);

  useEffect(() => {
    if (!shareNote) return;
    const id = window.setTimeout(() => setShareNote(null), 2600);
    return () => window.clearTimeout(id);
  }, [shareNote]);

  const startLaunch = useCallback(() => {
    const world = worldRef.current;
    const s = simRef.current;
    if (!world || !s) return;
    resetTrail(world);
    explosionRef.current = makeExplosion();
    world.debris.visible = false;
    igniteRocket(s);
    warpRef.current = 1; setWarp(1);
    pausedRef.current = false; setPaused(false);
    camRef.current = 'chase'; setCamMode('chase');
    camPosRef.current.set(0, 0, 0);
    setOutcome(null);
    setTelemetry(snapshot(s));
    modeRef.current = 'flight';
    setMode('flight');
  }, []);

  /** Повторить запуск той же ракеты, не возвращаясь в конструктор. */
  const relaunch = useCallback(() => {
    applyDesign(designRef.current);
    startLaunch();
  }, [applyDesign, startLaunch]);

  const backToBuild = useCallback(() => {
    modeRef.current = 'build';
    setMode('build');
    setOutcome(null);
    setTelemetry(null);
    pausedRef.current = false; setPaused(false);
    applyDesign(designRef.current);
  }, [applyDesign]);

  if (initError) {
    return (
      <div className="fatal">
        <div className="fatal-box">
          <div className="fatal-title">Сцена не запустилась</div>
          <p className="fatal-text">{initError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`game${mobile ? ' game-mobile' : ''} game-${mode}`}>
      <div className="stage"><canvas ref={canvasRef} className="canvas" /></div>
      {layoutReady && mode === 'build' && (
        <BuilderPanel design={design} stats={stats} mobile={mobile} record={records[design.payload]}
          onChange={onChange} onLaunch={startLaunch} onPreset={onPreset} onShare={onShare} />
      )}
      {layoutReady && mode === 'flight' && telemetry && (
        <>
          <HUD t={telemetry} warp={warp} paused={paused}
            camera={mobile ? CAM_SHORT[camMode] : CAM_RU[camMode]}
            mobile={mobile} actions={actions} />
          {!mobile && (
            <div className="hints">
              C — камера · A — автопилот · пробел — пауза · ←/→ — тяга · ↑/↓ — тангаж (в ручном) · , / . — ускорение времени
            </div>
          )}
        </>
      )}
      {shareNote && <div className="toast">{shareNote}</div>}
      {outcome && (
        <div className="overlay">
          <div className={`result ${outcome.ok ? 'result-ok' : 'result-bad'}`}>
            <div className="result-title">{outcome.title}</div>
            <div className="result-text">{outcome.text}</div>
            {outcome.score !== undefined && (
              <div className="result-score">
                Очки миссии: <b>{outcome.score}</b>
                {outcome.record && <span className="result-record">новый рекорд</span>}
              </div>
            )}
            <div className="result-buttons">
              <button className="launch" onClick={relaunch}>Повторить запуск</button>
              <button className="ghost" onClick={backToBuild}>К конструктору</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
