/**
 * INSURE — Database Purge & Real 4-Users Realignment Script
 *
 * 1. Reassigns all legacy telematics data from demo@insure.test to tharunkumark4743@gmail.com
 * 2. Purges all 35+ Alice Driver test accounts and demo accounts
 * 3. Enforces EXACTLY 4 real verified team accounts with clean names and active status:
 *    - Tharun Kumar (Admin)           [admin]
 *    - Compliance Officer (VSBEC IT) [compliance_officer]
 *    - Tharun Kumar                  [customer]
 *    - Krishnathidhan .T             [customer]
 * 4. Ensures active sovereign consents for all customer drivers.
 */

import 'dotenv/config';
import { executeQueryWithRetry } from '../db/pgClient';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  console.log('=== STARTING DATABASE PURGE & REAL 4-USERS REALIGNMENT ===');

  // Step 1: Query the 4 target users
  const targetEmails = [
    'tharunkumark42007@gmail.com', // Admin
    'vsbecitc2428@gmail.com',       // Compliance
    'tharunkumark4743@gmail.com',   // Driver 1
    'krishnathidhan@gmail.com',     // Driver 2
  ];

  const targetUsersRes = await executeQueryWithRetry(
    `SELECT id, email, full_name, role FROM users WHERE email = ANY($1::text[])`,
    [targetEmails]
  );

  console.log(`Found ${targetUsersRes.rows.length} of 4 target users in DB.`);
  const userMap = new Map<string, string>();
  targetUsersRes.rows.forEach((r: any) => userMap.set(r.email, r.id));

  const primaryDriverId = userMap.get('tharunkumark4743@gmail.com');
  if (!primaryDriverId) {
    throw new Error('Primary driver tharunkumark4743@gmail.com not found in database!');
  }

  // Step 2: Find demo@insure.test if present and reassign records to primary driver
  const demoRes = await executeQueryWithRetry(
    `SELECT id FROM users WHERE email = 'demo@insure.test'`
  );

  if (demoRes.rows.length > 0) {
    const demoId = demoRes.rows[0].id;
    console.log(`[Reassign] Reassigning demo@insure.test (${demoId}) records to primary driver (${primaryDriverId})...`);

    const reassignTables = [
      'trips',
      'telemetry_readings',
      'trip_metrics',
      'risk_assessments',
      'quotes',
      'review_cases',
      'pricing_disputes',
      'simulation_sessions',
      'accident_records',
      'vehicles',
    ];

    for (const tbl of reassignTables) {
      try {
        const updateRes = await executeQueryWithRetry(
          `UPDATE ${tbl} SET user_id = $1 WHERE user_id = $2`,
          [primaryDriverId, demoId]
        );
        console.log(`  ✓ ${tbl}: ${updateRes.rowCount} rows reassigned`);
      } catch (e: any) {
        console.warn(`  ! Could not reassign ${tbl}: ${e.message}`);
      }
    }
  }

  // Target User IDs whitelist
  const allowedUserIds = Array.from(userMap.values());
  console.log(`Allowed target user IDs (${allowedUserIds.length}):`, allowedUserIds);

  // Step 3: Purge dependent child records of all non-whitelisted users
  console.log('[Purge] Removing child records for all dummy and test users...');
  const childTables = [
    'otp_challenges',
    'password_reset_authorizations',
    'simulation_sessions',
    'pricing_disputes',
    'vehicles',
    'consents',
    'review_cases',
    'risk_assessments',
    'quotes',
    'telemetry_readings',
    'trip_metrics',
    'trips',
    'accident_records',
    'audit_events',
    'audit_logs',
    'financial_scenarios',
  ];

  for (const tbl of childTables) {
    try {
      const delRes = await executeQueryWithRetry(
        `DELETE FROM ${tbl} WHERE user_id IS NOT NULL AND NOT (user_id = ANY($1::uuid[]))`,
        [allowedUserIds]
      );
      if (delRes.rowCount > 0) {
        console.log(`  ✓ Purged ${delRes.rowCount} orphan rows from ${tbl}`);
      }
    } catch (e: any) {
      console.warn(`  ! Warning on ${tbl}: ${e.message}`);
    }
  }

  // Step 4: Delete all users NOT in the allowed list
  console.log('[Purge] Deleting dummy users from users table...');
  const delUsersRes = await executeQueryWithRetry(
    `DELETE FROM users WHERE NOT (id = ANY($1::uuid[]))`,
    [allowedUserIds]
  );
  console.log(`✓ Deleted ${delUsersRes.rowCount} dummy user accounts (Alice Driver, demo, test accounts).`);

  // Step 5: Update the remaining 4 users to have clean, accurate names and verified status
  console.log('[Update] Ensuring real names, verified emails, and active status for the 4 users...');
  
  await executeQueryWithRetry(`
    UPDATE users SET 
      full_name = 'Tharun Kumar (Admin)', 
      role = 'admin', 
      status = 'active', 
      is_email_verified = true 
    WHERE email = 'tharunkumark42007@gmail.com'
  `);

  await executeQueryWithRetry(`
    UPDATE users SET 
      full_name = 'Compliance Officer (VSBEC IT)', 
      role = 'compliance_officer', 
      status = 'active', 
      is_email_verified = true 
    WHERE email = 'vsbecitc2428@gmail.com'
  `);

  await executeQueryWithRetry(`
    UPDATE users SET 
      full_name = 'Tharun Kumar', 
      role = 'customer', 
      status = 'active', 
      is_email_verified = true 
    WHERE email = 'tharunkumark4743@gmail.com'
  `);

  await executeQueryWithRetry(`
    UPDATE users SET 
      full_name = 'Krishnathidhan .T', 
      role = 'customer', 
      status = 'active', 
      is_email_verified = true 
    WHERE email = 'krishnathidhan@gmail.com'
  `);

  // Step 6: Ensure active consents exist for both customer drivers
  const customerIds = [
    userMap.get('tharunkumark4743@gmail.com'),
    userMap.get('krishnathidhan@gmail.com'),
  ].filter(Boolean);

  const now = new Date().toISOString();
  for (const cId of customerIds) {
    const existing = await executeQueryWithRetry(
      `SELECT id FROM consents WHERE user_id = $1 AND status = 'granted'`,
      [cId]
    );
    if (existing.rows.length === 0) {
      await executeQueryWithRetry(
        `INSERT INTO consents (id, user_id, purpose, version, status, granted_at, created_at, updated_at)
         VALUES ($1, $2, 'telematics_processing', 'v1.0', 'granted', $3, $3, $3)`,
        [uuidv4(), cId, now]
      );
      console.log(`  ✓ Inserted active consent for customer ${cId}`);
    }
  }

  // Step 7: Final Verification
  const finalUsers = await executeQueryWithRetry(
    `SELECT id, email, full_name, role, status, is_email_verified FROM users ORDER BY role ASC, full_name ASC;`
  );

  console.log('\n=== FINAL DATABASE USER AUDIT ===');
  console.log(`Total Users in DB: ${finalUsers.rows.length} (Expected: 4)`);
  console.table(finalUsers.rows);

  // Check data counts for drivers
  for (const r of finalUsers.rows) {
    const trips = await executeQueryWithRetry(`SELECT count(*) as count FROM trips WHERE user_id = $1`, [r.id]);
    const quotes = await executeQueryWithRetry(`SELECT count(*) as count FROM quotes WHERE user_id = $1`, [r.id]);
    const consents = await executeQueryWithRetry(`SELECT count(*) as count FROM consents WHERE user_id = $1`, [r.id]);
    console.log(`User: ${r.full_name} (${r.role}) -> Trips: ${trips.rows[0].count}, Quotes: ${quotes.rows[0].count}, Consents: ${consents.rows[0].count}`);
  }

  console.log('=== DATABASE CLEANSE COMPLETED SUCCESSFULLY ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error during database cleanse:', err);
  process.exit(1);
});
