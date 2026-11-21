-- Brisanje tragova E2E full CI (noćni run svih specova u .github/workflows/ci.yml).
--
-- Poklapanje je prefiks, bez obzira na velika/mala slova: ILIKE 'e2e%'
-- (naslov "E2E …", slug "e2e-…", ključ "E2E_CAL_…", oznaka "E2E-…",
-- grupa "E2E Unrouted Target", jedinica "E2E-<stamp>-A").
-- Ulazna pošta testa 58 nema taj prefiks; subject "Val 6 inbound E2E …" ide posebno.
--
-- Šta full CI ostavlja i šta se briše kad red nosi taj prefiks (ili visi o takvom redu):
--   tiketi, servisi, forme, routing, close codeovi, notifikacije,
--   grupe (i članstva, dežurstvo, routing na tu grupu),
--   organizacione jedinice koje je test 38 napravio,
--   imovina, tipovi, uvozi, prenosi, ugovori, licence, lokacije,
--   problemi, promjene i šabloni promjena, incidenti statusne stranice,
--   najave, članci i kategorije baze znanja, playbookovi, šabloni odgovora,
--   rasporedi izvještaja, SLA profili i kalendari, zahtjevi ispitanika,
--   simulator Teams poruke, idempotency ključevi, ChangeLog razlozi sa E2E.
--   Uz -v include_seed=1 i tiketi '[staging-seed]%'.
--
-- Šta se NAMJERNO ne dira:
--   * korisnici (E2E_USER / E2E_AGENT / super admin i nalozi koje test 38 napravi).
--     Ako je kućna jedinica e2e jedinica, samo se odveže (organizationalUnitId = NULL).
--   * Role i Permission. UserRole koji visi o obrisanoj e2e jedinici ili usluzi
--     padne kaskadno s njom; nalog i sama rola ostaju.
--   * sigurnosne postavke: AppSetting, ConfigVersion, UserMfa, sesije, ključevi, lozinke.
--   * AuditLog i IntegrationJob (nema e2e ključa; audit je nepromjenjiv, jobovi ističu).
--   * dežurstvo i SLA eskalacija na postojećoj grupi/profilu — red nema e2e naziv
--     (specovi 44 i 50 ih brišu u finally; ako padnu, ostanu).
--
-- Pokretanje (podrazumijevano je PROBA — izbroji pa ROLLBACK):
--   psql "$DATABASE_URL" -f ops/sql/cleanup-e2e-data.sql
--   psql "$DATABASE_URL" -v apply=1 -f ops/sql/cleanup-e2e-data.sql
--   psql "$DATABASE_URL" -v apply=1 -v include_seed=1 -f ops/sql/cleanup-e2e-data.sql
-- ili preko ops/cleanup-e2e-data.sh.

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
  SELECT id FROM "Service" WHERE slug ILIKE 'e2e%' OR name ILIKE 'e2e%';

CREATE TEMP TABLE e2e_units ON COMMIT DROP AS
  SELECT id FROM "OrganizationalUnit" WHERE name ILIKE 'e2e%';

CREATE TEMP TABLE e2e_groups ON COMMIT DROP AS
  SELECT id FROM "Group"
  WHERE name ILIKE 'e2e%' OR key ILIKE 'e2e%'
     OR "organizationalUnitId" IN (SELECT id FROM e2e_units);

CREATE TEMP TABLE e2e_asset_types ON COMMIT DROP AS
  SELECT id FROM "AssetType"
  WHERE key ILIKE 'e2e%' OR "nameBs" ILIKE 'e2e%' OR "nameEn" ILIKE 'e2e%';

CREATE TEMP TABLE e2e_assets ON COMMIT DROP AS
  SELECT id FROM "Asset"
  WHERE name ILIKE 'e2e%' OR "assetTag" ILIKE 'e2e%'
     OR "typeId" IN (SELECT id FROM e2e_asset_types)
     OR "organizationalUnitId" IN (SELECT id FROM e2e_units);

