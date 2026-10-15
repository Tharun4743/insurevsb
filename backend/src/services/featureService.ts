/**
 * Feature Extraction Service
 *
 * Calculates trip metrics, exposure-normalised event rates, and night-driving exposure
 * from validated telemetry readings.
 *
 * Implements:
 *  - Event deduplication (hysteresis state machine for harsh braking & rapid accel)
 *  - Distance & duration exposure using valid incremental deltas
 *  - Event rates normalised per 100 valid km (calculated only with adequate distance >= 1.0 km)
 *  - Separate night-driving exposure metric (% and km) with explicit timezone policy
 *  - Audit trail of excluded readings and reasons
 *  - Data confidence assessment
 */

import { ValidationResult } from '../types/telematics';

export const HARSH_BRAKING_THRESHOLD_MS2   = -4.0;  // m/s² (longitudinal deceleration breach)
export const HARSH_BRAKING_RECOVERY_MS2    = -2.5;  // m/s² (hysteresis recovery threshold)
export const RAPID_ACCEL_THRESHOLD_MS2     = +3.5;  // m/s² (longitudinal acceleration breach)
export const RAPID_ACCEL_RECOVERY_MS2      = +2.0;  // m/s² (hysteresis recovery threshold)
export const SPEEDING_THRESHOLD_KMH        = 80.0;  // km/h (configurable baseline for speed ratio)
export const HIGH_SPEEDING_THRESHOLD_KMH   = 110.0; // km/h (severe speeding)
export const MIN_DISTANCE_FOR_RATES_KM     = 1.0;   // Minimum km denominator for rate calculations
export const DEFAULT_TIMEZONE              = process.env.TELEMATICS_TIMEZONE || 'Asia/Kolkata';

export interface NightWindow {
  startHour: number;
  endHour: number;
}

// Configurable nighttime window (23:00 to 05:00 local time)
export const DEFAULT_NIGHT_WINDOW: NightWindow = {
  startHour: 23,
  endHour: 5,
};

/**
 * Extract the local hour, minute, and second in a specific timezone.
 */
export function getLocalTimeInTimezone(date: Date, timeZone: string = DEFAULT_TIMEZONE): { hour: number; minute: number; second: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    let hour = 0, minute = 0, second = 0;
    for (const p of parts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
      if (p.type === 'second') second = parseInt(p.value, 10);
    }
    if (hour === 24) hour = 0;
    return { hour, minute, second };
  } catch {
    // Fallback if timezone string is invalid
    const h = date.getUTCHours();
    return { hour: h, minute: date.getUTCMinutes(), second: date.getUTCSeconds() };
  }
}

/**
 * Checks if a specific instant (Date object) falls within the defined night window in the given timezone.
 */
export function isInstantInNightWindow(date: Date, nightWindow: NightWindow = DEFAULT_NIGHT_WINDOW, timeZone: string = DEFAULT_TIMEZONE): boolean {
  const { hour } = getLocalTimeInTimezone(date, timeZone);
  const { startHour, endHour } = nightWindow;
  if (startHour > endHour) {
    // Night window spans midnight (e.g. 23:00 to 05:00)
    return hour >= startHour || hour < endHour;
  }
  return hour >= startHour && hour < endHour;
}

/**
 * Calculates the exact fraction of a time interval [startDate, endDate] that falls within the nighttime window.
 */
export function calculateNightIntervalFraction(
  startDate: Date,
  endDate: Date,
  nightWindow: NightWindow = DEFAULT_NIGHT_WINDOW,
  timeZone: string = DEFAULT_TIMEZONE
): number {
  const tStart = startDate.getTime();
  const tEnd = endDate.getTime();
  const totalDurationMs = tEnd - tStart;
  if (totalDurationMs <= 0) {
    return isInstantInNightWindow(startDate, nightWindow, timeZone) ? 1.0 : 0.0;
  }

  const startInNight = isInstantInNightWindow(startDate, nightWindow, timeZone);
  const endInNight = isInstantInNightWindow(endDate, nightWindow, timeZone);

  if (startInNight && endInNight) return 1.0;
  if (!startInNight && !endInNight) return 0.0;

  // Boundary crossed: compute slice numerically with 10 steps for exact fraction
  const STEPS = 10;
  let nightCount = 0;
  const stepMs = totalDurationMs / STEPS;
  for (let s = 0; s < STEPS; s++) {
    const sampleDate = new Date(tStart + stepMs * (s + 0.5));
    if (isInstantInNightWindow(sampleDate, nightWindow, timeZone)) {
      nightCount++;
    }
  }
  return nightCount / STEPS;
}

