/**
 * Database Migration Script
 * Executes the unified Supabase SQL schema against Supabase PostgreSQL if configured (via DATABASE_URL),
 * or logs a status report for in-memory mode.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { executeQueryWithRetry } from './pgClient';

dotenv.config();

export async function runMigrations(): Promise<void> {
  console.log('[INSURE-MIGRATE] Starting database migrations via unified Supabase schema...');

  // Locate the unified Supabase schema file
  const candidatePaths = [
    path.resolve(__dirname, '../../../supabase_schema.sql'),
    path.resolve(__dirname, '../../supabase_schema.sql'),
    path.resolve(process.cwd(), 'supabase_schema.sql'),
    path.resolve(process.cwd(), '../supabase_schema.sql'),
  ];

  const schemaPath = candidatePaths.find(p => fs.existsSync(p));

  if (!schemaPath) {
    console.error('[INSURE-MIGRATE] ERROR: supabase_schema.sql not found in workspace.');
    process.exit(1);
  }

  console.log(`[INSURE-MIGRATE] Found single query schema file at: ${schemaPath}`);

  // 1. Direct PostgreSQL connection via DATABASE_URL
  if (process.env.DATABASE_URL) {
    console.log('[INSURE-MIGRATE] Connecting directly to remote Supabase PostgreSQL...');
    try {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      console.log(`[INSURE-MIGRATE] Executing unified schema (${sql.length} characters)...`);
      await executeQueryWithRetry(sql);
      console.log('[INSURE-MIGRATE] ✓ Unified Supabase schema applied successfully!');
      return;
    } catch (err: any) {
      console.error('[INSURE-MIGRATE] PostgreSQL schema execution error:', err.message);
      process.exit(1);
    }
  }

  // 2. In-memory / mock database status
  console.log('[INSURE-MIGRATE] No remote DATABASE_URL configured. Running in in-memory mode.');
  console.log('[INSURE-MIGRATE] Initial in-memory entities are seeded on startup.');
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[INSURE-MIGRATE] Migration failed:', err);
      process.exit(1);
    });
}
