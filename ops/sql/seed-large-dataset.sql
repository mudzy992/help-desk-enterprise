-- Staging dataset za mjerenje (stavka 3 iz plana): N tiketa + SLA stanja, da
-- `k6 run perf/full.js` i SLA skener rade na realnoj veličini, a ne na demo seedu.
--
-- Zašto SQL, a ne Prisma skript: 100k redova preko klijenta traje satima, a ovdje je
-- jedan `INSERT … SELECT generate_series()`. Nema novih zavisnosti.
--
-- Pokretanje (staging; prvo pusti install seed da postoje korisnik/OU/servis/forma):
--   psql "$DATABASE_URL" -v seed_count=100000 -f ops/sql/seed-large-dataset.sql
--   psql "$DATABASE_URL" -v seed_count=100000 -v open_ratio=0.9 -f ops/sql/seed-large-dataset.sql
--
-- Sigurno za ponovno pokretanje: briše samo svoje redove (title prefiks
-- `[staging-seed]`), ne dira postojeće tikete. Sve u jednoj transakciji.
--
-- ⚠ Prvi run je ujedno i provjera: ako se ime kolone razlikuje od šeme na stagingu,
--   `psql` će stati na tom koraku (ON_ERROR_STOP) — pošalji grešku i popravlja se.
--
-- Namjerno NE dira: `TicketMessage`, `TicketActivity`, participante, privitke —
-- mjere se lista/detalj/SLA skener, a ne razgovor u tiketu.

\if :{?seed_count}
\else
\set seed_count 100000
\endif
\if :{?open_ratio}
\else
\set open_ratio 0.9
\endif
\set ON_ERROR_STOP on

BEGIN;

-- 0) Preduslovi: bez ovih redova nema validnog tiketa (FK-ovi su Restrict).
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(name, ', ')
  INTO missing
  FROM (
    SELECT 'User' AS name WHERE (SELECT count(*) FROM "User") = 0
    UNION ALL SELECT 'OrganizationalUnit' WHERE (SELECT count(*) FROM "OrganizationalUnit") = 0
    UNION ALL SELECT 'Service' WHERE (SELECT count(*) FROM "Service") = 0
    UNION ALL SELECT 'FormVersion' WHERE (SELECT count(*) FROM "FormVersion") = 0
  ) missing_rows;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'staging seed: nedostaju redovi u: %. Pusti prvo install seed (POST /install/seed).', missing;
  END IF;
END $$;

-- 1) Idempotencija: prvo SLA stanja (FK), pa tiketi iz prethodnog seeda.
DELETE FROM "TicketSlaState" s
USING "Ticket" t
WHERE s."ticketId" = t.id AND t.title LIKE '[staging-seed]%';

DELETE FROM "Ticket" WHERE title LIKE '[staging-seed]%';

