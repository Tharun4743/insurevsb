/**
 * Customer Growth & Underwriting Profitability Routes
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth';
import {
  simulateStrategy,
  optimizePricingStrategies,
  DEFAULT_PRESETS,
  BASELINE_PRESET,
} from '../services/profitabilityService';
import { getClient } from '../db/client';
import { logAuditEvent } from '../services/auditService';
import { createError } from '../middleware/errorHandler';

const router = express.Router();
router.use(requireAuth);

const SimulateSchema = z.object({
  scenario_name: z.string().optional(),
  strategy_type: z.string().optional(),
  customer_count: z.number().int().min(0).optional(),
  existing_customers: z.number().int().min(0).optional(),
  renewal_rate_pct: z.number().min(0).max(100).optional(),
  new_customers_acquired: z.number().int().min(0).optional(),
  cac_per_customer: z.number().min(0).optional(),
  avg_annual_premium: z.number().min(0).default(1800),
  claims_incurred: z.number().min(0).optional(),
  claims_ratio_pct: z.number().min(0).max(200).optional(),
  claims_cost_per_policy: z.number().min(0).optional(),
  operating_expenses: z.number().min(0).default(500000),
  platform_costs: z.number().min(0).default(50000),
  acquisition_cost: z.number().min(0).optional(),
  other_expenses: z.number().min(0).default(0),
  target_underwriting_profit: z.number().optional(),
  assumptions_statement: z.string().optional(),
});

router.get('/presets', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data: users } = await db.from('users').select('id, role');
    const { data: quotes } = await db.from('quotes').select('illustrative_estimate');
    const { data: accidents } = await db.from('accident_records').select('claim_amount');

    const customerCount = (users || []).filter((u: any) => u.role === 'customer').length || 1;
    const allQuotes = quotes || [];
    const avgPremium = allQuotes.length > 0
      ? Math.round(allQuotes.reduce((s: number, q: any) => s + (parseFloat(q.illustrative_estimate) || 0), 0) / allQuotes.length)
      : 2000;
    const claimsTotal = (accidents || []).reduce((s: number, a: any) => s + (parseFloat(a.claim_amount) || 0), 0);

    const liveBaseline = {
      ...BASELINE_PRESET,
      customer_count: customerCount,
      avg_annual_premium: avgPremium,
      claims_incurred: claimsTotal,
    };

    res.json({
      baseline: liveBaseline,
      presets: DEFAULT_PRESETS,
      live_database_metrics: {
        total_customers: customerCount,
        avg_annual_premium: avgPremium,
        claims_incurred: claimsTotal,
      },
      disclaimer: 'Actuarial assumptions processed from live Supabase PostgreSQL records.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/simulate', async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = SimulateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const simulation = simulateStrategy(parsed.data);
    res.json(simulation);
  } catch (err) {
    next(err);
  }
});

router.post('/optimize', async (req: any, res: Response, next: NextFunction) => {
  try {
    let candidates = req.body.candidates;
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      candidates = [
        {
          name: 'Conservative (Modest Growth, Cautious Claims)',
          strategy_type: 'conservative',
          avg_annual_premium: 1900,
          existing_customers: 1000,
          renewal_rate_pct: 82,
          new_customers_acquired: 280,
          claims_incurred: 1250000,
          operating_expenses: 510000,
          platform_costs: 40000,
          cac_per_customer: 300,
        },
        {
          name: 'Expected INSURE Strategy (10% Discount, 1,300 Customers)',
          strategy_type: 'expected',
          avg_annual_premium: 1800,
          existing_customers: 1000,
          renewal_rate_pct: 88,
          new_customers_acquired: 420,
          claims_incurred: 1300000,
          operating_expenses: 500000,
          platform_costs: 50000,
          cac_per_customer: 250,
        },
        {
          name: 'Aggressive Discounting (20% Discount - Volume Focus)',
          strategy_type: 'aggressive_discount',
          avg_annual_premium: 1600,
          existing_customers: 1000,
          renewal_rate_pct: 90,
          new_customers_acquired: 500,
          claims_incurred: 1450000,
          operating_expenses: 520000,
          platform_costs: 55000,
          cac_per_customer: 250,
        },
        {
          name: 'Excessive Discount (30% Discount - Violates Cap)',
          strategy_type: 'excessive_discount',
          avg_annual_premium: 1400,
          existing_customers: 1000,
          renewal_rate_pct: 92,
          new_customers_acquired: 600,
          claims_incurred: 1550000,
          operating_expenses: 530000,
          platform_costs: 60000,
          cac_per_customer: 250,
        },
        {
          name: 'Status Quo Baseline (No Telematics / No Growth)',
          strategy_type: 'baseline',
          avg_annual_premium: 2000,
          customer_count: 1000,
          claims_incurred: 1200000,
          operating_expenses: 500000,
          platform_costs: 0,
          acquisition_cost: 0,
        },
      ];
    }

    const optimizationResult = optimizePricingStrategies(candidates, req.body.custom_baseline);

    await logAuditEvent(req.userId, 'pricing_optimization_executed', {
      evaluated_count: optimizationResult.evaluated_count,
      eligible_count: optimizationResult.eligible_count,
      selected_strategy: optimizationResult.selected_strategy?.scenario_name,
      selected_profit: optimizationResult.selected_strategy?.outcome.underwriting_profit,
    });

    res.json(optimizationResult);
  } catch (err) {
    next(err);
  }
});

router.get('/scenarios', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data, error } = await db
      .from('financial_scenarios')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return next(createError(500, error.message));
    res.json({ scenarios: data || [] });
  } catch (err) {
    next(err);
  }
});

router.post('/scenarios', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const now = new Date().toISOString();
    const body = req.body;

    const record = {
      id: uuidv4(),
      user_id: req.userId,
      scenario_name: body.scenario_name || 'Simulated Scenario',
      strategy_type: body.strategy_type || 'custom',
      customer_count: parseInt(body.customer_count, 10) || 1000,
      avg_annual_premium: parseFloat(body.avg_annual_premium) || 2000,
      premium_revenue: parseFloat(body.premium_revenue) || 0,
      claims_incurred: parseFloat(body.claims_incurred) || 0,
      operating_expenses: parseFloat(body.operating_expenses) || 0,
      platform_costs: parseFloat(body.platform_costs) || 0,
      acquisition_cost: parseFloat(body.acquisition_cost) || 0,
      total_expenses: parseFloat(body.total_expenses) || 0,
      underwriting_profit: parseFloat(body.underwriting_profit) || 0,
      profit_margin_pct: parseFloat(body.profit_margin_pct) || 0,
      model_assumptions: JSON.stringify(body.model_assumptions || {}),
      rule_version: 'v2.1-profitability',
      created_at: now,
    };

    const { data, error } = await db.from('financial_scenarios').insert(record);
    if (error) return next(createError(500, error.message));

    await logAuditEvent(req.userId, 'financial_scenario_saved', {
      scenario_name: record.scenario_name,
      underwriting_profit: record.underwriting_profit,
    });

    res.status(201).json({ scenario: record });
  } catch (err) {
    next(err);
  }
});

export default router;
