import 'dotenv/config';
import { executeQueryWithRetry } from '../db/pgClient';

async function main() {
  try {
    const res = await executeQueryWithRetry(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log(`[Supabase Status] Connected successfully to remote Supabase instance!`);
    console.log(`[Supabase Status] Found ${res.rows.length} public tables in PostgreSQL database:`);
    res.rows.forEach((r: any) => console.log(`  - ${r.table_name}`));

    const usersRes = await executeQueryWithRetry(`SELECT count(*) as count FROM users;`);
    console.log(`[Supabase Status] Total users in DB: ${usersRes.rows[0].count}`);

    const migRes = await executeQueryWithRetry(`SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at ASC;`);
    console.log(`[Supabase Status] Migrations tracked in schema_migrations:`);
    migRes.rows.forEach((m: any) => console.log(`  - ${m.filename} (applied at ${m.applied_at})`));

    process.exit(0);
  } catch (err: any) {
    console.error('[Supabase Error]', err);
    process.exit(1);
  }
}

main();
