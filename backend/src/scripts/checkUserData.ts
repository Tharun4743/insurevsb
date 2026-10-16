import 'dotenv/config';
import { executeQueryWithRetry } from '../db/pgClient';

async function main() {
  const users = await executeQueryWithRetry(`SELECT id, email, full_name, role, status FROM users ORDER BY role, full_name;`);
  console.log(`Total DB Users: ${users.rows.length}`);
  console.table(users.rows);

  const customerCount = users.rows.filter((u: any) => u.role === 'customer').length;
  console.log(`Total customer drivers: ${customerCount}`);

  const trips = await executeQueryWithRetry(`SELECT count(*) as count FROM trips;`);
  console.log(`Total trips in DB: ${trips.rows[0].count}`);

  const quotes = await executeQueryWithRetry(`SELECT count(*) as count FROM quotes;`);
  console.log(`Total quotes in DB: ${quotes.rows[0].count}`);

  const aliceCheck = await executeQueryWithRetry(`SELECT count(*) as count FROM users WHERE email LIKE '%alice%' OR full_name LIKE '%Alice%' OR email = 'demo@insure.test';`);
  console.log(`Dummy / Alice / Demo accounts count: ${aliceCheck.rows[0].count}`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
