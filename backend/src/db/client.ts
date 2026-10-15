/**
 * Database client singleton.
 * Uses PostgreSQL pool directly when DATABASE_URL is configured (connecting to Supabase),
 * or the Supabase JS client when API credentials are provided.
 * Strictly guarantees all persistence is stored in Supabase.
 */

let dbClient: any = null;
let usingRealDb: boolean = false;

export function getClient(): any {
  if (dbClient) return dbClient;

  // 1. Direct PostgreSQL connection to Supabase pooler
  if (process.env.DATABASE_URL) {
    const { pgClient } = require('./pgClient');
    dbClient = pgClient;
    usingRealDb = true;
    console.log('[DB] Strictly connected to remote Supabase PostgreSQL via DATABASE_URL');
    return dbClient;
  }

  // 2. Supabase API client
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    url &&
    key &&
    url !== 'https://placeholder.supabase.co' &&
    key !== 'placeholder-service-role-key'
  ) {
    const { createClient } = require('@supabase/supabase-js');
    dbClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    usingRealDb = true;
    console.log('[DB] Connected to Supabase via API client');
    return dbClient;
  }

  console.warn('[DB] Supabase not configured – using in-memory store fallback');
  dbClient = require('./inMemoryStore');
  usingRealDb = false;

  return dbClient;
}

export function isRealDb(): boolean {
  return usingRealDb;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
    (process.env.SUPABASE_URL &&
     process.env.SUPABASE_SERVICE_ROLE_KEY &&
     process.env.SUPABASE_URL !== 'https://placeholder.supabase.co' &&
     process.env.SUPABASE_SERVICE_ROLE_KEY !== 'placeholder-service-role-key')
  );
}
