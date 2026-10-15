/**
 * Validation Service
 *
 * Validates a batch of telemetry readings and produces a structured
 * validation result with status, warnings, and review reasons.
 *
 * Validation rules:
 *  - Required fields: sequence_number, timestamp, speed_kmh, distance_km
 *  - Speed: 0–300 km/h
 *  - Acceleration: -30 to +30 m/s² (physically plausible range)
 *  - Timestamps: must be within the last 24 hours and not in the future
 *  - Sequence numbers: must not contain duplicates
 *  - Distance: must be monotonically non-decreasing
 *  - Minimum reading count: 5
 *
 * Statuses:
 *   valid           — all readings pass all rules
 *   warning         — minor issues that don't block scoring
 *   review_required — data quality insufficient for reliable scoring
 *
 * IMPORTANT: Missing or unreliable data is NEVER interpreted as evidence
 * of unsafe driving. Insufficient data triggers review, not a penalty score.
 */

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const RULES = {
  MAX_SPEED_KMH:       300,
  MIN_SPEED_KMH:       0,
  MAX_ACCEL_MS2:       30,
  MIN_ACCEL_MS2:       -30,
  MAX_TIMESTAMP_AGE_MS:24 * 60 * 60 * 1000, // 24 hours
  MIN_READING_COUNT:   5,
  STALE_THRESHOLD_MS:  30 * 60 * 1000,       // 30 minutes
};

/**
 * Validate a single reading.
 * Returns an array of issue objects.
 */
function validateReading(reading, seenSequences, prevTimestampMs, prevDistanceKm) {
  const issues = [];

  // ── Required fields ────────────────────────────────────────────────────────
  if (reading.sequence_number == null) {
    issues.push({ field: 'sequence_number', code: 'MISSING_FIELD', severity: 'error' });
  }
  if (!reading.timestamp) {
    issues.push({ field: 'timestamp', code: 'MISSING_FIELD', severity: 'error' });
  }
  if (reading.speed_kmh == null) {
    issues.push({ field: 'speed_kmh', code: 'MISSING_FIELD', severity: 'warning' });
  }
  if (reading.distance_km == null) {
    issues.push({ field: 'distance_km', code: 'MISSING_FIELD', severity: 'warning' });
  }

  // ── Duplicate sequence number ──────────────────────────────────────────────
  if (reading.sequence_number != null) {
    if (seenSequences.has(reading.sequence_number)) {
      issues.push({ field: 'sequence_number', code: 'DUPLICATE_SEQUENCE', severity: 'error',
        detail: `seq=${reading.sequence_number}` });
    } else {
      seenSequences.add(reading.sequence_number);
    }
  }

  // ── Timestamp checks ───────────────────────────────────────────────────────
  if (reading.timestamp) {
    const ts = new Date(reading.timestamp).getTime();
    if (isNaN(ts)) {
      issues.push({ field: 'timestamp', code: 'INVALID_TIMESTAMP', severity: 'error' });
    } else {
      const now = Date.now();
      if (ts > now + 60000) {
        issues.push({ field: 'timestamp', code: 'FUTURE_TIMESTAMP', severity: 'error', detail: reading.timestamp });
      }
      if (now - ts > RULES.MAX_TIMESTAMP_AGE_MS) {
        issues.push({ field: 'timestamp', code: 'STALE_TIMESTAMP', severity: 'warning', detail: reading.timestamp });
      }
      if (prevTimestampMs && ts < prevTimestampMs) {
        issues.push({ field: 'timestamp', code: 'OUT_OF_ORDER_TIMESTAMP', severity: 'warning' });
      }
    }
  }

  // ── Speed range ────────────────────────────────────────────────────────────
  if (reading.speed_kmh != null) {
    if (typeof reading.speed_kmh !== 'number' || isNaN(reading.speed_kmh)) {
      issues.push({ field: 'speed_kmh', code: 'INVALID_TYPE', severity: 'error' });
    } else if (reading.speed_kmh < RULES.MIN_SPEED_KMH || reading.speed_kmh > RULES.MAX_SPEED_KMH) {
      issues.push({ field: 'speed_kmh', code: 'OUT_OF_RANGE', severity: 'error',
        detail: `${reading.speed_kmh} km/h (allowed: ${RULES.MIN_SPEED_KMH}–${RULES.MAX_SPEED_KMH})` });
    }
  }

  // ── Acceleration range ────────────────────────────────────────────────────
  if (reading.acceleration_ms2 != null) {
    if (typeof reading.acceleration_ms2 !== 'number' || isNaN(reading.acceleration_ms2)) {
      issues.push({ field: 'acceleration_ms2', code: 'INVALID_TYPE', severity: 'warning' });
    } else if (reading.acceleration_ms2 < RULES.MIN_ACCEL_MS2 || reading.acceleration_ms2 > RULES.MAX_ACCEL_MS2) {
      issues.push({ field: 'acceleration_ms2', code: 'OUT_OF_RANGE', severity: 'warning',
        detail: `${reading.acceleration_ms2} m/s² (allowed: ${RULES.MIN_ACCEL_MS2}–${RULES.MAX_ACCEL_MS2})` });
    }
  }

  // ── Distance consistency ──────────────────────────────────────────────────
  if (reading.distance_km != null && prevDistanceKm != null) {
    if (reading.distance_km < prevDistanceKm - 0.01) { // tiny tolerance for floating point
      issues.push({ field: 'distance_km', code: 'DISTANCE_DECREASED', severity: 'warning',
        detail: `${reading.distance_km} < previous ${prevDistanceKm}` });
    }
  }

  return issues;
}

