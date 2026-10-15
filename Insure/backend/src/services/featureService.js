/**
 * Feature Extraction Service
 *
 * Calculates trip metrics and exposure-normalised event rates from validated telemetry readings.
 *
 * Implements:
 *  - Distance & duration exposure
 *  - Event rates normalised per 100 km (so 1000 km is not unfairly penalised vs 10 km)
 *  - Speeding, harsh braking, rapid acceleration, harsh cornering, and unsafe usage indicators
 *  - Data confidence assessment
 */

'use strict';

const HARSH_BRAKING_THRESHOLD_MS2   = -4.0;  // m/s² (configurable baseline)
const RAPID_ACCEL_THRESHOLD_MS2     = +3.5;  // m/s² (configurable baseline)
const SPEEDING_THRESHOLD_KMH        = 80.0;  // km/h (configurable baseline for speed ratio)
const HIGH_SPEEDING_THRESHOLD_KMH   = 110.0; // km/h (severe speeding)

/**
 * Extract features from validated readings.
 *
 * @param {Array}  readings          raw telemetry readings
 * @param {Object} validationResult  output of validateReadings()
 * @returns {Object} trip metrics and exposure indicators
 */
function extractFeatures(readings, validationResult) {
  const validReadings = readings.filter((r, i) => {
    const result = validationResult.reading_results?.[i];
    return result?.status !== 'error';
  });

  // ── Speed metrics ──────────────────────────────────────────────────────────
  const speeds = validReadings
    .map(r => r.speed_kmh)
    .filter(s => s != null && !isNaN(s) && s >= 0 && s <= 300);

  const avgSpeed = speeds.length > 0
    ? speeds.reduce((a, b) => a + b, 0) / speeds.length
    : null;
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;

  // Speeding ratio: proportion of valid readings exceeding threshold
  const speedingReadings = speeds.filter(s => s > SPEEDING_THRESHOLD_KMH).length;
  const severeSpeedingReadings = speeds.filter(s => s > HIGH_SPEEDING_THRESHOLD_KMH).length;
  const speedingPct = speeds.length > 0 ? (speedingReadings / speeds.length) * 100 : 0;

  // ── Duration ───────────────────────────────────────────────────────────────
  const timestamps = validReadings
    .map(r => r.timestamp ? new Date(r.timestamp).getTime() : null)
    .filter(t => t != null && !isNaN(t))
    .sort((a, b) => a - b);

  const durationSec = timestamps.length >= 2
    ? (timestamps[timestamps.length - 1] - timestamps[0]) / 1000
    : null;

  // ── Distance ───────────────────────────────────────────────────────────────
  const distances = validReadings
    .map(r => r.distance_km)
    .filter(d => d != null && !isNaN(d) && d >= 0);

  const totalDistance = distances.length > 0 ? Math.max(...distances) : null;
  // Safe distance denominator for rate calculations (min 0.5 km to prevent divide-by-zero)
  const distanceDenominator = Math.max(totalDistance || 0, 0.5);

  // ── Harsh and risky events ─────────────────────────────────────────────────
  const accels = validReadings
    .map(r => r.acceleration_ms2)
    .filter(a => a != null && !isNaN(a));

  // Count by acceleration thresholds or explicit event types
  let harshBrakingCount = 0;
  let rapidAccelCount = 0;
  let harshCorneringCount = 0;
  let unsafeUsageCount = 0;

  validReadings.forEach(r => {
    const ev = r.event_type;
    const accel = r.acceleration_ms2;

    if (ev === 'harsh_braking' || (accel != null && accel <= HARSH_BRAKING_THRESHOLD_MS2)) {
      harshBrakingCount++;
    }
    if (ev === 'rapid_acceleration' || (accel != null && accel >= RAPID_ACCEL_THRESHOLD_MS2)) {
      rapidAccelCount++;
    }
    if (ev === 'harsh_cornering') {
      harshCorneringCount++;
    }
    if (ev === 'night_driving' || ev === 'phone_distraction') {
      unsafeUsageCount++;
    } else if (r.timestamp) {
      const hr = new Date(r.timestamp).getHours();
      // Night driving: 11 PM (23) to 5 AM (5)
      if (hr >= 23 || hr < 5) {
        unsafeUsageCount++;
      }
    }
  });

  // ── Normalised event rates per 100 km ──────────────────────────────────────
  const harshBrakingRatePer100km = parseFloat(((harshBrakingCount / distanceDenominator) * 100).toFixed(2));
  const rapidAccelRatePer100km   = parseFloat(((rapidAccelCount / distanceDenominator) * 100).toFixed(2));
  const corneringRatePer100km    = parseFloat(((harshCorneringCount / distanceDenominator) * 100).toFixed(2));
  const unsafeUsageRatePer100km  = parseFloat(((unsafeUsageCount / distanceDenominator) * 100).toFixed(2));

  // ── Data confidence / sufficiency ──────────────────────────────────────────
  const invalidReadingCount = validationResult.error_count || 0;
  const completenessPct     = validationResult.completeness_pct ?? 0;
  const dataQualityStatus   = validationResult.status;

  let dataConfidence = 'high';
  if (
    (totalDistance != null && totalDistance < 3.0) ||
    validReadings.length < 10 ||
    dataQualityStatus === 'review_required' ||
    completenessPct < 70
  ) {
    dataConfidence = 'insufficient';
  } else if ((totalDistance != null && totalDistance < 10.0) || dataQualityStatus === 'warning') {
    dataConfidence = 'moderate';
  }

  return {
    total_distance_km:           totalDistance != null ? parseFloat(totalDistance.toFixed(3)) : null,
    duration_sec:                durationSec   != null ? parseFloat(durationSec.toFixed(1))   : null,
    avg_speed_kmh:               avgSpeed      != null ? parseFloat(avgSpeed.toFixed(2))      : null,
    max_speed_kmh:               maxSpeed      != null ? parseFloat(maxSpeed.toFixed(2))      : null,
    speeding_pct:                parseFloat(speedingPct.toFixed(1)),
    severe_speeding_count:       severeSpeedingReadings,
    harsh_braking_count:         harshBrakingCount,
    rapid_accel_count:           rapidAccelCount,
    harsh_cornering_count:       harshCorneringCount,
    unsafe_usage_count:          unsafeUsageCount,
    // Normalised rates per 100 km
    harsh_braking_rate_per_100km: harshBrakingRatePer100km,
    rapid_accel_rate_per_100km:   rapidAccelRatePer100km,
    cornering_rate_per_100km:     corneringRatePer100km,
    unsafe_usage_rate_per_100km:  unsafeUsageRatePer100km,
    // Data quality and confidence
    data_confidence:             dataConfidence,
    invalid_reading_count:       invalidReadingCount,
    data_quality_status:         dataQualityStatus,
    completeness_pct:            completenessPct,
    valid_reading_count:         validReadings.length,
    total_reading_count:         readings.length,
    extracted_at:                new Date().toISOString(),
    thresholds: {
      harsh_braking_ms2: HARSH_BRAKING_THRESHOLD_MS2,
      rapid_accel_ms2:   RAPID_ACCEL_THRESHOLD_MS2,
      speeding_kmh:      SPEEDING_THRESHOLD_KMH,
    },
    disclaimer: 'PROTOTYPE METRICS — normalised event rates used for fair, distance-adjusted scoring.',
  };
}

module.exports = {
  extractFeatures,
  HARSH_BRAKING_THRESHOLD_MS2,
  RAPID_ACCEL_THRESHOLD_MS2,
  SPEEDING_THRESHOLD_KMH,
};