-- 2) Tiketi. Statusi prate `open_ratio`: ostatak ide u RESOLVED/CLOSED, da i
--    arhivski upiti imaju šta raditi.
WITH users AS (
  SELECT id, (row_number() OVER (ORDER BY id) - 1) AS rn, count(*) OVER () AS total
  FROM "User"
),
fallback_group AS (
  SELECT id FROM "Group" ORDER BY "isFallback" DESC, id LIMIT 1
),
unit AS (SELECT id FROM "OrganizationalUnit" ORDER BY id LIMIT 1),
service AS (SELECT id FROM "Service" ORDER BY id LIMIT 1),
form_version AS (SELECT id FROM "FormVersion" ORDER BY id LIMIT 1)
INSERT INTO "Ticket" (
  id, "ticketNumber", title, description, status, priority, impact, urgency,
  classification, "isConfidential", "originUnitId", "serviceId", "formVersionId",
  "requesterId", "assignedGroupId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'SEED-' || lpad(i::text, 7, '0'),
  '[staging-seed] ' || (ARRAY['VPN ne radi', 'Ne mogu u štampanje', 'Pristup folderu', 'Lozinka istekla', 'Spor laptop'])[1 + (i % 5)],
  'Generisano za mjerenje performansi (ops/sql/seed-large-dataset.sql). Red ' || i || '.',
  CASE
    WHEN i % 100 >= round(100 * :open_ratio) THEN (ARRAY['RESOLVED', 'CLOSED'])[1 + (i % 2)]::"TicketStatus"
    WHEN i % 7 = 0 THEN 'WAITING_FOR_USER'::"TicketStatus"
    WHEN i % 5 = 0 THEN 'ASSIGNED'::"TicketStatus"
    ELSE 'IN_PROGRESS'::"TicketStatus"
  END,
  (ARRAY['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])[1 + (i % 4)]::"TicketPriority",
  (ARRAY['LOW', 'MEDIUM', 'HIGH'])[1 + (i % 3)]::"TicketImpact",
  (ARRAY['LOW', 'MEDIUM', 'HIGH'])[1 + (i % 3)]::"TicketUrgency",
  'INTERNAL'::"DataClassification",
  (i % 25 = 0),
  unit.id,
  service.id,
  form_version.id,
  users.id,
  fallback_group.id,
  now() - ((i % 90) || ' days')::interval - ((i % 1440) || ' minutes')::interval,
  now()
FROM generate_series(1, :seed_count) AS i
JOIN users ON users.rn = i % users.total
CROSS JOIN fallback_group
CROSS JOIN unit
CROSS JOIN service
CROSS JOIN form_version;

-- 3) SLA stanja za otvorene tikete. `nextDueAt` je ono što skener gleda
--    (`@@index([resolutionCompletedAt, nextDueAt])`, F2.1): ~5 % je već dospjelo
--    (skener ima posla), ostalo je razbacano unutar 14 dana.
INSERT INTO "TicketSlaState" (
  id, "ticketId", "responseMinutes", "resolutionMinutes", "startedAt",
  "responseDueAt", "resolutionDueAt", "resolutionCompletedAt", "nextDueAt",
  "isResolutionBreached", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  t.id,
  60,
  480,
  t."createdAt",
  t."createdAt" + interval '1 hour',
  t."createdAt" + interval '8 hours',
  CASE WHEN t.status IN ('RESOLVED', 'CLOSED') THEN t."createdAt" + interval '6 hours' END,
  CASE
    WHEN t.status IN ('RESOLVED', 'CLOSED') THEN NULL
    WHEN (('x' || substr(md5(t.id), 1, 8))::bit(32)::int % 100) < 5 THEN now() - interval '15 minutes'
    ELSE now() + (((('x' || substr(md5(t.id), 9, 8))::bit(32)::int % 20160) - 1) || ' minutes')::interval
  END,
  false,
  now()
FROM "Ticket" t
WHERE t.title LIKE '[staging-seed]%';

-- 4) Statistika + kontrola.
ANALYZE "Ticket";
ANALYZE "TicketSlaState";

COMMIT;

\echo '── kontrola ──'
SELECT count(*)                                              AS seed_tickets,
       count(*) FILTER (WHERE status IN ('RESOLVED', 'CLOSED')) AS finished,
       min("createdAt")::date                                AS oldest,
       max("createdAt")::date                                AS newest
FROM "Ticket" WHERE title LIKE '[staging-seed]%';

SELECT count(*)                       AS seed_sla_rows,
       count(*) FILTER (WHERE "nextDueAt" IS NOT NULL) AS with_next_due,
       count(*) FILTER (WHERE "nextDueAt" < now())     AS due_now
FROM "TicketSlaState" s
JOIN "Ticket" t ON t.id = s."ticketId"
WHERE t.title LIKE '[staging-seed]%';

\echo '── i plan-om traženi upit skenera (mora koristiti indeks, ne seq scan na 100k) ──'
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, "nextDueAt"
FROM "TicketSlaState"
WHERE "resolutionCompletedAt" IS NULL AND "nextDueAt" <= now()
ORDER BY "nextDueAt"
LIMIT 2000;

\echo '── obriši nakon mjerenja: ──'
\echo '   DELETE FROM "TicketSlaState" s USING "Ticket" t WHERE s."ticketId" = t.id AND t.title LIKE ''[staging-seed]%'';'
\echo '   DELETE FROM "Ticket" WHERE title LIKE ''[staging-seed]%'';'
