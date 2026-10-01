-- Paket 3.3 (decision 2026-10-01): PROBLEM_MANAGER resolves, closes and
-- cancels problems and group-resolves linked tickets across units.
-- Agents keep problem.read + problem.manage (report, link, analyse).

INSERT INTO "Role" ("id", "key", "name", "isSystem", "updatedAt")
VALUES (gen_random_uuid()::text, 'PROBLEM_MANAGER', 'ProblemManager', true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p ON p."key" IN ('problem.read', 'problem.manage', 'problem.close')
WHERE r."key" = 'PROBLEM_MANAGER'
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
  );

DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  AND r."key" = 'AGENT' AND p."key" = 'problem.close';
