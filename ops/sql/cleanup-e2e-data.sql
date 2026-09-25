-- Brisanje podataka koje ostavlja E2E paket (e2e/tests) — i, po izboru, staging seed.
--
-- Šta se briše (samo prepoznatljivi E2E tragovi):
--   * tiketi čiji naslov počinje s 'E2E '            (svi testovi 01–09)
--   * servisi sa slug-om 'e2e-%'                      (createOfferedService, testovi 02/03/06)
--     + njihove verzije formi, routing pravila, SLA pravila, close codeovi
--   * notifikacije vezane za te tikete (+ NotificationReceipt kaskadno)
--   * uz -v include_seed=1 i tiketi '[staging-seed]%' iz ops/sql/seed-large-dataset.sql
--
-- Šta se NAMJERNO ne dira:
--   * korisnici (E2E_USER/E2E_AGENT su na stagingu pravi nalozi)
--   * audit log i verzije konfiguracije (test 09) — audit je nepromjenjiv po dizajnu,
--     a verzije konfiguracije su historija aktivacija/rollbacka
--   * IntegrationJob redovi (istorija reda poslova; ističu po retention politici)
--
-- Pokretanje (podrazumijevano je PROBA — sve se izbroji pa ROLLBACK):
--   psql "$DATABASE_URL" -f ops/sql/cleanup-e2e-data.sql
--   psql "$DATABASE_URL" -v apply=1 -f ops/sql/cleanup-e2e-data.sql
--   psql "$DATABASE_URL" -v apply=1 -v include_seed=1 -f ops/sql/cleanup-e2e-data.sql
-- ili preko ops/cleanup-e2e-data.sh (docker exec u Postgres kontejner).

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif
\if :{?include_seed}
\else
  \set include_seed 0
\endif

BEGIN;

CREATE TEMP TABLE e2e_services ON COMMIT DROP AS
  SELECT id FROM "Service" WHERE slug LIKE 'e2e-%';

CREATE TEMP TABLE e2e_tickets ON COMMIT DROP AS
  SELECT id FROM "Ticket"
  WHERE title LIKE 'E2E %'
     OR "serviceId" IN (SELECT id FROM e2e_services)
     OR (:include_seed = 1 AND title LIKE '[staging-seed]%');

SELECT
  (SELECT count(*) FROM e2e_tickets)  AS tiketi_za_brisanje,
  (SELECT count(*) FROM e2e_services) AS servisi_za_brisanje,
  (SELECT count(*) FROM "Notification"
     WHERE "ticketId" IN (SELECT id FROM e2e_tickets)) AS notifikacije_za_brisanje;

-- Notifikacije bi ostale kao siročad (FK je SET NULL) — brišu se eksplicitno.
DELETE FROM "Notification" WHERE "ticketId" IN (SELECT id FROM e2e_tickets);

-- Veze između tiketa (split/merge/reopen) su SET NULL; ostalo (poruke, aktivnosti,
-- SLA stanje, odobrenja, CSAT, privici, grantovi, break-glass…) je CASCADE.
DELETE FROM "Ticket" WHERE id IN (SELECT id FROM e2e_tickets);
-- Paket 1.4 (test 16): E2E šabloni i playbookovi (koraci/opsezi idu kaskadno).
DELETE FROM "TicketPlaybook"   WHERE "playbookId" IN (SELECT id FROM "Playbook" WHERE name LIKE 'E2E %');
DELETE FROM "Playbook"         WHERE name LIKE 'E2E %';
DELETE FROM "ResponseTemplate" WHERE name LIKE 'E2E %';

-- Servisi: prvo sve što ih referencira s RESTRICT.
DELETE FROM "RoutingRule"                  WHERE "serviceId" IN (SELECT id FROM e2e_services);
DELETE FROM "KnowledgeInterceptResolution" WHERE "serviceId" IN (SELECT id FROM e2e_services);
DELETE FROM "KnowledgeArticle"             WHERE "serviceId" IN (SELECT id FROM e2e_services);
DELETE FROM "FormVersion"                  WHERE "serviceId" IN (SELECT id FROM e2e_services);
DELETE FROM "Service"                      WHERE id IN (SELECT id FROM e2e_services);

SELECT
  (SELECT count(*) FROM "Ticket"  WHERE title LIKE 'E2E %')  AS preostali_e2e_tiketi,
  (SELECT count(*) FROM "Service" WHERE slug LIKE 'e2e-%')   AS preostali_e2e_servisi;

\if :apply
  COMMIT;
  \echo 'PRIMIJENJENO (COMMIT).'
\else
  ROLLBACK;
  \echo 'PROBA — ništa nije obrisano (ROLLBACK). Za stvarno brisanje: -v apply=1'
\endif
