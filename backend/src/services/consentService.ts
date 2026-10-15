/**
 * Consent Service
 * Manages consent records, enforcement, and audit logging.
 */

import { v4 as uuidv4 } from 'uuid';

const { getClient } = require('../db/client');
const { logAuditEvent } = require('./auditService');

export const CONSENT_VERSION = 'v1.0';
export const CONSENT_PURPOSE = 'telematics_processing';

export async function getConsent(userId: string): Promise<any> {
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

export async function hasActiveConsent(userId: string): Promise<boolean> {
  const consent = await getConsent(userId);
  return consent && consent.status === 'granted';
}

export async function grantConsent(userId: string): Promise<any> {
  const db = getClient();
  const now = new Date().toISOString();

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

export async function withdrawConsent(userId: string): Promise<any> {
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
