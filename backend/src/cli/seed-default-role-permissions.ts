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
import {
  computeSeedPlanFingerprint,
  seedDefaultRolePermissions,
  type SeedDefaultRolePermissionsResult,
} from '../modules/rbac/seed-default-role-permissions';
import {
  evaluateSeedApplyRequest,
  parseSeedCommandRequest,
} from '../modules/rbac/seeder-apply-intent';

/*
  Val 0 (finding M4/B1): existing installations were created before the system
  roles received their default permissions, so ADMIN/AGENT can be empty there.
  This one-off command fills the default role -> permission mapping for the seven
  system roles.

  W2.35 (`BA-rbac-08`): the command is additive, so re-running it restores links an
  administrator deleted on purpose. That is a policy decision, not routine
  maintenance, and it now needs the operator to say so:

    node dist/src/cli/seed-default-role-permissions.js --dry-run
      -> prints the plan and its fingerprint; writes nothing
    node dist/src/cli/seed-default-role-permissions.js --confirm=<fingerprint>
      -> applies exactly the reviewed plan; refuses if the matrix changed since
    node dist/src/cli/seed-default-role-permissions.js --restore-defaults
      -> applies the defaults deliberately, including links removed on purpose

  Without one of those, the command refuses (exit code 2) and writes nothing.
*/

const refusedExitCode = 2;

function printPlan(result: SeedDefaultRolePermissionsResult): void {
  for (const role of result.roles) {
    const created = role.roleCreated ? ' (role created)' : '';
    console.log(
      `${role.roleKey}${created}: existing ${role.existing}, ` +
        `would add ${role.added}` +
        (role.addedPermissionKeys.length === 0
          ? ''
          : ` [${[...role.addedPermissionKeys].sort().join(', ')}]`),
    );
  }
}

async function main(): Promise<number> {
  const request = parseSeedCommandRequest(process.argv);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    return refusedExitCode;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const prismaService = prisma as unknown as PrismaService;
  try {
    // The plan is always read first: it is both the dry-run output and the thing
    // the confirmation is compared against.
    const plan = await seedDefaultRolePermissions(prismaService, {
      dryRun: true,
    });
    const reviewedFingerprint = computeSeedPlanFingerprint(plan.roles);

    if (request.kind === 'dry-run') {
      printPlan(plan);
      console.log(`plan fingerprint: ${reviewedFingerprint}`);
      console.log(
        plan.addedTotal === 0
          ? 'dry run - nothing written; every default link already exists'
          : 'dry run - nothing written; re-run with --confirm=' +
            reviewedFingerprint +
            ' to apply exactly this plan, or --restore-defaults to apply the ' +
            'defaults even where an administrator removed them on purpose',
      );
      return 0;
    }

    const decision = evaluateSeedApplyRequest(request, reviewedFingerprint);
    if (!decision.allowed) {
      printPlan(plan);
      console.log(`plan fingerprint: ${reviewedFingerprint}`);
      console.error(`role_permission_seed_refused: ${decision.message}`);
      return refusedExitCode;
    }

    let redis: ReturnType<typeof createRedisClient> | null = null;
    let invalidatePrincipals:
      | ((userIds: readonly string[]) => Promise<unknown>)
      | undefined;
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

    const applied = await seedDefaultRolePermissions(prismaService, {
      ...(invalidatePrincipals === undefined ? {} : { invalidatePrincipals }),
    });
    printPlan(applied);
    const appliedFingerprint = computeSeedPlanFingerprint(applied.roles);
    if (appliedFingerprint !== reviewedFingerprint) {
      // The matrix moved between the review and the write. The write is already
      // committed, so this is recorded rather than undone — the audit entry
      // carries both values, which is what a later review needs.
      console.warn(
        `role_permission_seed_plan_drift reviewed=${reviewedFingerprint} applied=${appliedFingerprint}`,
      );
    }
    for (const role of applied.roles) {
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
          addedPermissionKeys: [...role.addedPermissionKeys].sort(),
          via: 'seed-default-role-permissions',
          // W2.35 (`BA-rbac-08`): the audit says *how* the operator agreed and
          // which plan they agreed to, not only that links were added.
          intent: decision.consent,
          planFingerprint: reviewedFingerprint,
        },
      });
    }
    redis?.disconnect();
    console.log(
      `roles updated: ${applied.addedTotal > 0 ? '' : 'none, '}${applied.addedTotal} permission link(s) added ` +
        `(intent: ${decision.consent}, plan: ${reviewedFingerprint})`,
    );
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
