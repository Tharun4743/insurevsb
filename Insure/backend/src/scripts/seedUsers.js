/**
 * INSURE — Administrative and Compliance Officer Account Provisioning Script
 *
 * Securely provisions the initial Insurance Admin and Pricing & Compliance Officer accounts.
 * Passwords are encrypted with bcrypt.
 *
 * Usage:
 *   ADMIN_EMAIL=owner@insure.com ADMIN_PASSWORD=StrongPass123! npm run seed:users
 */

'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../db/client');

async function seedPrivilegedUsers() {
  console.log('[PROVISION] Provisioning initial Admin and Compliance Officer accounts...');
  const db = getClient();
  const now = new Date().toISOString();

  const defaultPassword = process.env.USER_DEFAULT_PASSWORD || '123456';

  const accounts = [
    {
      email: (process.env.ADMIN_EMAIL || 'tharunkumark42007@gmail.com').trim().toLowerCase(),
      fullName: 'Tharun Kumar (Admin)',
      password: defaultPassword,
      role: 'admin',
    },
    {
      email: (process.env.COMPLIANCE_EMAIL || 'vsbecitc2428@gmail.com').trim().toLowerCase(),
      fullName: 'Compliance Officer (VSBEC IT)',
      password: defaultPassword,
      role: 'compliance_officer',
    },
    {
      email: (process.env.CUSTOMER_EMAIL || 'tharunkumark4743@gmail.com').trim().toLowerCase(),
      fullName: 'Tharun Kumar (Customer)',
      password: defaultPassword,
      role: 'customer',
    },
    {
      email: 'admin@insure.test',
      fullName: 'Insurance Administrator',
      password: defaultPassword,
      role: 'admin',
    },
    {
      email: 'compliance@insure.test',
      fullName: 'Chief Compliance Officer',
      password: defaultPassword,
      role: 'compliance_officer',
    },
    {
      email: 'customer@insure.test',
      fullName: 'Alex Driver',
      password: defaultPassword,
      role: 'customer',
    },
    {
      email: 'demo@insure.test',
      fullName: 'Demo Driver',
      password: defaultPassword,
      role: 'customer',
    },
  ];

  for (const acc of accounts) {
    const { data: existing } = await db.from('users').select('*').eq('email', acc.email).limit(1);
    const passwordHash = await bcrypt.hash(acc.password, 10);

    if (existing && existing.length > 0) {
      console.log(`[PROVISION] Updating existing account: ${acc.email} (${acc.role})...`);
      await db.from('users').update({
        full_name: acc.fullName,
        password_hash: passwordHash,
        role: acc.role,
        status: 'active',
        is_email_verified: true,
        updated_at: now,
      }).eq('id', existing[0].id);
      console.log(`[PROVISION] ✓ Account updated: ${acc.email} [${acc.role}]`);
    } else {
      console.log(`[PROVISION] Creating new account: ${acc.email} (${acc.role})...`);
      const record = {
        id: uuidv4(),
        email: acc.email,
        full_name: acc.fullName,
        password_hash: passwordHash,
        role: acc.role,
        status: 'active',
        is_email_verified: true,
        email_verified_at: now,
        created_at: now,
        updated_at: now,
      };
      await db.from('users').insert(record);
      console.log(`[PROVISION] ✓ Account created: ${acc.email} [${acc.role}]`);
    }
  }

  console.log('[PROVISION] Initial privileged accounts successfully provisioned!');
}

if (require.main === module) {
  seedPrivilegedUsers()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[PROVISION] Error seeding accounts:', err.message);
      process.exit(1);
    });
}

module.exports = { seedPrivilegedUsers };