export interface FeatureExtractionOptions {
  timezone?: string;
  nightWindow?: NightWindow;
}

/**
 * Extract features from validated readings.
 *
 * @param readings raw telemetry readings
 * @param validationResult output of validateReadings()
 * @param options configuration overrides (nightWindow, timezone)
 */
export function extractFeatures(
  readings: any[],
  validationResult: ValidationResult,
  options: FeatureExtractionOptions = {}
): any {
  const timezone = options.timezone || DEFAULT_TIMEZONE;
  const nightWindow = options.nightWindow || DEFAULT_NIGHT_WINDOW;

  // ── Separate valid readings from quarantined / excluded readings ───────────
  const validReadings: any[] = [];
  const excludedReadings: any[] = [];

  readings.forEach((r, i) => {
    const result = validationResult.reading_results?.[i];
    if (result?.status === 'error') {
      excludedReadings.push({
        index: i,
        sequence_number: r.sequence_number,
        timestamp: r.timestamp,
        reasons: result.issues.filter(iss => iss.severity === 'error').map(iss => iss.code),
      });
    } else {
      validReadings.push(r);
    }
  });

  // ── Speed metrics ──────────────────────────────────────────────────────────
  const speeds = validReadings
    .map(r => r.speed_kmh)
    .filter(s => s != null && !isNaN(s) && s >= 0 && s <= 300);

  const avgSpeed = speeds.length > 0
    ? speeds.reduce((a, b) => a + b, 0) / speeds.length
    : null;
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;

  // Speeding ratio: proportion of valid speed readings exceeding threshold
  const speedingReadings = speeds.filter(s => s > SPEEDING_THRESHOLD_KMH).length;
  const severeSpeedingReadings = speeds.filter(s => s > HIGH_SPEEDING_THRESHOLD_KMH).length;
  const speedingPct = speeds.length > 0 ? (speedingReadings / speeds.length) * 100 : 0;

  // ── Duration & Timestamps ──────────────────────────────────────────────────
  const timestamps = validReadings
    .map(r => r.timestamp ? new Date(r.timestamp).getTime() : null)
    .filter((t): t is number => t != null && !isNaN(t))
    .sort((a, b) => a - b);

  const durationSec = timestamps.length >= 2
    ? (timestamps[timestamps.length - 1] - timestamps[0]) / 1000
    : null;

  // ── Valid Distance Aggregation & Night-driving Allocation ──────────────────
  let totalValidDistance = 0;
  let nightValidDistance = 0;
  let hasValidDistanceData = false;
  let prevDist: number | null = null;
  let prevTime: Date | null = null;
  let hasTimestampsForNight = true;

  for (let i = 0; i < validReadings.length; i++) {
    const r = validReadings[i];
    const currDist = r.distance_km;
    const currTime = r.timestamp && !isNaN(new Date(r.timestamp).getTime()) ? new Date(r.timestamp) : null;

    if (currDist != null && !isNaN(currDist) && currDist >= 0) {
      if (prevDist != null) {
        const deltaDist = currDist - prevDist;
        if (deltaDist >= 0 && deltaDist <= 10.0) { // Valid non-negative delta within plausibility
          totalValidDistance += deltaDist;
          hasValidDistanceData = true;

          // Allocate distance between day and night based on exact interval
          if (currTime && prevTime) {
            const nightFraction = calculateNightIntervalFraction(prevTime, currTime, nightWindow, timezone);
            nightValidDistance += deltaDist * nightFraction;
          } else if (currTime) {
            if (isInstantInNightWindow(currTime, nightWindow, timezone)) {
              nightValidDistance += deltaDist;
            }
          } else {
            hasTimestampsForNight = false;
          }
        }
      } else {
        hasValidDistanceData = true; // First distance reading observed
      }
      prevDist = currDist;
    }

    if (currTime) {
      prevTime = currTime;
    } else {
      hasTimestampsForNight = false;
    }
  }

  const finalTotalDistance = hasValidDistanceData && totalValidDistance > 0
    ? parseFloat(totalValidDistance.toFixed(3))
    : (validReadings.length === 1 && prevDist != null ? parseFloat(prevDist.toFixed(3)) : null);

  // Night driving percentage metric
  let nightDrivingPct: number | null = null;
  let nightDrivingDistanceKm: number | null = null;
  let nightDrivingStatus = 'insufficient_data';

  const hasNoTimestamps = !readings || readings.length === 0 || readings.every(r => !r.timestamp || isNaN(new Date(r.timestamp).getTime()));

  if (hasNoTimestamps || !hasTimestampsForNight || timestamps.length === 0) {
    nightDrivingStatus = 'missing_timestamps';
    nightDrivingPct = null;
    nightDrivingDistanceKm = null;
  } else if (finalTotalDistance == null || finalTotalDistance < 0.1) {
    nightDrivingStatus = 'insufficient_distance';
    nightDrivingDistanceKm = 0.0;
  } else {
    nightDrivingStatus = 'calculated';
    nightDrivingDistanceKm = parseFloat(nightValidDistance.toFixed(3));
    nightDrivingPct = parseFloat(((nightValidDistance / finalTotalDistance) * 100).toFixed(2));
    nightDrivingPct = Math.min(100.0, Math.max(0.0, nightDrivingPct));
  }

  // ── Event Detection with Hysteresis State Machine ──────────────────────────
  let harshBrakingCount = 0;
  let inBrakingEvent = false;

  let rapidAccelCount = 0;
  let inAccelEvent = false;

  let harshCorneringCount = 0;
  let inCorneringEvent = false;

  let distractedDrivingCount = 0;
  let inDistractionEvent = false;

  validReadings.forEach(r => {
    const ev = r.event_type;
    const accel = (r.acceleration_ms2 != null && !isNaN(r.acceleration_ms2)) ? r.acceleration_ms2 : null;

    // 1. Harsh Braking Hysteresis (Threshold: <= -4.0 m/s², Recovery: > -2.5 m/s²)
    const isBrakingBreach = (ev === 'harsh_braking') ||
      (accel != null && accel <= HARSH_BRAKING_THRESHOLD_MS2 && accel >= -30.0);
    const isBrakingRecovered = (ev !== 'harsh_braking') &&
      (accel == null || accel > HARSH_BRAKING_RECOVERY_MS2);

    if (!inBrakingEvent) {
      if (isBrakingBreach) {
        harshBrakingCount++;
        inBrakingEvent = true;
      }
    } else {
      if (isBrakingRecovered) {
        inBrakingEvent = false;
      }
    }

    // 2. Rapid Acceleration Hysteresis (Threshold: >= +3.5 m/s², Recovery: < +2.0 m/s²)
    const isAccelBreach = (ev === 'rapid_acceleration') ||
      (accel != null && accel >= RAPID_ACCEL_THRESHOLD_MS2 && accel <= 30.0);
    const isAccelRecovered = (ev !== 'rapid_acceleration') &&
      (accel == null || accel < RAPID_ACCEL_RECOVERY_MS2);

    if (!inAccelEvent) {
      if (isAccelBreach) {
        rapidAccelCount++;
        inAccelEvent = true;
      }
    } else {
      if (isAccelRecovered) {
        inAccelEvent = false;
      }
    }

    // 3. Harsh Cornering Event Grouping
    if (ev === 'harsh_cornering') {
      if (!inCorneringEvent) {
        harshCorneringCount++;
        inCorneringEvent = true;
      }
    } else {
      inCorneringEvent = false;
    }

    // 4. Distracted Driving
    if (ev === 'phone_distraction' || ev === 'distracted_driving') {
      if (!inDistractionEvent) {
        distractedDrivingCount++;
        inDistractionEvent = true;
      }
    } else {
      inDistractionEvent = false;
    }
  });

  // ── Normalised event rates per 100 km ──────────────────────────────────────
  const isDistanceAdequate = finalTotalDistance != null && finalTotalDistance >= MIN_DISTANCE_FOR_RATES_KM;

  const harshBrakingRatePer100km = isDistanceAdequate
    ? parseFloat(((harshBrakingCount / finalTotalDistance) * 100).toFixed(2))
    : null;
  const rapidAccelRatePer100km = isDistanceAdequate
    ? parseFloat(((rapidAccelCount / finalTotalDistance) * 100).toFixed(2))
    : null;
  const corneringRatePer100km = isDistanceAdequate
    ? parseFloat(((harshCorneringCount / finalTotalDistance) * 100).toFixed(2))
    : null;
  const distractedDrivingRatePer100km = isDistanceAdequate
    ? parseFloat(((distractedDrivingCount / finalTotalDistance) * 100).toFixed(2))
    : null;

  // ── Data confidence / sufficiency ──────────────────────────────────────────
  const invalidReadingCount = validationResult.error_count || 0;
  const completenessPct     = validationResult.completeness_pct ?? 0;
  const dataQualityStatus   = validationResult.status;

  let dataConfidence = 'high';
  if (
    finalTotalDistance == null ||
    finalTotalDistance < 1.0 ||
    validReadings.length < 5 ||
    dataQualityStatus === 'review_required' ||
    completenessPct < 70
  ) {
    dataConfidence = 'insufficient';
  } else if (finalTotalDistance < 5.0 || dataQualityStatus === 'warning') {
    dataConfidence = 'moderate';
  }

  return {
    total_distance_km:           finalTotalDistance,
    duration_sec:                durationSec   != null ? parseFloat(durationSec.toFixed(1))   : null,
    avg_speed_kmh:               avgSpeed      != null ? parseFloat(avgSpeed.toFixed(2))      : null,
    max_speed_kmh:               maxSpeed      != null ? parseFloat(maxSpeed.toFixed(2))      : null,
    speeding_pct:                parseFloat(speedingPct.toFixed(1)),
    severe_speeding_count:       severeSpeedingReadings,
    harsh_braking_count:         harshBrakingCount,
    rapid_accel_count:           rapidAccelCount,
    harsh_cornering_count:       harshCorneringCount,
    distracted_driving_count:    distractedDrivingCount,
    unsafe_usage_count:          distractedDrivingCount,
    harsh_braking_rate_per_100km: harshBrakingRatePer100km,
    rapid_accel_rate_per_100km:   rapidAccelRatePer100km,
    cornering_rate_per_100km:     corneringRatePer100km,
    distracted_driving_rate_per_100km: distractedDrivingRatePer100km,
    unsafe_usage_rate_per_100km:  distractedDrivingRatePer100km,
    night_driving_pct:           nightDrivingPct,
    night_driving_distance_km:   nightDrivingDistanceKm,
    night_driving_status:        nightDrivingStatus,
    night_driving_window:        `${nightWindow.startHour}:00 - ${nightWindow.endHour}:00`,
    timezone:                    timezone,
    data_confidence:             dataConfidence,
    invalid_reading_count:       invalidReadingCount,
    data_quality_status:         dataQualityStatus,
    completeness_pct:            completenessPct,
    valid_reading_count:         validReadings.length,
    total_reading_count:         readings.length,
    excluded_readings:           excludedReadings,
    extracted_at:                new Date().toISOString(),
    thresholds: {
      harsh_braking_ms2:         HARSH_BRAKING_THRESHOLD_MS2,
      harsh_braking_recovery_ms2: HARSH_BRAKING_RECOVERY_MS2,
      rapid_accel_ms2:           RAPID_ACCEL_THRESHOLD_MS2,
      rapid_accel_recovery_ms2:  RAPID_ACCEL_RECOVERY_MS2,
      speeding_kmh:              SPEEDING_THRESHOLD_KMH,
    },
    disclaimer: 'ILLUSTRATIVE TELEMATICS METRICS — normalised event rates with hysteresis deduplication and separated night exposure.',
  };
}
