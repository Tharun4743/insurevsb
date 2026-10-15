/**
 * Database Migration Script
 * Executes SQL migrations against Supabase PostgreSQL if configured (via DATABASE_URL or Supabase client),
 * or logs a status report for in-memory mode.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export async function runMigrations(): Promise<void> {
  console.log('[INSURE-MIGRATE] Starting database migrations...');

  const migrationsDir = path.join(__dirname, '../../migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error(`[INSURE-MIGRATE] Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`[INSURE-MIGRATE] Found ${migrationFiles.length} migration files: ${migrationFiles.join(', ')}`);

  // 1. Direct PostgreSQL connection via DATABASE_URL
  if (process.env.DATABASE_URL) {
    console.log('[INSURE-MIGRATE] Connecting directly via DATABASE_URL...');
    const { Client } = require('pg');
    const sslConfig = process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false };
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
    });

    try {
      await client.connect();
      console.log('[INSURE-MIGRATE] Connected to remote PostgreSQL database.');

      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      const { rows: appliedRows } = await client.query('SELECT filename FROM schema_migrations');
      const appliedMap = new Set(appliedRows.map((r: any) => r.filename));

      if (appliedMap.size === 0) {
        const checkExisting = await client.query(`
          SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('quotes', 'users');
        `);
        if (checkExisting.rows.length >= 2) {
          for (const prev of ['001_initial.sql', '002_auth_otp_roles.sql', '003_telematics_pricing_corrections.sql']) {
            if (migrationFiles.includes(prev)) {
              await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [prev]);
              appliedMap.add(prev);
              console.log(`[INSURE-MIGRATE] - Pre-existing migration ${prev} recorded in schema_migrations.`);
            }
          }
        }
      }

      for (const file of migrationFiles) {
        if (appliedMap.has(file)) {
          console.log(`[INSURE-MIGRATE] - ${file} already applied, skipping.`);
          continue;
        }
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`[INSURE-MIGRATE] Executing ${file}...`);
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        console.log(`[INSURE-MIGRATE] ✓ ${file} applied successfully.`);
      }

      console.log('[INSURE-MIGRATE] ✓ All migrations checked and applied successfully!');
      await client.end();
      return;
    } catch (err: any) {
      console.error('[INSURE-MIGRATE] PostgreSQL connection/query error:', err.message);
      await client.end().catch(() => {});
      console.error('[INSURE-MIGRATE] Note: Ensure database password, project ref, and SSL settings are correct in Supabase.');
      throw err;
    }
  }

  // 2. Supabase API client fallback
  const { isSupabaseConfigured, getClient } = require('./client');
  if (isSupabaseConfigured()) {
    const db = getClient();
    try {
      for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`[INSURE-MIGRATE] Executing ${file} via Supabase RPC...`);
        const { error } = await db.rpc('exec_sql', { query: sql });
        if (error) {
          console.warn(`[INSURE-MIGRATE] RPC failed for ${file}. Please run migrations in the Supabase SQL Editor.`);
        } else {
          console.log(`[INSURE-MIGRATE] ✓ ${file} executed successfully.`);
        }
      }
    } catch (err: any) {
      console.error('[INSURE-MIGRATE] Error running migration:', err.message);
    }
    return;
  }

  console.log('[INSURE-MIGRATE] Supabase / DATABASE_URL not fully configured in .env.');
  console.log('[INSURE-MIGRATE] Using InMemoryStore — tables and schemas are active in memory.');
}

if (require.main === module) {
  runMigrations().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
