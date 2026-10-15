export interface TelemetryReading {
  id?: string;
  trip_id?: string;
  sequence_number: number;
  timestamp: string;
  speed_kmh: number;
  distance_km: number;
  acceleration_ms2?: number;
  latitude?: number;
  longitude?: number;
  odometer_km?: number;
  ignition_state?: string;
  provider_id?: string;
  device_id?: string;
  vehicle_id?: string;
  driver_id?: string;
  provenance?: string;
  validation_status?: string;
}

export interface ValidationIssue {
  field?: string;
  code: string;
  severity: 'error' | 'warning';
  detail?: string;
  reading_index?: number | null;
  sequence_number?: number;
}

export interface ReadingResult {
  index: number;
  sequence_number?: number;
  status: 'valid' | 'warning' | 'error';
  issues: ValidationIssue[];
}

export interface ValidationResult {
  status: 'valid' | 'warning' | 'review_required';
  valid_count: number;
  total_count: number;
  error_count: number;
  warning_count: number;
  completeness_pct: number;
  issues: ValidationIssue[];
  reading_results: ReadingResult[];
  review_reasons: string[];
  validated_at: string;
}

export interface DriverFeatures {
  trip_id: string;
  total_distance_km: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  max_speed_kmh: number;
  hard_braking_count: number;
  rapid_accel_count: number;
  speeding_count: number;
  speeding_seconds: number;
  night_driving_seconds: number;
  night_driving_status?: 'ok' | 'missing_timestamps';
  events_per_100km: number;
}
