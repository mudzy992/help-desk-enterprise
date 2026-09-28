-- Paket 2.6 + 2.7: existing installations never received the new permission
-- rows nor the default ADMIN grants (the 2.6 and 2.7 migrations only created
-- tables). Additive and idempotent; SUPER_ADMIN holds every permission
-- implicitly. Grants mirror `defaultRolePermissionKeys` for ADMIN:
-- privacy.view, ops.health.view, ops.alerts.receive, status.incidents.manage.
-- privacy.manage, privacy.anonymize and ops.alerts.manage stay unassigned
-- (SUPER_ADMIN only, or granted explicitly in Permissions).
INSERT INTO "Permission" ("id", "key", "description")
SELECT gen_random_uuid()::text, k.key, k.key
FROM (VALUES
  ('privacy.view'),
  ('privacy.manage'),
  ('privacy.anonymize'),
  ('ops.health.view'),
  ('ops.alerts.manage'),
  ('ops.alerts.receive'),
  ('status.incidents.manage')
) AS k(key)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p
  ON p."key" IN ('privacy.view', 'ops.health.view', 'ops.alerts.receive', 'status.incidents.manage')
WHERE r."key" = 'ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
  );

-- Cached principals pick up the new grants on their next request.
UPDATE "User" SET "authzVersion" = "authzVersion" + 1
WHERE "id" IN (
  SELECT ur."userId" FROM "UserRole" ur INNER JOIN "Role" r ON r."id" = ur."roleId" WHERE r."key" = 'ADMIN'
);
