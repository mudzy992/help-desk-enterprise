-- Seed group.manage permission for roles that already have routing.write.
INSERT INTO "Permission" ("id", "key", "description")
VALUES (gen_random_uuid()::text, 'group.manage', 'group.manage')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, rp."roleId", gm."id"
FROM "RolePermission" rp
INNER JOIN "Permission" rw ON rw."id" = rp."permissionId" AND rw."key" = 'routing.write'
INNER JOIN "Permission" gm ON gm."key" = 'group.manage'
WHERE NOT EXISTS (
  SELECT 1
  FROM "RolePermission" existing
  WHERE existing."roleId" = rp."roleId"
    AND existing."permissionId" = gm."id"
);
