/**
 * Health & Database Check Routes
 * GET /api/health or /health
 */
'use strict';

const express = require('express');
const { getClient, isRealDb, isSupabaseConfigured } = require('../db/client');

const router = express.Router();

router.get('/', async (req, res) => {
  let dbStatus = 'ok';
  let dbDetails = null;

  try {
    const db = getClient();
    const { error } = await db.from('trips').select('id').limit(1);
    if (error) {
      dbStatus = `error: ${error.message}`;
    }
  } catch (e) {
    dbStatus = `error: ${e.message}`;
  }

  const isHealthy = !dbStatus.startsWith('error');

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'INSURE Backend API',
    version: '1.0.0',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      type: isRealDb() ? 'supabase_postgresql' : 'in_memory_development',
      configured: isSupabaseConfigured(),
      status: dbStatus,
    },
    features: {
      simulator: 'operational',
      risk_scoring: 'operational',
      pricing_engine: 'operational',
      profitability_engine: 'operational',
      accident_records: 'operational',
    },
    disclaimer: 'INSURE Telematics Prototype — Production Ready Deployment Build.',
  });
});

// Liveness probe (always returns 200 if process is running)
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive', uptime: Math.floor(process.uptime()) });
});

// Readiness probe (verifies database client)
router.get('/ready', async (req, res) => {
  try {
    const db = getClient();
    const { error } = await db.from('trips').select('id').limit(1);
    if (error) {
      return res.status(503).json({ status: 'not_ready', error: error.message });
    }
    return res.status(200).json({ status: 'ready' });
  } catch (err) {
    return res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

module.exports = router;

