-- Internal e-mail domains become a setting (`private.notifications.email.internalDomainsCsv`);
-- the hardcoded `epbih.ba` is gone. Behaviour of an existing installation is kept exactly:
--
-- 1. Existing installation (at least one user): internal domain = `epbih.ba`, which was the
--    hardcoded value. A fresh database gets no row, so the default '' applies and the install
--    wizard fills in the super admin's domain.
-- 2. `internalOnly` changes meaning. Before, `false` meant "epbih.ba + allow-lists" and `true`
--    meant "epbih.ba only (allow-lists ignored)". Now `true` means "internal domains + allow-lists"
--    and `false` means "any address". The old `false` is therefore the new `true`. The old `true`
--    stays `true`: with the allow-lists empty this is identical, and non-empty lists were ignored
--    before, so they are cleared to keep the effective set unchanged.
INSERT INTO "AppSetting" ("id", "key", "value", "scope", "isSecret", "description", "createdAt", "updatedAt")
SELECT 'mig_email_internal_domains', 'private.notifications.email.internalDomainsCsv', to_jsonb('epbih.ba'::text), 'PRIVATE'::"SettingScope", false,
       'Comma-separated internal e-mail domains of the organisation (e.g. epbih.ba); always allowed, also as inbound senders',
       now(), now()
WHERE EXISTS (SELECT 1 FROM "User")
ON CONFLICT ("key") DO NOTHING;

-- Steps 2 and 3 run as one statement, so both read the ORIGINAL `internalOnly` (a missing row
-- means the old default `true`). Old `true`: lists were ignored, so clear them. Old `false`: keep
-- the lists and flip to the new `true`.
WITH old AS (
  SELECT COALESCE((SELECT "value" FROM "AppSetting" WHERE "key" = 'private.notifications.email.internalOnly'), 'true'::jsonb) = 'true'::jsonb AS strict
),
cleared AS (
  UPDATE "AppSetting" SET "value" = to_jsonb(''::text), "updatedAt" = now()
  WHERE "key" IN ('private.notifications.email.allowedExternalDomainsCsv', 'private.notifications.email.allowedExternalEmailsCsv')
    AND "value" <> to_jsonb(''::text)
    AND (SELECT strict FROM old)
  RETURNING 1
)
UPDATE "AppSetting" SET "value" = 'true'::jsonb, "updatedAt" = now()
WHERE "key" = 'private.notifications.email.internalOnly' AND "value" = 'false'::jsonb;
