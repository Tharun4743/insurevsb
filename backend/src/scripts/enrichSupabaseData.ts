/**
 * INSURE — Supabase Comprehensive Data Enrichment Script (Strict Schema Aligned)
 */

import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const { getClient } = require('../db/client');

export async function enrichData() {
  console.log('[ENRICH] Starting Supabase PostgreSQL Data Enrichment...');
  const db = getClient();
  const now = new Date().toISOString();

  // 1. Fetch real customer and compliance officer users
  const { data: users } = await db.from('users').select('id, email, full_name, role');
  const customer = users?.find((u: any) => u.email === 'tharunkumark4743@gmail.com') ||
                   users?.find((u: any) => u.role === 'customer');
  const complianceOfficer = users?.find((u: any) => u.email === 'vsbecitc2428@gmail.com') ||
                            users?.find((u: any) => u.role === 'compliance_officer');
  const admin = users?.find((u: any) => u.email === 'tharunkumark42007@gmail.com') ||
                users?.find((u: any) => u.role === 'admin');

  if (!customer || !admin) {
    console.error('[ENRICH ERROR] Customer or Admin user not found!');
    return;
  }

  console.log(`[ENRICH] Customer: ${customer.email} (${customer.id})`);
  console.log(`[ENRICH] Admin: ${admin.email} (${admin.id})`);

  // 2. Add / Verify Consent for Customer
  const { data: existingConsent } = await db.from('consents').select('*').eq('user_id', customer.id);
  if (!existingConsent || existingConsent.length === 0) {
    console.log('[ENRICH] Adding sovereign privacy consent for customer...');
    await db.from('consents').insert({
      id: uuidv4(),
      user_id: customer.id,
      purpose: 'telematics_processing',
      version: 'v1.0',
      status: 'granted',
      granted_at: now,
      withdrawn_at: null,
      created_at: now,
      updated_at: now,
    });
    console.log('[ENRICH] ✓ Consents table populated.');
  }

  // 3. Add Trips with Strict Allowed Scenarios
  const trip1Id = uuidv4();
  const trip2Id = uuidv4();
  const trip3Id = uuidv4();

  const tripRecords = [
    {
      id: trip1Id,
      user_id: customer.id,
      scenario: 'scenario_a_safe',
      source: 'simulator',
      synthetic: true,
      status: 'valid',
      reading_count: 60,
      started_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      ended_at: new Date(Date.now() - 86400000 * 2 + 1800000).toISOString(),
      created_at: now,
      updated_at: now,
    },
    {
      id: trip2Id,
      user_id: customer.id,
      scenario: 'scenario_c_first_accident_safe',
      source: 'simulator',
      synthetic: true,
      status: 'valid',
      reading_count: 80,
      started_at: new Date(Date.now() - 86400000).toISOString(),
      ended_at: new Date(Date.now() - 86400000 + 2400000).toISOString(),
      created_at: now,
      updated_at: now,
    },
    {
      id: trip3Id,
      user_id: customer.id,
      scenario: 'scenario_b_risky_no_accidents',
      source: 'simulator',
      synthetic: true,
      status: 'warning',
      reading_count: 75,
      started_at: new Date(Date.now() - 14400000).toISOString(),
      ended_at: new Date(Date.now() - 12600000).toISOString(),
      created_at: now,
      updated_at: now,
    },
  ];

  for (const tr of tripRecords) {
    await db.from('trips').insert(tr);
    console.log(`[ENRICH] ✓ Trip added: ${tr.id} (${tr.scenario})`);
  }

  // 4. Add Risk Assessments for Trips
  const assess1Id = uuidv4();
  const assess2Id = uuidv4();
  const assess3Id = uuidv4();

  const assessments = [
    {
      id: assess1Id,
      user_id: customer.id,
      trip_id: trip1Id,
      score: 94,
      safety_score: 94,
      driving_risk_score: 94,
      risk_category: 'low_risk',
      data_confidence: 'high',
      status: 'scored',
      factor_contributions: JSON.stringify({
        speeding_risk: 0,
        speeding_penalty: 0,
        braking_risk: 2,
        braking_penalty: 1,
        acceleration_risk: 2,
        acceleration_penalty: 1,
        cornering_risk: 1,
        cornering_penalty: 1,
        unsafe_usage_risk: 0,
        unsafe_usage_penalty: 0,
      }),
      explanation: 'Exceptional driving adherence: smooth urban acceleration, constant helmet detection, zero speeding breaches.',
      rule_version: 'v2.1-profitability',
      created_at: now,
    },
    {
      id: assess2Id,
      user_id: customer.id,
      trip_id: trip2Id,
      score: 88,
      safety_score: 88,
      driving_risk_score: 88,
      risk_category: 'low_risk',
      data_confidence: 'high',
      status: 'scored',
      factor_contributions: JSON.stringify({
        speeding_risk: 8,
        speeding_penalty: 3,
        braking_risk: 6,
        braking_penalty: 2,
        acceleration_risk: 4,
        acceleration_penalty: 1,
        cornering_risk: 4,
        cornering_penalty: 1,
        unsafe_usage_risk: 0,
        unsafe_usage_penalty: 0,
      }),
      explanation: 'Safe highway commute with steady cruising speeds under 80 km/h and consistent safety equipment usage.',
      rule_version: 'v2.1-profitability',
      created_at: now,
    },
    {
      id: assess3Id,
      user_id: customer.id,
      trip_id: trip3Id,
      score: 72,
      safety_score: 72,
      driving_risk_score: 72,
      risk_category: 'moderate_risk',
      data_confidence: 'high',
      status: 'scored',
      factor_contributions: JSON.stringify({
        speeding_risk: 15,
        speeding_penalty: 6,
        braking_risk: 25,
        braking_penalty: 10,
        acceleration_risk: 12,
        acceleration_penalty: 4,
        cornering_risk: 8,
        cornering_penalty: 3,
        unsafe_usage_risk: 0,
        unsafe_usage_penalty: 0,
      }),
      explanation: 'Stop-and-go heavy peak traffic conditions resulted in 3 abrupt braking instances on Outer Ring Road.',
      rule_version: 'v2.1-profitability',
      created_at: now,
    },
  ];

  for (const as of assessments) {
    await db.from('risk_assessments').insert(as);
    console.log(`[ENRICH] ✓ Risk assessment added: ${as.id} (Score ${as.safety_score})`);
  }

  // 5. Add Dynamic Actuarial Quotes
  const quote1Id = uuidv4();
  const quote2Id = uuidv4();
  const quote3Id = uuidv4();

  const quotes = [
    {
      id: quote1Id,
      user_id: customer.id,
      trip_id: trip1Id,
      assessment_id: assess1Id,
      base_premium: 2000,
      behaviour_adjustment: -200,
      behaviour_adjustment_pct: -10,
      accident_adjustment: 0,
      accident_adjustment_pct: 0,
      illustrative_estimate: 1800,
      status: 'generated',
      currency: 'INR',
      rule_version: 'v2.1-profitability',
      explanation: 'Driver qualified for Tier 1 Safe Driver 10% Discount (Score 94/100).',
      created_at: now,
    },
    {
      id: quote2Id,
      user_id: customer.id,
      trip_id: trip2Id,
      assessment_id: assess2Id,
      base_premium: 2000,
      behaviour_adjustment: -200,
      behaviour_adjustment_pct: -10,
      accident_adjustment: 0,
      accident_adjustment_pct: 0,
      illustrative_estimate: 1800,
      status: 'generated',
      currency: 'INR',
      rule_version: 'v2.1-profitability',
      explanation: 'Driver qualified for Tier 1 Safe Driver 10% Discount (Score 88/100).',
      created_at: now,
    },
    {
      id: quote3Id,
      user_id: customer.id,
      trip_id: trip3Id,
      assessment_id: assess3Id,
      base_premium: 2000,
      behaviour_adjustment: 0,
      behaviour_adjustment_pct: 0,
      accident_adjustment: 0,
      accident_adjustment_pct: 0,
      illustrative_estimate: 2000,
      status: 'generated',
      currency: 'INR',
      rule_version: 'v2.1-profitability',
      explanation: 'Standard baseline approved rate applied (Score 72/100).',
      created_at: now,
    },
  ];

  for (const q of quotes) {
    await db.from('quotes').insert(q);
    console.log(`[ENRICH] ✓ Quote added: ${q.id} (₹${q.illustrative_estimate})`);
  }

  // 6. Add Pricing Disputes (Populates Compliance & Customer Disputes)
  const disputes = [
    {
      id: uuidv4(),
      user_id: customer.id,
      quote_id: quote3Id,
      trip_id: trip3Id,
      reason: 'Pedestrian Emergency Yield',
      explanation: 'Hard braking event on Outer Ring Road was necessitated by a pedestrian stepping onto the active carriage lane without warning.',
      status: 'pending',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: uuidv4(),
      user_id: customer.id,
      quote_id: quote3Id,
      trip_id: trip3Id,
      reason: 'Ambulance Clearance Manoeuvre',
      explanation: 'Brief speed surge and lane adjustment to yield right-of-way to an emergency ambulance with sirens active.',
      status: 'under_review',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 43200000).toISOString(),
    },
    {
      id: uuidv4(),
      user_id: customer.id,
      quote_id: quote2Id,
      trip_id: trip2Id,
      reason: 'Pothole Evasion False Vibration',
      explanation: 'Severe road surface defect registered as harsh deceleration vibration by accelerometer sensor.',
      status: 'resolved',
      officer_decision: 'resolved',
      officer_explanation: 'Verified via Bangalore BBMP road maintenance alert log. Sensor vibration outlier neutralized.',
      reviewed_by: complianceOfficer?.id || admin?.id,
      reviewed_at: new Date(Date.now() - 3600000).toISOString(),
      created_at: new Date(Date.now() - 172800000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    },
  ];

  for (const disp of disputes) {
    await db.from('pricing_disputes').insert(disp);
    console.log(`[ENRICH] ✓ Pricing dispute added (${disp.status}: ${disp.reason})`);
  }

  // 7. Add Underwriting Review Cases (Populates Review Center)
  const reviewCases = [
    {
      id: uuidv4(),
      trip_id: trip3Id,
      assessment_id: assess3Id,
      user_id: customer.id,
      reason: 'Customer disputed peak-hour braking events. Requires human reviewer verification before quote lock.',
      status: 'pending',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: uuidv4(),
      trip_id: trip2Id,
      assessment_id: assess2Id,
      user_id: customer.id,
      reason: 'First accident separation rule audit: Confirm provisional collision status is decoupled from driving score.',
      status: 'resolved',
      reviewer_decision: 'resolved',
      reviewer_explanation: 'Confirmed actuarial compliance: Claims indemnity processed independently of telematics tier.',
      reviewer_id: complianceOfficer?.id || admin?.id,
      reviewed_at: new Date(Date.now() - 1800000).toISOString(),
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 1800000).toISOString(),
    },
  ];

  for (const rc of reviewCases) {
    await db.from('review_cases').insert(rc);
    console.log(`[ENRICH] ✓ Review case added (${rc.status}: ${rc.reason.slice(0, 40)}…)`);
  }

  // 8. Add Financial Scenarios (Populates Portfolio Growth & Profitability)
  const financialScenarios = [
    {
      user_id: admin.id,
      scenario_name: 'Baseline 2026 Fleet Growth (10k EV Two-Wheelers)',
      strategy_type: 'moderate_growth',
      customer_count: 10000,
      avg_annual_premium: 2000,
      premium_revenue: 20000000,
      claims_incurred: 11600000,
      operating_expenses: 3200000,
      platform_costs: 800000,
      acquisition_cost: 1500000,
      total_expenses: 17100000,
      underwriting_profit: 2900000,
      profit_margin_pct: 14.5,
      model_assumptions: JSON.stringify({
        loss_ratio: 0.58,
        expense_ratio: 0.275,
        combined_ratio: 0.855,
        safe_driver_share: 0.62,
        retention_rate: 0.88,
      }),
      rule_version: 'v2.1-profitability',
      created_at: now,
    },
    {
      user_id: admin.id,
      scenario_name: 'Aggressive Telematics Adoption (15% Safe Driver Discount)',
      strategy_type: 'aggressive_telematics',
      customer_count: 15000,
      avg_annual_premium: 1850,
      premium_revenue: 27750000,
      claims_incurred: 12210000,
      operating_expenses: 3800000,
      platform_costs: 1100000,
      acquisition_cost: 1800000,
      total_expenses: 18910000,
      underwriting_profit: 8840000,
      profit_margin_pct: 31.85,
      model_assumptions: JSON.stringify({
        loss_ratio: 0.44,
        expense_ratio: 0.241,
        combined_ratio: 0.681,
        safe_driver_share: 0.74,
        retention_rate: 0.94,
      }),
      rule_version: 'v2.1-profitability',
      created_at: now,
    },
    {
      user_id: admin.id,
      scenario_name: 'Monsoon Extreme Weather Stress Test (Catastrophic Loss Surge)',
      strategy_type: 'stress_test',
      customer_count: 10000,
      avg_annual_premium: 2200,
      premium_revenue: 22000000,
      claims_incurred: 15840000,
      operating_expenses: 3500000,
      platform_costs: 900000,
      acquisition_cost: 1600000,
      total_expenses: 21840000,
      underwriting_profit: 160000,
      profit_margin_pct: 0.73,
      model_assumptions: JSON.stringify({
        loss_ratio: 0.72,
        expense_ratio: 0.273,
        combined_ratio: 0.993,
        safe_driver_share: 0.50,
        retention_rate: 0.82,
      }),
      rule_version: 'v2.1-profitability',
      created_at: now,
    },
  ];

  for (const fs of financialScenarios) {
    const { data: ex } = await db.from('financial_scenarios').select('id').eq('scenario_name', fs.scenario_name);
    if (!ex || ex.length === 0) {
      await db.from('financial_scenarios').insert(fs);
      console.log(`[ENRICH] ✓ Financial scenario added: ${fs.scenario_name}`);
    }
  }

  console.log('[ENRICH] ✨ All tables successfully populated with rich actuarial data in remote Supabase PostgreSQL!');
}

if (require.main === module) {
  enrichData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[ENRICH FATAL]:', err);
      process.exit(1);
    });
}
