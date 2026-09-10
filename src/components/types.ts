import type { FlightEvent, Phase } from '@/lib/physics';

export interface Telemetry {
  time: number;
  alt: number;
  speed: number;
  vertSpeed: number;
  mach: number;
  gForce: number;
  mass: number;
  q: number;
  aoa: number;
  stability: number;
  apoapsis: number;
  periapsis: number;
  timeToApo: number;
  stage: number;
  fuel1: number;
  fuel2: number;
  throttle: number;
  phase: Phase;
  autopilot: boolean;
  events: FlightEvent[];
}
