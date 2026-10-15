/**
 * Consent Service
 * Manages consent records, enforcement, and audit logging.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../db/client');
const { logAuditEvent } = require('./auditService');

const CONSENT_VERSION = 'v1.0';
const CONSENT_PURPOSE = 'telematics_processing';

async function getConsent(userId) {
  const db = getClient();
  const { data, error } = await db
    .from('consents')
    .select('*')
    .eq('user_id', userId)
    .eq('purpose', CONSENT_PURPOSE)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0] : null;
}

async function hasActiveConsent(userId) {
  const consent = await getConsent(userId);
  return consent && consent.status === 'granted';
}

async function grantConsent(userId) {
  const db = getClient();
  const now = new Date().toISOString();

  // Revoke any existing consent first
  await db.from('consents').update({ status: 'superseded', updated_at: now })
    .eq('user_id', userId).eq('purpose', CONSENT_PURPOSE).eq('status', 'granted');

  const record = {
    id: uuidv4(),
    user_id: userId,
    purpose: CONSENT_PURPOSE,
    version: CONSENT_VERSION,
    status: 'granted',
    granted_at: now,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await db.from('consents').insert(record).single();
  if (error) throw new Error(error.message);

  await logAuditEvent(userId, 'consent_granted', { purpose: CONSENT_PURPOSE, version: CONSENT_VERSION });
  return data || record;
}

async function withdrawConsent(userId) {
  const db = getClient();
  const now = new Date().toISOString();

  const { data, error } = await db.from('consents')
    .update({ status: 'withdrawn', withdrawn_at: now, updated_at: now })
    .eq('user_id', userId)
    .eq('purpose', CONSENT_PURPOSE)
    .eq('status', 'granted');

  if (error) throw new Error(error.message);

  await logAuditEvent(userId, 'consent_withdrawn', { purpose: CONSENT_PURPOSE });
  return { withdrawn: true };
}

module.exports = { getConsent, hasActiveConsent, grantConsent, withdrawConsent, CONSENT_VERSION, CONSENT_PURPOSE };