/**
 * Validate a full batch of readings.
 * Returns a structured validation result.
 */
function validateReadings(readings) {
  if (!Array.isArray(readings)) {
    return {
      status: 'review_required',
      valid_count: 0,
      total_count: 0,
      error_count: 1,
      warning_count: 0,
      issues: [{ code: 'INVALID_INPUT', severity: 'error', detail: 'readings must be an array' }],
      review_reasons: ['Input was not a valid array of readings'],
      completeness_pct: 0,
    };
  }

  const seenSequences = new Set();
  const allIssues = [];
  let errorCount = 0;
  let warningCount = 0;
  let validCount = 0;
  const readingResults = [];
  let prevTimestampMs = null;
  let prevDistanceKm = null;

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const issues = validateReading(r, seenSequences, prevTimestampMs, prevDistanceKm);
    const hasError = issues.some(iss => iss.severity === 'error');
    const hasWarning = issues.some(iss => iss.severity === 'warning');

    if (!hasError) validCount++;
    if (hasError)   errorCount++;
    if (hasWarning) warningCount++;

    allIssues.push(...issues.map(iss => ({ ...iss, reading_index: i, sequence_number: r.sequence_number })));

    readingResults.push({
      index: i,
      sequence_number: r.sequence_number,
      status: hasError ? 'error' : hasWarning ? 'warning' : 'valid',
      issues,
    });

    // Update prev state (use last-seen valid values)
    if (r.timestamp && !isNaN(new Date(r.timestamp).getTime())) {
      prevTimestampMs = new Date(r.timestamp).getTime();
    }
    if (r.distance_km != null) prevDistanceKm = r.distance_km;
  }

  // ── Minimum reading check ──────────────────────────────────────────────────
  if (readings.length < RULES.MIN_READING_COUNT) {
    allIssues.push({
      code: 'INSUFFICIENT_READINGS',
      severity: 'error',
      detail: `${readings.length} readings received; minimum is ${RULES.MIN_READING_COUNT}`,
      reading_index: null,
    });
    errorCount++;
  }

  // ── Determine overall status ───────────────────────────────────────────────
  const completeness = readings.length > 0 ? (validCount / readings.length) : 0;
  const reviewReasons = [];

  let status;
  if (errorCount === 0 && warningCount === 0) {
    status = 'valid';
  } else if (errorCount === 0) {
    status = 'warning';
  } else {
    // High error rate → review required
    const errorRate = errorCount / Math.max(readings.length, 1);
    if (errorRate > 0.3 || readings.length < RULES.MIN_READING_COUNT) {
      status = 'review_required';
      if (errorRate > 0.3) reviewReasons.push(`High error rate: ${(errorRate * 100).toFixed(1)}% of readings have errors`);
      if (readings.length < RULES.MIN_READING_COUNT) reviewReasons.push(`Insufficient readings: ${readings.length} (minimum ${RULES.MIN_READING_COUNT})`);
    } else {
      status = 'warning';
    }
  }

  // Collect unique review reasons from issues
  const issueTypes = new Set(allIssues.filter(i => i.severity === 'error').map(i => i.code));
  if (issueTypes.has('DUPLICATE_SEQUENCE')) reviewReasons.push('Duplicate sequence numbers detected');
  if (issueTypes.has('STALE_TIMESTAMP'))    reviewReasons.push('Stale or outdated timestamps detected');
  if (issueTypes.has('OUT_OF_RANGE'))       reviewReasons.push('Out-of-range sensor values detected');
  if (issueTypes.has('FUTURE_TIMESTAMP'))   reviewReasons.push('Future timestamps detected');

  return {
    status,
    valid_count: validCount,
    total_count: readings.length,
    error_count: errorCount,
    warning_count: warningCount,
    completeness_pct: parseFloat((completeness * 100).toFixed(1)),
    issues: allIssues,
    reading_results: readingResults,
    review_reasons: [...new Set(reviewReasons)],
    validated_at: new Date().toISOString(),
  };
}

module.exports = { validateReadings, validateReading, RULES };
