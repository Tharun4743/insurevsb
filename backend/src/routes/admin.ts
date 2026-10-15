/**
 * INSURE — Insurance Admin / Owner Routes
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { getClient } from '../db/client';
import { logAuditEvent } from '../services/auditService';
import { createError } from '../middleware/errorHandler';

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get('/portfolio', async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();

    const { data: users } = await db.from('users').select('*');
    const { data: trips } = await db.from('trips').select('*');
    const { data: quotes } = await db.from('quotes').select('*');
    const { data: assessments } = await db.from('risk_assessments').select('*');
    const { data: disputes } = await db.from('pricing_disputes').select('*');

    const allUsers = users || [];
    const allQuotes = quotes || [];
    const allTrips = trips || [];
    const allAssessments = assessments || [];
    const allDisputes = disputes || [];

    const totalCustomers = allUsers.filter((u: any) => u.role === 'customer').length;
    const verifiedCustomers = allUsers.filter((u: any) => u.role === 'customer' && u.is_email_verified).length;

    const totalQuotes = allQuotes.length;
    const totalPremiumVolume = allQuotes.reduce((acc: number, q: any) => acc + (parseFloat(q.illustrative_estimate) || 0), 0);
    const avgPremium = totalQuotes > 0 ? Math.round(totalPremiumVolume / totalQuotes) : 0;

    const { data: accidents } = await db.from('accident_records').select('*');
    const { data: finScenarios } = await db.from('financial_scenarios').select('*').limit(1);
    const allAccidents = accidents || [];
    const totalClaimsAmount = allAccidents.reduce((acc: number, a: any) => acc + (parseFloat(a.claim_amount) || 0), 0);
    const lossRatioVal = totalPremiumVolume > 0 
      ? ((totalClaimsAmount / totalPremiumVolume) * 100).toFixed(1) + '%' 
      : '0.0%';
    const operatingExp = (finScenarios && finScenarios[0]?.operating_expenses) 
      ? parseFloat(finScenarios[0].operating_expenses) 
      : 0;
    const combinedRatioVal = totalPremiumVolume > 0
      ? (((totalClaimsAmount + operatingExp) / totalPremiumVolume) * 100).toFixed(1) + '%'
      : '0.0%';

    const scoredAssessments = allAssessments.filter((a: any) => a.safety_score != null);
    const lowRiskCount = scoredAssessments.filter((a: any) => a.safety_score >= 80).length;
    const mediumRiskCount = scoredAssessments.filter((a: any) => a.safety_score >= 50 && a.safety_score < 80).length;
    const highRiskCount = scoredAssessments.filter((a: any) => a.safety_score < 50).length;

    res.json({
      portfolio: {
        totalCustomers,
        verifiedCustomers,
        totalTrips: allTrips.length,
        totalQuotes,
        totalPremiumVolume,
        avgAnnualPremium: avgPremium,
        lossRatio: lossRatioVal,
        combinedRatio: combinedRatioVal,
        activeDisputes: allDisputes.filter((d: any) => d.status === 'pending').length,
        riskDistribution: {
          lowRisk: lowRiskCount,
          mediumRisk: mediumRiskCount,
          highRisk: highRiskCount,
        },
      },
      pricingConfig: {
        currency: process.env.CURRENCY || 'INR',
        currencySymbol: process.env.CURRENCY_SYMBOL || '₹',
        basePremium: parseFloat(process.env.BASE_PREMIUM || '2000') || 2000,
        maxAdjustment: parseFloat(process.env.MAX_RISK_ADJUSTMENT || '0.5') || 0.5,
        ruleVersion: process.env.PRICING_RULE_VERSION || 'v2.1-profitability',
      },
    });
  } catch (err) {
    next(err);
  }
});

const getUsersHandler = async (req: any, res: Response, next: NextFunction) => {
  try {
    const db = getClient();
    const { data: users, error } = await db
      .from('users')
      .select('id, email, full_name, role, status, is_email_verified, created_at')
      .order('created_at', { ascending: false });

    if (error) return next(createError(500, error.message));

    res.json({ users: users || [], customers: users || [] });
  } catch (err) {
    next(err);
  }
};
router.get('/users', getUsersHandler);
router.get('/customers', getUsersHandler);

const UpdateStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'pending_verification']),
});

const patchStatusHandler = async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = UpdateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    const db = getClient();
    const { data, error } = await db
      .from('users')
      .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) return next(createError(500, error.message));

    await logAuditEvent(req.userId, 'admin_user_status_updated', {
      target_user_id: req.params.id,
      new_status: parsed.data.status,
    });

    res.json({ message: `User status updated to ${parsed.data.status}.` });
  } catch (err) {
    next(err);
  }
};
router.patch('/users/:id/status', patchStatusHandler);
router.patch('/customers/:id/status', patchStatusHandler);

const PricingConfigSchema = z.object({
  basePremium: z.number().min(100),
  maxAdjustment: z.number().min(0.1).max(1.0),
  ruleVersion: z.string().min(2),
});

router.post('/pricing-config', async (req: any, res: Response, next: NextFunction) => {
  try {
    const parsed = PricingConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(createError(400, parsed.error.errors.map(e => e.message).join('; ')));
    }

    process.env.BASE_PREMIUM = parsed.data.basePremium.toString();
    process.env.MAX_RISK_ADJUSTMENT = parsed.data.maxAdjustment.toString();
    process.env.PRICING_RULE_VERSION = parsed.data.ruleVersion;

    await logAuditEvent(req.userId, 'admin_pricing_config_updated', parsed.data);

    res.json({
      message: 'Pricing configuration updated and applied successfully.',
      config: parsed.data,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
