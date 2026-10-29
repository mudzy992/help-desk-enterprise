import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../e2e/package.json', import.meta.url));
const { config } = require('dotenv');
const pg = require('pg');
import { seedAssets } from './assets.mjs';
import { seedCatalog } from './catalog.mjs';
import { cleanOperationalData } from './clean.mjs';
import { loadContext } from './context.mjs';
import { seedKnowledge } from './knowledge.mjs';
import { seedChanges } from './work-changes.mjs';
import { seedProblems } from './work-problems.mjs';
import { seedTickets } from './work-tickets.mjs';

for (const path of ['e2e/.env', 'backend/.env', '.env']) {
  if (existsSync(path)) config({ path, quiet: true });
}

const connectionString = process.env.DATABASE_URL ?? process.env.E2E_DATABASE_URL;
if (!connectionString) {
  console.error('Postavi DATABASE_URL');
  process.exit(2);
}
const databaseName = new URL(connectionString).pathname.replace(/^\//, '');
if (!/dev|test|staging|local/i.test(databaseName)) {
  console.error(`Odbijeno: baza ${databaseName} nije prepoznata kao dev/test`);
  process.exit(2);
}

const client = new pg.Client({ connectionString });
await client.connect();
await client.query(`SET statement_timeout = '180s'`);
try {
  await client.query('BEGIN');
  await cleanOperationalData(client);
  const context = await loadContext(client);
  const services = await seedCatalog(client, context);
  await seedKnowledge(client, context, services);
  await seedAssets(client, context);
  await seedTickets(client, context, services);
  await seedProblems(client, context, services);
  await seedChanges(client, context, services);
  const summary = await client.query(`
    SELECT
      (SELECT count(*) FROM "Service")::int AS services,
      (SELECT count(*) FROM "RoutingRule")::int AS routes,
      (SELECT count(*) FROM "Ticket")::int AS tickets,
      (SELECT count(*) FROM "Problem")::int AS problems,
      (SELECT count(*) FROM "ChangeRequest")::int AS changes,
      (SELECT count(*) FROM "KnowledgeArticle")::int AS articles,
      (SELECT count(*) FROM "Asset")::int AS assets,
      (SELECT count(*) FROM "Announcement")::int AS announcements,
      (SELECT count(*) FROM "ServiceIncident" WHERE status <> 'RESOLVED')::int AS open_incidents,
      (SELECT count(*) FROM "OnCallSchedule")::int AS on_call,
      (SELECT count(*) FROM "User")::int AS users,
      (SELECT count(*) FROM "AppSetting")::int AS settings
  `);
  console.log(JSON.stringify(summary.rows[0]));
  await client.query('COMMIT');
  console.log('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('ROLLBACK', error.message);
  if (error.detail) console.error(error.detail);
  if (error.constraint) console.error(error.constraint, error.table);
  process.exitCode = 1;
} finally {
  await client.end();
}
