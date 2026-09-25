-- Briše SVE tikete osim navedenih (staging, 2026-09-25) i sve što je vezano za njih.
--
-- Proba (default): prebroji i uradi ROLLBACK — ništa se ne mijenja.
--   docker exec -i <pg> psql -U admin -d ephelpdesk-dev \
--     -v keep="'id1','id2'" -f - < ops/sql/delete-tickets-except.sql
-- Stvarno brisanje: dodaj -v apply=1
--
-- Šta se briše:
--   * tiketi koji nisu u listi `keep`;
--   * kaskadno (onDelete: Cascade): poruke, aktivnosti, učesnici, prilozi (redovi),
--     SLA stanja, CSAT, povjerljive dozvole, break-glass, vrijeme rada … — sve
--     tabele s FK na "Ticket";
--   * notifikacije tih tiketa (FK je SetNull, pa se brišu izričito) i njihove
--     potvrde čitanja (NotificationReceipt, kaskadno).
-- Šta ostaje:
--   * sačuvani tiketi — njihove veze na obrisane (split/merge/reopen) postaju NULL;
--   * audit log (namjerno), korisnici, servisi, forme, konfiguracija;
--   * GuardrailClaim redovi dobiju ticketId = NULL (SetNull);
--   * FAJLOVI priloga u storage-u (briše se samo red u bazi) — vidi ispis na kraju.
--
-- Brojevi novih tiketa: od commita "tickets: next number = max + 1" broj se ne
-- računa iz count(*), pa brisanje ne uzrokuje ponavljanje ni koliziju brojeva.
-- API mora imati taj commit PRIJE nego što se ovo pokrene s apply=1.

\set ON_ERROR_STOP on
\if :{?keep}
\else
  \echo 'Nedostaje -v keep="''id1'',''id2''"'
  \quit
\endif
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

CREATE TEMP TABLE keep_ids ON COMMIT DROP AS
SELECT unnest(ARRAY[:keep]::text[]) AS id;

-- Sigurnosna provjera: svi navedeni ID-evi moraju postojati.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(k.id, ', ') INTO missing
  FROM keep_ids k LEFT JOIN "Ticket" t ON t.id = k.id
  WHERE t.id IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tiketi za čuvanje ne postoje: % — ništa nije obrisano.', missing;
  END IF;
END $$;

\echo '── čuva se ──'
SELECT t.id, t."ticketNumber", t.status, left(t.title, 50) AS title
FROM "Ticket" t JOIN keep_ids k ON k.id = t.id;

\echo '── briše se: tiketi po statusu ──'
SELECT status, count(*) FROM "Ticket"
WHERE id NOT IN (SELECT id FROM keep_ids)
GROUP BY status ORDER BY 2 DESC;

\echo '── prilozi čiji FAJLOVI ostaju u storage-u (sačuvaj listu ako ih želiš obrisati) ──'
SELECT count(*) AS attachments FROM "TicketAttachment"
WHERE "ticketId" NOT IN (SELECT id FROM keep_ids);
SELECT "storagePath" FROM "TicketAttachment"
WHERE "ticketId" NOT IN (SELECT id FROM keep_ids)
ORDER BY 1 LIMIT 20;

\echo '── briše se: notifikacije (izričito) ──'
SELECT count(*) AS notifications FROM "Notification"
WHERE "ticketId" IS NOT NULL AND "ticketId" NOT IN (SELECT id FROM keep_ids);

DELETE FROM "Notification"
WHERE "ticketId" IS NOT NULL AND "ticketId" NOT IN (SELECT id FROM keep_ids);

DELETE FROM "Ticket" WHERE id NOT IN (SELECT id FROM keep_ids);

\echo '── nakon brisanja (unutar transakcije) ──'
SELECT count(*) AS tickets_left FROM "Ticket";

\if :apply
  COMMIT;
  \echo 'COMMIT — obrisano.'
  ANALYZE "Ticket";
\else
  ROLLBACK;
  \echo 'ROLLBACK — ovo je bila proba. Za brisanje dodaj -v apply=1'
\endif
