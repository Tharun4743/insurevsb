/**
 * Audit Service
 * Records important events to the audit_events table.
 * Never logs secrets or unnecessary sensitive data.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../db/client');

/**
 * Log an audit event.
 * @param {string} userId     Subject user
 * @param {string} eventType  e.g. 'consent_granted', 'trip_submitted'
 * @param {Object} metadata   Safe, non-secret metadata
 */
async function logAuditEvent(userId, eventType, metadata = {}) {
  try {
    const db = getClient();
    const record = {
      id: uuidv4(),
      user_id: userId,
      event_type: eventType,
      metadata: JSON.stringify(metadata),
      created_at: new Date().toISOString(),
    };
    await db.from('audit_events').insert(record);
  } catch (err) {
    // Audit failures must not crash the main request
    console.error('[AUDIT] Failed to log event:', eventType, err.message);
  }
}

async function getAuditHistory(userId, limit = 100) {
  const db = getClient();
  const { data, error } = await db
    .from('audit_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data || []).map(e => ({
    ...e,
    metadata: safeParseJson(e.metadata),
  }));
}

function safeParseJson(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
}

module.exports = { logAuditEvent, getAuditHistory };