CREATE TEMP TABLE e2e_tickets ON COMMIT DROP AS
  SELECT id FROM "Ticket"
  WHERE title ILIKE 'e2e%'
     OR title ILIKE 'Val 6 inbound E2E%'
     OR "serviceId" IN (SELECT id FROM e2e_services)
     OR "originUnitId" IN (SELECT id FROM e2e_units)
     OR (:include_seed = 1 AND title LIKE '[staging-seed]%');

CREATE TEMP TABLE e2e_problems ON COMMIT DROP AS
  SELECT id FROM "Problem"
  WHERE title ILIKE 'e2e%'
     OR "organizationalUnitId" IN (SELECT id FROM e2e_units)
     OR "serviceId" IN (SELECT id FROM e2e_services)
     OR id IN (SELECT "problemId" FROM "ProblemTicket" WHERE "ticketId" IN (SELECT id FROM e2e_tickets));

CREATE TEMP TABLE e2e_changes ON COMMIT DROP AS
  SELECT id FROM "ChangeRequest"
  WHERE title ILIKE 'e2e%'
     OR "organizationalUnitId" IN (SELECT id FROM e2e_units)
     OR "problemId" IN (SELECT id FROM e2e_problems)
     OR "templateId" IN (SELECT id FROM "ChangeTemplate" WHERE name ILIKE 'e2e%');

CREATE TEMP TABLE e2e_articles ON COMMIT DROP AS
  SELECT id FROM "KnowledgeArticle"
  WHERE title ILIKE 'e2e%' OR slug ILIKE 'e2e%'
     OR "serviceId" IN (SELECT id FROM e2e_services)
     OR "organizationalUnitId" IN (SELECT id FROM e2e_units);

CREATE TEMP TABLE e2e_incidents ON COMMIT DROP AS
  SELECT id FROM "ServiceIncident"
  WHERE title ILIKE 'e2e%' OR "titleEn" ILIKE 'e2e%';

SELECT
  (SELECT count(*) FROM e2e_tickets) AS tiketi,
  (SELECT count(*) FROM e2e_services) AS servisi,
  (SELECT count(*) FROM e2e_groups) AS grupe,
  (SELECT count(*) FROM e2e_units) AS jedinice,
  (SELECT count(*) FROM e2e_assets) AS imovina,
  (SELECT count(*) FROM e2e_asset_types) AS tipovi_imovine,
  (SELECT count(*) FROM e2e_problems) AS problemi,
  (SELECT count(*) FROM e2e_changes) AS promjene,
  (SELECT count(*) FROM e2e_articles) AS clanci,
  (SELECT count(*) FROM e2e_incidents) AS incidenti,
  (SELECT count(*) FROM "User" WHERE "organizationalUnitId" IN (SELECT id FROM e2e_units)) AS korisnici_samo_odvezani;

-- Kućna jedinica: nalog ostaje, veza na e2e jedinicu ne (FK je RESTRICT).
UPDATE "User"
   SET "organizationalUnitId" = NULL
 WHERE "organizationalUnitId" IN (SELECT id FROM e2e_units);

DELETE FROM "Notification"
 WHERE "ticketId" IN (SELECT id FROM e2e_tickets)
    OR "groupId" IN (SELECT id FROM e2e_groups)
    OR title ILIKE 'e2e%'
    OR body ILIKE 'e2e%'
    OR body ILIKE '%E2E %';

DELETE FROM "InboundEmail"
 WHERE subject ILIKE 'e2e%'
    OR subject ILIKE 'Val 6 inbound E2E%'
    OR "ticketId" IN (SELECT id FROM e2e_tickets)
    OR "createdTicketId" IN (SELECT id FROM e2e_tickets);

DELETE FROM "TeamsCardMessage"
 WHERE "entityId" IN (SELECT id FROM e2e_tickets)
    OR "entityId" IN (SELECT id FROM e2e_problems)
    OR "entityId" IN (SELECT id FROM e2e_changes)
    OR "entityId" IN (SELECT id FROM e2e_incidents)
    OR payload::text ILIKE '%E2E %';

