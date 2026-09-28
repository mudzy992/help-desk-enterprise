/*
 * Paket 2.5 (§9): dijagnostika `/reports/dashboard` na stvarnim podacima.
 * Samo čitanje. Pokreće se u backend kontejneru (cwd = app root):
 *   docker exec -i <backend> node - < perf/report-dashboard-explain.cjs
 *
 * 1. cijeli dashboard za krovnu OJ: 3× sekvencijalno i 5× paralelno;
 * 2. svaki SQL upit dashboarda posebno: trajanje + EXPLAIN (ANALYZE, BUFFERS);
 * 3. veličina tabela i broj konekcija u poolu.
 * Opcije: ORG_UNIT_ID (zadano krovna OJ), WINDOW_DAYS (zadano 30).
 */
const path = require('path');
const R = path.join(process.cwd(), 'dist/src/modules/reports/');
const { PrismaService } = require(path.join(process.cwd(), 'dist/src/common/prisma/prisma.service'));
const { buildReportsDashboard } = require(R + 'dashboard/build-reports-dashboard');
const { sqltag } = require('@prisma/client/runtime/client');

(async () => {
  const prisma = new PrismaService();
  const unitId =
    process.env.ORG_UNIT_ID ||
    (await prisma.organizationalUnit.findMany({ select: { id: true }, orderBy: { ouPath: 'asc' }, take: 1 }))[0]?.id;
  if (!unitId) throw new Error('Nema organizacionih jedinica.');
  const days = Number(process.env.WINDOW_DAYS || 30);
  const now = new Date();
  const query = { organizationalUnitId: unitId, from: new Date(now.getTime() - days * 86400000).toISOString(), to: now.toISOString() };
  const configuration = { reportsEnabled: true, addonEnabled: true, defaultWindowDays: days };
  const run = (client) => buildReportsDashboard({ prisma: client, configuration, query, now, unroutedLabel: 'Unrouted' });

  const [tickets] = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "Ticket"');
  console.log(`Ticket: ${tickets.n} redova, OJ ${unitId}, prozor ${days} d`);
  await run(prisma); // warm-up (pool, plan cache)

  const seq = [];
  for (let i = 0; i < 3; i++) { const t = Date.now(); await run(prisma); seq.push(Date.now() - t); }
  console.log(`dashboard sekvencijalno ms: ${seq.join(', ')}`);
  const t0 = Date.now();
  const par = await Promise.all(Array.from({ length: 5 }, async () => { const t = Date.now(); await run(prisma); return Date.now() - t; }));
  console.log(`dashboard 5 paralelno ms: ${par.join(', ')} (ukupno ${Date.now() - t0})`);

  // Snimi svaki $queryRaw koji dashboard pošalje, pa ga izmjeri i objasni zasebno.
  const captured = [];
  const recorder = new Proxy(prisma, {
    get(target, key) {
      if (key === '$queryRaw') {
        return (strings, ...values) => { captured.push(sqltag(strings, ...values)); return target.$queryRaw(strings, ...values); };
      }
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await run(recorder);
  for (const [index, sql] of captured.entries()) {
    const firstLine = sql.sql.replace(/\s+/g, ' ').trim().slice(0, 90);
    const t = Date.now();
    await prisma.$queryRawUnsafe(sql.sql, ...sql.values);
    const ms = Date.now() - t;
    const plan = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) ${sql.sql}`, ...sql.values);
    console.log(`\n=== Upit ${index + 1}: ${ms} ms — ${firstLine}…`);
    console.log(plan.map((row) => row['QUERY PLAN']).join('\n'));
  }

  const sizes = await prisma.$queryRawUnsafe(`
    SELECT relname AS tabela, n_live_tup::bigint AS redova, pg_size_pretty(pg_total_relation_size(relid)) AS velicina,
           last_analyze, last_autoanalyze
    FROM pg_stat_user_tables WHERE relname IN ('Ticket','TicketCsat','TicketSlaState','Group','Service') ORDER BY relname`);
  console.log('\n=== Tabele');
  for (const row of sizes) console.log(`${row.tabela}: ${row.redova} redova, ${row.velicina}, analyze ${row.last_analyze ?? row.last_autoanalyze ?? 'nikad'}`);
  const [pool] = await prisma.$queryRawUnsafe(
    "SELECT count(*)::int AS ukupno, count(*) FILTER (WHERE state = 'active')::int AS aktivne FROM pg_stat_activity WHERE datname = current_database()");
  const [settings] = await prisma.$queryRawUnsafe(
    "SELECT current_setting('work_mem') AS work_mem, current_setting('shared_buffers') AS shared_buffers, current_setting('max_parallel_workers_per_gather') AS parallel, current_setting('random_page_cost') AS random_page_cost");
  console.log(`konekcije: ${pool.ukupno} (aktivne ${pool.aktivne}); ${JSON.stringify(settings)}`);
  console.log(`DATABASE_URL connection_limit: ${(/connection_limit=(\d+)/.exec(process.env.DATABASE_URL || '') || [])[1] ?? 'zadano'}`);
  await prisma.$disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
