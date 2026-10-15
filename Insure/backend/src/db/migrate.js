/**
 * Database Migration Script
 * Executes SQL migrations against Supabase PostgreSQL if configured (via DATABASE_URL or Supabase client),
 * or logs a status report for in-memory mode.
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function runMigrations() {
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

      for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`[INSURE-MIGRATE] Executing ${file}...`);
        await client.query(sql);
        console.log(`[INSURE-MIGRATE] ✓ ${file} applied successfully.`);
      }

      console.log('[INSURE-MIGRATE] ✓ All migrations applied successfully!');
      await client.end();
      return;
    } catch (err) {
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
    } catch (err) {
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

module.exports = { runMigrations };
