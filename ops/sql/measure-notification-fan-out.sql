-- Mjerenje rizika 2: veličina grupa + fan-out notifikacija po događaju.
--
-- Zašto: `publish-created-notifications` šalje događaj **po korisniku** (jedan red u
-- `Notification` + jedan WS emit po primaocu). Kod grupe od 200 članova to je 200
-- emita po događaju; budžet u `PERF_BUDGETS.md` (< 500 emit-ova/s) pokriva samo
-- `group.feed-changed`, ne i ovaj sabirak. Ovim upitima se dobija stvarna slika s
-- staginga, pa se odluka o opciji A (`Notification.groupId` + seen-mark, 1 emit u
-- group sobu) donosi na brojkama, a ne na procjeni.
--
-- Pokretanje (staging):
--   psql "$DATABASE_URL" -f ops/sql/measure-notification-fan-out.sql
--   psql "$DATABASE_URL" -v window='1 hour' -f ops/sql/measure-notification-fan-out.sql
--
-- Najkorisnije je pustiti ovo **dok traje** k6 scenario s grupama (ili odmah poslije
-- njega), jer se tada u `Notification` vidi fan-out baš tog opterećenja.

\if :{?window}
\else
\set window '1 hour'
\endif
\set ON_ERROR_STOP on

\echo '── 1) veličine grupa (koliko primaoca jedan grupni događaj može imati) ──'
SELECT count(*)                                            AS groups,
       coalesce(max(members), 0)                           AS max_members,
       round(coalesce(avg(members), 0)::numeric, 1)        AS avg_members,
       count(*) FILTER (WHERE members > 10)                AS over_10,
       count(*) FILTER (WHERE members > 50)                AS over_50,
       count(*) FILTER (WHERE members > 200)               AS over_200
FROM (
  SELECT "groupId", count(*) AS members
  FROM "GroupMember"
  GROUP BY "groupId"
) per_group;

\echo '── 2) fan-out po događaju: redovi notifikacija za isti dedupeKey ──'
\echo '   (dedupeKey = `${type}:${eventId}` → jedan događaj = N redova = N emita)'
SELECT "dedupeKey",
       count(*)                        AS recipients,
       count(*) FILTER (WHERE "isRead") AS read_rows,
       min("createdAt")                AS first_row_at,
       max("createdAt")                AS last_row_at
FROM "Notification"
WHERE "createdAt" > now() - :'window'::interval
GROUP BY "dedupeKey"
ORDER BY recipients DESC
LIMIT 20;

\echo '── 3) sažetak za odluku: koliko događaja ima > 50 / > 200 primalaca ──'
WITH per_event AS (
  SELECT "dedupeKey", count(*) AS recipients
  FROM "Notification"
  WHERE "createdAt" > now() - :'window'::interval
  GROUP BY "dedupeKey"
)
SELECT count(*)                                                        AS events,
       coalesce(max(recipients), 0)                                    AS max_recipients,
       coalesce(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY recipients)::numeric, 1), 0) AS median_recipients,
       coalesce(round(percentile_cont(0.95) WITHIN GROUP (ORDER BY recipients)::numeric, 1), 0) AS p95_recipients,
       count(*) FILTER (WHERE recipients > 50)                          AS events_over_50,
       count(*) FILTER (WHERE recipients > 200)                         AS events_over_200
FROM per_event;

\echo '── 4) emit-ova/s iz notifikacija (uporedi s budžetom < 500/s) ──'
WITH bounds AS (
  SELECT min("createdAt") AS first_at, max("createdAt") AS last_at, count(*) AS rows
  FROM "Notification"
  WHERE "createdAt" > now() - :'window'::interval
)
SELECT rows                                                                AS notification_rows,
       round(greatest(extract(epoch FROM (last_at - first_at)), 1)::numeric, 1) AS window_seconds,
       round((rows / greatest(extract(epoch FROM (last_at - first_at)), 1))::numeric, 2) AS rows_per_second,
       round((rows / greatest(extract(epoch FROM (last_at - first_at)), 1) * 60)::numeric, 0) AS rows_per_minute
FROM bounds;

\echo '── 5) koliko notifikacija po primaocu (da se vidi da li idu u grupe ili pojedincima) ──'
SELECT count(*)                                             AS recipients_with_rows,
       round(coalesce(avg(rows), 0)::numeric, 1)            AS avg_rows_per_recipient,
       coalesce(max(rows), 0)                               AS max_rows_per_recipient
FROM (
  SELECT "userId", count(*) AS rows
  FROM "Notification"
  WHERE "createdAt" > now() - :'window'::interval
  GROUP BY "userId"
) per_user;
