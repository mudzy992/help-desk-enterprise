import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../common/principal-context/principal-context-invalidator.service';
import { createRedisClient } from '../common/redis/create-redis-client';
import { loadRedisConfiguration } from '../common/redis/load-redis-configuration';
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
  let redis: ReturnType<typeof createRedisClient> | null = null;
  const prismaService = prisma as unknown as PrismaService;
  let invalidatePrincipals:
    | ((userIds: readonly string[]) => Promise<unknown>)
    | undefined;
  if (!dryRun) {
    try {
      redis = createRedisClient(loadRedisConfiguration(process.env));
      redis.on('error', (error: Error) => {
        console.warn(`role_permission_seed_redis_error type=${error.name}`);
      });
      const invalidator = new PrincipalContextInvalidator(prismaService, redis);
      invalidatePrincipals = async (userIds) => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        try {
          await Promise.race([
            invalidator.invalidateUsers(userIds),
            new Promise<void>((resolve) => {
              timeout = setTimeout(() => {
                timedOut = true;
                resolve();
              }, 5_000);
            }),
          ]);
          if (timedOut) {
            console.warn(
              `role_permission_seed_invalidation_timeout users=${userIds.length}; authzVersion bump was submitted and session revalidation remains active`,
            );
          }
        } finally {
          if (timeout !== undefined) clearTimeout(timeout);
        }
      };
    } catch (error) {
      console.warn(
        `role_permission_seed_redis_unavailable reason=${String(error)}; using durable authzVersion bumps without shared cache publication`,
      );
      invalidatePrincipals = async (userIds) => {
        await prismaService.user.updateMany({
          where: { id: { in: [...userIds] } },
          data: { authzVersion: { increment: 1 } },
        });
      };
    }
  }
  let addedTotal = 0;
  try {
    const result = await seedDefaultRolePermissions(prismaService, {
      dryRun,
      ...(invalidatePrincipals === undefined ? {} : { invalidatePrincipals }),
    });
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
    redis?.disconnect();
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