DELETE FROM "TeamsSimulatorMessage"
 WHERE payload::text ILIKE '%E2E %' OR payload::text ILIKE '%e2e-%';

DELETE FROM "IdempotencyRecord" WHERE key ILIKE 'e2e%';

DELETE FROM "ChangeLog"
 WHERE reason ILIKE 'e2e%' OR reason ILIKE '% E2E' OR reason ILIKE '%(E2E)%';

DELETE FROM "DataSubjectRequest" WHERE "subjectLabel" ILIKE 'e2e%';
DELETE FROM "SavedView" WHERE name ILIKE 'e2e%';

DELETE FROM "TicketBulkOperationItem" WHERE "ticketId" IN (SELECT id FROM e2e_tickets);

DELETE FROM "TicketAsset"
 WHERE "assetId" IN (SELECT id FROM e2e_assets)
    OR "ticketId" IN (SELECT id FROM e2e_tickets);

DELETE FROM "AssetTransfer"
 WHERE "fromLabel" ILIKE 'e2e%' OR "toLabel" ILIKE 'e2e%'
    OR id IN (SELECT "transferId" FROM "AssetTransferItem" WHERE "assetId" IN (SELECT id FROM e2e_assets));

DELETE FROM "AssetContract"
 WHERE supplier ILIKE 'e2e%' OR reference ILIKE 'e2e%'
    OR "organizationalUnitId" IN (SELECT id FROM e2e_units)
    OR id IN (SELECT "contractId" FROM "AssetContractItem" WHERE "assetId" IN (SELECT id FROM e2e_assets));

DELETE FROM "SoftwareLicense"
 WHERE "productName" ILIKE 'e2e%' OR vendor ILIKE 'e2e%'
    OR "organizationalUnitId" IN (SELECT id FROM e2e_units);

DELETE FROM "AssetSignatory" WHERE title ILIKE 'e2e%';

DELETE FROM "ReportSchedule"
 WHERE name ILIKE 'e2e%'
    OR "organizationalUnitId" IN (SELECT id FROM e2e_units)
    OR "serviceId" IN (SELECT id FROM e2e_services)
    OR "groupId" IN (SELECT id FROM e2e_groups);

-- toGroup / jedinice su RESTRICT: predaja na e2e grupu ili jedinicu mora prije njih.
DELETE FROM "ProblemHandoff"
 WHERE "problemId" IN (SELECT id FROM e2e_problems)
    OR "toGroupId" IN (SELECT id FROM e2e_groups)
    OR "fromGroupId" IN (SELECT id FROM e2e_groups)
    OR "fromOrganizationalUnitId" IN (SELECT id FROM e2e_units)
    OR "toOrganizationalUnitId" IN (SELECT id FROM e2e_units);

DELETE FROM "Problem" WHERE id IN (SELECT id FROM e2e_problems);
DELETE FROM "ChangeRequest" WHERE id IN (SELECT id FROM e2e_changes);
DELETE FROM "ChangeTemplate" WHERE name ILIKE 'e2e%';

DELETE FROM "ServiceIncident" WHERE id IN (SELECT id FROM e2e_incidents);

DELETE FROM "Announcement"
 WHERE title ILIKE 'e2e%' OR "serviceId" IN (SELECT id FROM e2e_services);

DELETE FROM "KnowledgeInterceptResolution"
 WHERE "serviceId" IN (SELECT id FROM e2e_services)
    OR "organizationalUnitId" IN (SELECT id FROM e2e_units)
    OR "primaryArticleId" IN (SELECT id FROM e2e_articles);

DELETE FROM "KnowledgeArticle" WHERE id IN (SELECT id FROM e2e_articles);

