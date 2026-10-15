/**
 * Accident & Claims History Service
 *
 * Strictly stores and assesses accident history SEPARATELY from driving behaviour telematics.
 *
 * Core Fair Principles:
 *  1. An accident does NOT automatically mean driver fault (could be third-party, road/weather).
 *  2. A first accident must trigger a fair reassessment, NOT an automatic highest-risk classification.
 *  3. Claim amount alone is NEVER proof of unsafe driving.
 *  4. Legitimate claims are NEVER reduced or rejected because of a driver's risk score.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../db/client');

/**
 * Retrieve verified accident and claims history for a user.
 *
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function getAccidentHistory(userId) {
  const db = getClient();
  const { data: records, error } = await db
    .from('accident_records')
    .select('*')
    .eq('user_id', userId)
    .order('accident_date', { ascending: false });

  if (error) {
    console.warn('[AccidentService] Error querying accident_records:', error.message);
    return {
      records: [],
      previous_accidents_count: 0,
      claim_frequency: 0,
      total_claim_amount: 0,
      fault_status: 'unknown',
      most_recent_incident: null,
      claims_non_discrimination_statement: 'Legitimate insurance claims are never reduced or rejected merely because of a driver risk score.',
    };
  }

  const list = records || [];
  const count = list.length;
  const totalAmount = list.reduce((sum, r) => sum + (parseFloat(r.claim_amount) || 0), 0);

  // Determine overall fault profile
  let faultStatus = 'unknown';
  if (count > 0) {
    const hasDriverFault = list.some(r => r.fault_status === 'driver_fault');
    const hasThirdParty = list.some(r => r.fault_status === 'third_party_fault');
    const hasWeather = list.some(r => r.fault_status === 'no_fault_weather');

    if (hasDriverFault) {
      faultStatus = 'driver_fault';
    } else if (hasThirdParty) {
      faultStatus = 'third_party_fault';
    } else if (hasWeather) {
      faultStatus = 'no_fault_weather';
    } else {
      faultStatus = 'unknown';
    }
  }

  return {
    records: list,
    previous_accidents_count: count,
    claim_frequency: count,
    total_claim_amount: parseFloat(totalAmount.toFixed(2)),
    fault_status: faultStatus,
    most_recent_incident: list[0] || null,
    claims_non_discrimination_statement: 'Legitimate insurance claims are never reduced or rejected merely because of a driver risk score.',
  };
}

/**
 * Record a new accident or claim event.
 */
async function recordAccident(userId, accidentData) {
  const db = getClient();
  const now = new Date().toISOString();
  const record = {
    id: uuidv4(),
    user_id: userId,
    driver_name: accidentData.driver_name || 'Demo Driver',
    accident_date: accidentData.accident_date || now,
    fault_status: accidentData.fault_status || 'unknown',
    claim_frequency: accidentData.claim_frequency || 1,
    claim_severity: accidentData.claim_severity || 'minor',
    claim_amount: accidentData.claim_amount || 0.00,
    is_verified: accidentData.is_verified !== false,
    description: accidentData.description || 'Verified accident record',
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await db.from('accident_records').insert(record);
  if (error) {
    throw new Error(`Failed to record accident: ${error.message}`);
  }
  return data;
}

/**
 * Clear accidents for user (used for resetting tests / simulations).
 */
async function clearAccidents(userId) {
  const db = getClient();
  const { data, error } = await db.from('accident_records').delete().eq('user_id', userId);
  if (error) {
    console.warn('[AccidentService] Error clearing accident_records:', error.message);
  }
  return data;
}

/**
 * Prepare realistic accident records for the 5 demonstration scenarios.
 */
async function seedScenarioAccidents(userId, scenario) {
  const db = getClient();
  const now = new Date().toISOString();

  // Reset existing accidents for clean scenario demonstration
  await clearAccidents(userId);

  if (scenario === 'scenario_c_first_accident_safe') {
    // Scenario C: First accident for an otherwise safe driver
    // Crucially: Third-party fault or unknown fault, NOT automatically high risk
    await db.from('accident_records').insert({
      id: uuidv4(),
      user_id: userId,
      driver_name: 'Driver A (Consistent Safe)',
      accident_date: new Date(Date.now() - 7 * 86400000).toISOString(),
      fault_status: 'third_party_fault',
      claim_frequency: 1,
      claim_severity: 'minor',
      claim_amount: 15400.00,
      is_verified: true,
      description: 'Rear-ended at traffic signal while safely stationary. Third-party driver admitted fault on police report.',
      created_at: now,
      updated_at: now,
    });
  } else if (scenario === 'scenario_d_repeated_accidents_risky') {
    // Scenario D: Multiple verified at-fault incidents
    await db.from('accident_records').insert([
      {
        id: uuidv4(),
        user_id: userId,
        driver_name: 'Driver B (High Risk)',
        accident_date: new Date(Date.now() - 40 * 86400000).toISOString(),
        fault_status: 'driver_fault',
        claim_frequency: 2,
        claim_severity: 'moderate',
        claim_amount: 38000.00,
        is_verified: true,
        description: 'Intersection collision caused by unsafe lane change. Verified driver fault.',
        created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
        updated_at: now,
      },
      {
        id: uuidv4(),
        user_id: userId,
        driver_name: 'Driver B (High Risk)',
        accident_date: new Date(Date.now() - 10 * 86400000).toISOString(),
        fault_status: 'driver_fault',
        claim_frequency: 2,
        claim_severity: 'moderate',
        claim_amount: 62000.00,
        is_verified: true,
        description: 'Rear-end impact on wet NH48 due to tailgating. Verified driver fault.',
        created_at: now,
        updated_at: now,
      }
    ]);
  }
}

module.exports = {
  getAccidentHistory,
  recordAccident,
  clearAccidents,
  seedScenarioAccidents,
};
