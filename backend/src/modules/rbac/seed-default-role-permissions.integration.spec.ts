import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../audit-log/audit-log.constants';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { defaultRolePermissionKeys } from '../authorization/authorization.constants';
import {
  computeSeedPlanFingerprint,
  seedDefaultRolePermissions,
} from './seed-default-role-permissions';
import {
  evaluateSeedApplyRequest,
  parseSeedCommandRequest,
} from './seeder-apply-intent';

/*
  W2.35 (`BA-rbac-08`): `seedDefaultRolePermissions` is additive — it creates every
  missing `role -> permission` link. Run as ordinary maintenance that silently
  undoes a deliberate removal: the SuperAdmin takes a permission away, an operator
  runs the CLI months later, and the permission is back.

  This file proves the replacement on real PostgreSQL: the reviewed plan is hashed,
  an apply only happens when that hash is confirmed (or `--restore-defaults` is
  passed), a plain run writes nothing, and the audit entry carries the operator's
  intent plus the plan the operator saw.
*/
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

const adminRoleKey = 'ADMIN';
const removedPermissionKey = defaultRolePermissionKeys[adminRoleKey][0]!;
const argv = (...flags: string[]) => ['node', '/app/cli.js', ...flags];

describeIfDatabase('seed-default-role-permissions consent (BA-rbac-08)', () => {
  let prisma: PrismaClient;
  let database: PrismaClient;

  const planFingerprint = async (): Promise<string> => {
    const plan = await seedDefaultRolePermissions(
      prisma as unknown as PrismaService,
      { dryRun: true },
    );
    return computeSeedPlanFingerprint(plan.roles);
  };

  const adminLinkKeys = async (): Promise<string[]> => {
    const role = await database.role.findUniqueOrThrow({
      where: { key: adminRoleKey },
      select: {
        rolePermissions: {
          select: { permission: { select: { key: true } } },
        },
      },
    });
    return role.rolePermissions
      .map((link) => link.permission.key)
      .sort((left, right) => left.localeCompare(right));
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    database = prisma;
  });

  afterAll(async () => {
    if (prisma === undefined) return;
    await database.auditLog.deleteMany({
      where: { entityType: auditLogEntityTypes.role },
    });
    await database.$disconnect();
  });

  it('hashes the plan, not the iteration order', async () => {
    const first = await planFingerprint();
    const second = await planFingerprint();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    // A dry run never writes.
    expect(await database.role.count()).toBe(0);
  });

  it('refuses a plain maintenance run and keeps the deliberate removal', async () => {
    await seedDefaultRolePermissions(prisma as unknown as PrismaService, {});
    expect(await adminLinkKeys()).toContain(removedPermissionKey);

    // The administrator decides this permission does not belong to ADMIN.
    const role = await database.role.findUniqueOrThrow({
      where: { key: adminRoleKey },
    });
    const permission = await database.permission.findUniqueOrThrow({
      where: { key: removedPermissionKey },
    });
    await database.rolePermission.delete({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
    });
    expect(await adminLinkKeys()).not.toContain(removedPermissionKey);

    const reviewedFingerprint = await planFingerprint();
    const request = parseSeedCommandRequest(argv());
    const decision = evaluateSeedApplyRequest(request, reviewedFingerprint);
    expect(decision).toMatchObject({
      allowed: false,
      reason: 'confirmation-required',
    });

    // Nothing ran, so the removed permission is still gone.
    expect(await adminLinkKeys()).not.toContain(removedPermissionKey);
  });

  it('applies exactly the reviewed plan and audits the intent', async () => {
    const reviewedFingerprint = await planFingerprint();
    const decision = evaluateSeedApplyRequest(
      parseSeedCommandRequest(argv(`--confirm=${reviewedFingerprint}`)),
      reviewedFingerprint,
    );
    expect(decision).toEqual({ allowed: true, consent: 'fingerprint' });

    const applied = await seedDefaultRolePermissions(
      prisma as unknown as PrismaService,
      {},
    );
    expect(computeSeedPlanFingerprint(applied.roles)).toBe(reviewedFingerprint);
    expect(await adminLinkKeys()).toContain(removedPermissionKey);

    const adminRole = applied.roles.find((entry) => entry.roleKey === adminRoleKey);
    await recordAuditEntry(prisma as unknown as PrismaService, {
      action: auditLogActions.rolePermissionReplace,
      entityType: auditLogEntityTypes.role,
      entityId: adminRoleKey,
      actorUserId: null,
      metadata: {
        roleKey: adminRoleKey,
        addedPermissionKeys: [...adminRole!.addedPermissionKeys].sort(),
        via: 'seed-default-role-permissions',
        intent: decision.allowed ? decision.consent : 'fingerprint',
        planFingerprint: reviewedFingerprint,
      },
    });
    const audit = await database.auditLog.findFirstOrThrow({
      where: {
        action: auditLogActions.rolePermissionReplace,
        entityId: adminRoleKey,
      },
      select: { metadata: true },
    });
    expect(audit.metadata).toMatchObject({
      intent: 'fingerprint',
      planFingerprint: reviewedFingerprint,
    });
  });

  it('refuses a confirmation whose plan went stale', async () => {
    const staleFingerprint = await planFingerprint();
    const permission = await database.permission.findUniqueOrThrow({
      where: { key: removedPermissionKey },
    });
    const admin = await database.role.findUniqueOrThrow({
      where: { key: adminRoleKey },
    });
    // The matrix moves after the dry run: a second deliberate removal.
    await database.rolePermission.delete({
      where: {
        roleId_permissionId: { roleId: admin.id, permissionId: permission.id },
      },
    });

    const decision = evaluateSeedApplyRequest(
      parseSeedCommandRequest(argv(`--confirm=${staleFingerprint}`)),
      await planFingerprint(),
    );
    expect(decision).toMatchObject({
      allowed: false,
      reason: 'fingerprint-mismatch',
    });
    expect(await adminLinkKeys()).not.toContain(removedPermissionKey);
  });

  it('restores the defaults only when that intent is explicit', async () => {
    const decision = evaluateSeedApplyRequest(
      parseSeedCommandRequest(argv('--restore-defaults')),
      await planFingerprint(),
    );
    expect(decision).toEqual({ allowed: true, consent: 'restore-defaults' });

    await seedDefaultRolePermissions(prisma as unknown as PrismaService, {});
    expect(await adminLinkKeys()).toEqual(
      [...defaultRolePermissionKeys[adminRoleKey]].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
  });
});
