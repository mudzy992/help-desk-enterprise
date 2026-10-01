-- Paket 3.3 (decision 2026-10-01): problems are owned by problem groups.
-- A problem group holds problem managers; the agent who reports a problem
-- picks the group, any problem manager of that group runs and resolves it.
-- The module is active only when at least one problem group exists.

ALTER TABLE "Group" ADD COLUMN "isProblemGroup" BOOLEAN NOT NULL DEFAULT false;

-- problem.report: report a problem and link/unlink tickets (agents and up).
INSERT INTO "Permission" ("id", "key", "description")
VALUES (gen_random_uuid()::text, 'problem.report', 'problem.report')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
INNER JOIN "Permission" p ON p."key" = 'problem.report'
WHERE r."key" IN ('AGENT', 'PROBLEM_MANAGER', 'ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" e WHERE e."roleId" = r."id" AND e."permissionId" = p."id"
  );

-- Agents no longer edit the analysis (problem.manage = problem managers, admins).
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  AND r."key" = 'AGENT' AND p."key" = 'problem.manage';
