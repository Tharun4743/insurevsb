/**
 * Audit Service
 * Records important events to the audit_events table.
 * Never logs secrets or unnecessary sensitive data.
 */

import { v4 as uuidv4 } from 'uuid';

const { getClient } = require('../db/client');

export async function logAuditEvent(userId: string, eventType: string, metadata: any = {}): Promise<void> {
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
  } catch (err: any) {
    console.error('[AUDIT] Failed to log event:', eventType, err.message);
  }
}

export async function getAuditHistory(userId: string, limit: number = 100): Promise<any[]> {
  const db = getClient();
  const { data, error } = await db
    .from('audit_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data || []).map((e: any) => ({
    ...e,
    metadata: safeParseJson(e.metadata),
  }));
}

export function safeParseJson(val: any): any {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
}
