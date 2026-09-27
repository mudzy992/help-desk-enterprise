/*
 * Paket 2.5 (§11): SQL trend source vs. the TypeScript reference definitions,
 * on real data. Read-only. Run inside the backend container (cwd = app root):
 *   docker exec -i <backend> node - < perf/report-trends-parity.cjs
 * Loads every ticket into memory for the reference side — run it off-peak.
 */
const path = require('path');
const D = path.join(process.cwd(), 'dist/src/modules/reports/trends/');
const { PrismaService } = require(path.join(process.cwd(), 'dist/src/common/prisma/prisma.service'));
const { SqlReportTrendSource } = require(D + 'sql-report-trend-source');
const { InMemoryReportTrendSource } = require(D + 'in-memory-report-trend-source');
const { buildReportTrendBuckets } = require(D + 'build-report-trend-buckets');
(async () => {
  const prisma = new PrismaService();
  const tickets = await prisma.ticket.findMany({ select: { id: true, originUnitId: true, serviceId: true, assignedGroupId: true, priority: true, mergedIntoTicketId: true, createdAt: true, firstResponseAt: true, resolvedAt: true, closedAt: true } });
  const slaStates = await prisma.ticketSlaState.findMany({ select: { ticketId: true, respondedAt: true, isResponseBreached: true, resolutionCompletedAt: true, isResolutionBreached: true } });
  const csat = await prisma.ticketCsat.findMany({ select: { ticketId: true, rating: true, createdAt: true } });
  const services = await prisma.service.findMany({ select: { id: true, name: true } });
  const dataset = { tickets, slaStates, csat, serviceNames: new Map(services.map((s) => [s.id, s.name])) };
  const sql = new SqlReportTrendSource(prisma);
  const mem = new InMemoryReportTrendSource(() => dataset);
  const units = (await prisma.organizationalUnit.findMany({ select: { id: true } })).map((u) => u.id);
  const group = tickets.find((t) => t.assignedGroupId)?.assignedGroupId;
  const now = new Date();
  const day = (offset) => new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const scenarios = [
    { name: 'month36', from: day(-1080), to: day(0), granularity: 'month', units },
    { name: 'week26-A', from: day(-182), to: day(0), granularity: 'week', units: units.slice(0, Math.max(1, Math.ceil(units.length / 2))) },
    { name: 'day60-svc', from: day(-59), to: day(0), granularity: 'day', units, serviceId: services[0]?.id },
    { name: 'month12-prio-group', from: day(-360), to: day(0), granularity: 'month', units, priority: 'HIGH', groupId: group ?? undefined },
  ];
  const norm = (raw) => JSON.stringify({
    flow: raw.flow.map((r) => ({ ...r, p50Seconds: r.p50Seconds == null ? null : Math.round(r.p50Seconds * 1000) / 1000, p90Seconds: r.p90Seconds == null ? null : Math.round(r.p90Seconds * 1000) / 1000 })).sort((a, b) => (a.kind + a.bucket).localeCompare(b.kind + b.bucket)),
    csat: [...raw.csat].sort((a, b) => a.bucket - b.bucket),
    services: [...raw.services].sort((a, b) => a.serviceId.localeCompare(b.serviceId)),
  });
  let failed = 0;
  for (const s of scenarios) {
    const plan = buildReportTrendBuckets({ from: s.from, to: s.to, granularity: s.granularity, timeZone: process.env.REPORT_TZ || 'Europe/Sarajevo', now, maxMonths: 36 });
    const last = plan.buckets[plan.buckets.length - 1];
    const input = { organizationalUnitIds: s.units, serviceId: s.serviceId, groupId: s.groupId, priority: s.priority, boundaries: [...plan.buckets.map((b) => b.start), last.end], previous: plan.previous };
    const t = Date.now();
    const a = norm(await sql.load(input));
    const ms = Date.now() - t;
    const b = norm(await mem.load(input));
    const ok = a === b;
    if (!ok) { failed++; const A = JSON.parse(a), B = JSON.parse(b); for (const k of ['flow', 'csat', 'services']) if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) { console.log(s.name, k, 'SQL', JSON.stringify(A[k]).slice(0, 600)); console.log(s.name, k, 'MEM', JSON.stringify(B[k]).slice(0, 600)); } }
    console.log(s.name, ok ? 'PARITY OK' : 'MISMATCH', `buckets=${plan.buckets.length} sql_ms=${ms}`);
  }
  // Paket 2.5 §2.2: sanirani dashboard i uska grla vs. stara agregacija u memoriji.
  const R = path.join(process.cwd(), 'dist/src/modules/reports/');
  const { buildReportsDashboard } = require(R + 'dashboard/build-reports-dashboard');
  const { loadBottleneckDashboardFromSql } = require(R + 'bottleneck/sql-bottleneck-dashboard-store');
  const { aggregateBottleneckDashboard } = require(R + 'bottleneck/aggregate-bottleneck-dashboard');
  const { loadScopedReportTickets } = require(R + 'load-scoped-report-tickets');
  const withoutRaw = new Proxy(prisma, {
    get: (target, key) => (key === '$queryRaw' ? undefined : typeof target[key] === 'function' ? target[key].bind(target) : target[key]),
  });
  const close = (a, b, at = '') => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a)) ? [] : [`${at}: ${a} != ${b}`];
    if (a && b && typeof a === 'object') return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => close(a[k], b[k], `${at}.${k}`));
    return a === b ? [] : [`${at}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`];
  };
  const rootUnit = (await prisma.organizationalUnit.findMany({ select: { id: true, ouPath: true }, orderBy: { ouPath: 'asc' }, take: 1 }))[0];
  if (rootUnit) {
    const query = { organizationalUnitId: rootUnit.id };
    const configuration = { reportsEnabled: true, defaultWindowDays: 30 };
    const oldDashboard = await buildReportsDashboard({ prisma: withoutRaw, configuration, query, now });
    const t = Date.now();
    const newDashboard = await buildReportsDashboard({ prisma, configuration, query, now });
    const dashboardDiff = close(oldDashboard, newDashboard);
    if (dashboardDiff.length) { failed++; console.log(dashboardDiff.slice(0, 10).join('\n')); }
    console.log('dashboard', dashboardDiff.length ? 'MISMATCH' : 'PARITY OK', `sql_ms=${Date.now() - t}`);
    const window = { from: new Date(now.getTime() - 30 * 86400000), to: now };
    const oldBottleneck = aggregateBottleneckDashboard({ tickets: await loadScopedReportTickets(prisma, units, false), window });
    const newBottleneck = await loadBottleneckDashboardFromSql(prisma, units, window);
    const bottleneckOk = JSON.stringify(oldBottleneck) === JSON.stringify(newBottleneck);
    if (!bottleneckOk) failed++;
    console.log('bottleneck', bottleneckOk ? 'PARITY OK' : 'MISMATCH');
  }
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
