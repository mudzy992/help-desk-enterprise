-- Paket 2.9 (K4): provenance of config versions created from an imported
-- config package, and the SUPER_ADMIN-only import permission. Additive.
ALTER TABLE "ConfigVersion" ADD COLUMN "importMeta" JSONB;

-- SUPER_ADMIN holds every permission implicitly; the row exists so the
-- permission can be granted explicitly from the Permissions screen.
INSERT INTO "Permission" ("id", "key", "description")
VALUES (gen_random_uuid()::text, 'config.version.import', 'config.version.import')
ON CONFLICT ("key") DO NOTHING;