UPDATE "KnowledgeCategory" AS child
   SET "parentId" = NULL
 WHERE child."parentId" IN (
         SELECT id FROM "KnowledgeCategory"
          WHERE key ILIKE 'e2e%' OR "nameBs" ILIKE 'e2e%' OR "nameEn" ILIKE 'e2e%'
       )
   AND NOT (child.key ILIKE 'e2e%' OR child."nameBs" ILIKE 'e2e%' OR child."nameEn" ILIKE 'e2e%');
DELETE FROM "KnowledgeCategory" AS node
 WHERE (node.key ILIKE 'e2e%' OR node."nameBs" ILIKE 'e2e%' OR node."nameEn" ILIKE 'e2e%')
   AND NOT EXISTS (
     SELECT 1 FROM "KnowledgeCategory" AS child
      WHERE child."parentId" = node.id
        AND (child.key ILIKE 'e2e%' OR child."nameBs" ILIKE 'e2e%' OR child."nameEn" ILIKE 'e2e%')
   );
DELETE FROM "KnowledgeCategory"
 WHERE key ILIKE 'e2e%' OR "nameBs" ILIKE 'e2e%' OR "nameEn" ILIKE 'e2e%';

DELETE FROM "TicketPlaybook"
 WHERE "playbookId" IN (SELECT id FROM "Playbook" WHERE name ILIKE 'e2e%')
    OR "ticketId" IN (SELECT id FROM e2e_tickets);
DELETE FROM "Playbook" WHERE name ILIKE 'e2e%';
DELETE FROM "ResponseTemplate" WHERE name ILIKE 'e2e%';

DELETE FROM "RoutingRule"
 WHERE "serviceId" IN (SELECT id FROM e2e_services)
    OR "groupId" IN (SELECT id FROM e2e_groups)
    OR "originUnitId" IN (SELECT id FROM e2e_units);

DELETE FROM "Ticket" WHERE id IN (SELECT id FROM e2e_tickets);

DELETE FROM "FormVersion" WHERE "serviceId" IN (SELECT id FROM e2e_services);
DELETE FROM "CloseCode"
 WHERE key ILIKE 'e2e%' OR name ILIKE 'e2e%'
    OR "serviceId" IN (SELECT id FROM e2e_services);

DELETE FROM "Service" WHERE id IN (SELECT id FROM e2e_services);

-- Okidač asset_hard_delete_guard_and_archive odbija DELETE dok ove veze postoje
-- (broji ih prije kaskade). Skidaju se eksplicitno, pa tek onda sama imovina.
DELETE FROM "AssetRelation"
 WHERE "fromAssetId" IN (SELECT id FROM e2e_assets)
    OR "toAssetId" IN (SELECT id FROM e2e_assets);
DELETE FROM "LicenseAssignment" WHERE "assetId" IN (SELECT id FROM e2e_assets);
DELETE FROM "ProblemAsset" WHERE "assetId" IN (SELECT id FROM e2e_assets);
DELETE FROM "ChangeRequestAsset" WHERE "assetId" IN (SELECT id FROM e2e_assets);
DELETE FROM "AssetTransferItem" WHERE "assetId" IN (SELECT id FROM e2e_assets);
DELETE FROM "AssetContractItem" WHERE "assetId" IN (SELECT id FROM e2e_assets);
DELETE FROM "TicketAsset" WHERE "assetId" IN (SELECT id FROM e2e_assets);

DELETE FROM "Asset" WHERE id IN (SELECT id FROM e2e_assets);
DELETE FROM "AssetImportJob"
 WHERE "fileName" ILIKE 'e2e%' OR "typeId" IN (SELECT id FROM e2e_asset_types);
DELETE FROM "AssetEventArchive" WHERE "assetTagSnapshot" ILIKE 'e2e%';
DELETE FROM "AssetType" t
 WHERE t.id IN (SELECT id FROM e2e_asset_types)
   AND NOT EXISTS (SELECT 1 FROM "Asset" a WHERE a."typeId" = t.id);

UPDATE "AssetLocation" AS child
   SET "parentId" = parent."parentId"
  FROM "AssetLocation" AS parent
 WHERE child."parentId" = parent.id
   AND (parent.name ILIKE 'e2e%' OR parent.code ILIKE 'e2e%')
   AND NOT (child.name ILIKE 'e2e%' OR child.code ILIKE 'e2e%');
