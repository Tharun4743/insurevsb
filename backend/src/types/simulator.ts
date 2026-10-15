import { TelemetryReading } from './telematics';

export type SimulationScenario = 'SAFE' | 'NORMAL' | 'RISKY' | 'NIGHT';

export type SessionLifecycleState = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'RESET';

export interface SimulationSession {
  session_id: string;
  driver_id: string;
  vehicle_id: string;
  scenario: SimulationScenario;
  state: SessionLifecycleState;
  step_count: number;
  total_distance_km: number;
  current_odometer_km: number;
  readings: TelemetryReading[];
  created_at: string;
  updated_at: string;
}

export interface ScenarioProfile {
  name: SimulationScenario;
  description: string;
  target_safety_score_range: [number, number];
  base_speed_kmh: number;
  max_speed_kmh: number;
  hard_braking_probability: number;
  rapid_accel_probability: number;
  speeding_probability: number;
}
