import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../modules/audit-log/audit-log.constants';
import { recordAuditEntry } from '../modules/audit-log/record-audit-entry';
import { seedDefaultRolePermissions } from '../modules/rbac/seed-default-role-permissions';

/*
  Val 0 (finding M4/B1): existing installations were created before the system
  roles received their default permissions, so ADMIN/AGENT can be empty there.
  This one-off command fills the default role -> permission mapping for the seven
  system roles.

  Additive and idempotent: it creates missing roles, permission rows and links and
  never deletes. A permission an administrator removed on purpose therefore comes
  back if the command is run again - run `--dry-run` first and read the list.

    node dist/src/cli/seed-default-role-permissions.js --dry-run
    node dist/src/cli/seed-default-role-permissions.js
*/

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return 2;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  let addedTotal = 0;
  try {
    const result = await seedDefaultRolePermissions(
      prisma as unknown as PrismaService,
      { dryRun },
    );
    addedTotal = result.addedTotal;
    for (const role of result.roles) {
      const created = role.roleCreated ? ' (role created)' : '';
      console.log(
        `${role.roleKey}${created}: existing ${role.existing}, ` +
          `${dryRun ? 'would add' : 'added'} ${role.added}`,
      );
    }
    if (!dryRun) {
      for (const role of result.roles) {
        if (role.added === 0) {
          continue;
        }
        await recordAuditEntry(prisma as unknown as PrismaService, {
          action: auditLogActions.rolePermissionReplace,
          entityType: auditLogEntityTypes.role,
          entityId: role.roleKey,
          actorUserId: null,
          metadata: {
            roleKey: role.roleKey,
            addedPermissionKeys: [...role.addedPermissionKeys],
            via: 'seed-default-role-permissions',
          },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(
    `${dryRun ? 'dry run - nothing written; ' : ''}roles updated: ` +
      `${addedTotal > 0 ? '' : 'none, '}${addedTotal} permission link(s) ` +
      `${dryRun ? 'would be added' : 'added'}`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