DELETE FROM "AssetLocation" AS node
 WHERE (node.name ILIKE 'e2e%' OR node.code ILIKE 'e2e%')
   AND NOT EXISTS (
     SELECT 1 FROM "AssetLocation" AS child
      WHERE child."parentId" = node.id
        AND (child.name ILIKE 'e2e%' OR child.code ILIKE 'e2e%')
   );
DELETE FROM "AssetLocation" WHERE name ILIKE 'e2e%' OR code ILIKE 'e2e%';

DELETE FROM "Group" WHERE id IN (SELECT id FROM e2e_groups);

-- Dijete koje nije e2e (ne bi smjelo postojati) prebaci na djeda prije brisanja.
UPDATE "OrganizationalUnit" AS child
   SET "parentId" = parent."parentId"
  FROM "OrganizationalUnit" AS parent
 WHERE child."parentId" = parent.id
   AND parent.id IN (SELECT id FROM e2e_units)
   AND child.id NOT IN (SELECT id FROM e2e_units);

DELETE FROM "OrganizationalUnit" u
 WHERE u.id IN (SELECT id FROM e2e_units)
   AND NOT EXISTS (
     SELECT 1 FROM "OrganizationalUnit" c
      WHERE c."parentId" = u.id AND c.id IN (SELECT id FROM e2e_units)
   );
DELETE FROM "OrganizationalUnit" WHERE id IN (SELECT id FROM e2e_units);

UPDATE "Service" SET "slaProfileId" = NULL
 WHERE "slaProfileId" IN (SELECT id FROM "SlaProfile" WHERE key ILIKE 'e2e%' OR name ILIKE 'e2e%');
UPDATE "PolicyPack" SET "slaProfileId" = NULL
 WHERE "slaProfileId" IN (SELECT id FROM "SlaProfile" WHERE key ILIKE 'e2e%' OR name ILIKE 'e2e%');
DELETE FROM "SlaProfile" WHERE key ILIKE 'e2e%' OR name ILIKE 'e2e%';
DELETE FROM "BusinessHoursCalendar" c
 WHERE (c.key ILIKE 'e2e%' OR c.name ILIKE 'e2e%')
   AND NOT EXISTS (SELECT 1 FROM "SlaProfile" p WHERE p."calendarId" = c.id);

SELECT
  (SELECT count(*) FROM "Ticket" WHERE title ILIKE 'e2e%' OR title ILIKE 'Val 6 inbound E2E%') AS preostali_tiketi,
  (SELECT count(*) FROM "Service" WHERE slug ILIKE 'e2e%' OR name ILIKE 'e2e%') AS preostali_servisi,
  (SELECT count(*) FROM "Group" WHERE name ILIKE 'e2e%' OR key ILIKE 'e2e%') AS preostale_grupe,
  (SELECT count(*) FROM "OrganizationalUnit" WHERE name ILIKE 'e2e%') AS preostale_jedinice,
  (SELECT count(*) FROM "Asset" WHERE name ILIKE 'e2e%' OR "assetTag" ILIKE 'e2e%') AS preostala_imovina,
  (SELECT count(*) FROM "Problem" WHERE title ILIKE 'e2e%') AS preostali_problemi,
  (SELECT count(*) FROM "ChangeRequest" WHERE title ILIKE 'e2e%') AS preostale_promjene,
  (SELECT count(*) FROM "Announcement" WHERE title ILIKE 'e2e%') AS preostale_najave,
  (SELECT count(*) FROM "User") AS korisnici_netaknuti;

\if :apply
  COMMIT;
  \echo 'PRIMIJENJENO (COMMIT). Korisnici, role i sigurnosne postavke nisu brisani.'
\else
  ROLLBACK;
  \echo 'PROBA — ništa nije obrisano (ROLLBACK). Za stvarno brisanje: -v apply=1'
\endif
