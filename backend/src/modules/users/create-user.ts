import type { PrismaService } from '../../common/prisma/prisma.service';
import type { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import type { MailTransport } from '../notifications/email/mail-transport';
import type { SettingsService } from '../settings/settings.service';
import type { HibpPasswordChecker } from '../authentication/security/hibp-password-checker';
import { authorizationRoleNames } from '../authorization/authorization.constants';
import { recordUserChange } from './record-user-change';
import { ensureSystemRole } from './ensure-system-role';
import { assertCanAssignRole } from './assert-can-assign-role';
import { createUserRoleWithinTransaction } from './user-role-assignment.transaction';
import { prepareTemporaryPassword } from './issue-temporary-password-for-user';
import { resolveTemporaryPasswordChannel } from './send-temporary-password-email';
import { enqueueTemporaryPasswordDelivery } from './temporary-password-delivery.outbox';
import { listUsersSummary } from './list-users-summary';
import { readDisabledPolicyPackKeys } from '../policy-packs/read-disabled-policy-pack-keys';
import type { CreateUserInput, CreateUserResponse } from './users.types';
import { UsersError } from './users.error';

export type CreateUserDependencies = {
  readonly settingsService: SettingsService;
  readonly mailTransport: MailTransport;
  /** Paket 5.4.0-d (M5): rejects a compromised temporary password. */
  readonly hibpChecker?: HibpPasswordChecker;
  /**
   * W2.26 (`BA-users-02`): present in the module wiring. Without it the e-mail
   * channel degrades to handing the secret back to the caller — never to a silent
   * account with no usable password.
   */
  readonly outbox?: Pick<TransactionalOutboxService, 'enqueue'>;
};

/**
 * W2.26 (`BA-users-02`): creating an account is **one** intent and **one** commit.
 *
 * What the finding was: `createUser` committed the user and its audit, then
 * committed the password and mailed it, and only then asked whether the actor was
 * allowed to grant that role — so a forbidden `SUPER_ADMIN` grant (or any failure in
 * a later step) left an active account behind and could have mailed a secret for an
 * operation the API reported as failed.
 *
 * The order below is the correction, and it is the whole point of the package:
 *
 *   1. **authorize and validate the complete intent** — role key, actor's right to
 *      grant it, unit, unique e-mail, delivery channel, and a HIBP-checked password
 *      — before the first write. Anything that can refuse the request now refuses it
 *      with no side effect at all.
 *   2. **one transaction**: user + credential hash + role grant + delivery intent +
 *      both audit entries. If any leg fails, nothing exists.
 *   3. **delivery only after the commit**, and only for a committed account: the
 *      `ui` channel returns the secret in-band, the `email` channel is a durable
 *      outbox intent carrying no secret (the worker issues and mails the password).
 */
export async function createUser(
  prisma: PrismaService,
  input: CreateUserInput,
  dependencies: CreateUserDependencies,
): Promise<CreateUserResponse> {
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const organizationalUnitId = input.organizationalUnitId?.trim() || null;
  const roleKey = input.roleKey.trim();
  if (displayName.length === 0 || email.length === 0) {
    throw new UsersError('INVALID_INPUT');
  }

  /* ---- 1. the whole intent, before any side effect ------------------------- */

  if (authorizationRoleNames[roleKey] === undefined) {
    throw new UsersError('ROLE_NOT_FOUND');
  }
  // The forbidden grant is refused here, not after the account already exists.
  assertCanAssignRole({
    roleKey,
    actorIsSuperAdmin: input.actorIsSuperAdmin,
  });
  if (organizationalUnitId !== null) {
    const unit = await prisma.organizationalUnit.findUnique({
      where: { id: organizationalUnitId },
      select: { id: true },
    });
    if (unit === null) {
      throw new UsersError('ORGANIZATIONAL_UNIT_NOT_FOUND');
    }
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing !== null) {
    throw new UsersError('EMAIL_CONFLICT');
  }

  const requestedChannel = await resolveTemporaryPasswordChannel({
    settingsService: dependencies.settingsService,
    email,
  });
  /*
    Degraded mode, never a silent one: without an outbox the e-mail channel cannot
    be honoured durably, so the secret is handed back to the caller instead of being
    lost. The module always wires the outbox; this keeps scripts and unit
    constructions honest.
  */
  const channel =
    requestedChannel === 'email' && dependencies.outbox === undefined ? 'ui' : requestedChannel;

  /*
    Generation and hashing are pure work (one optional HIBP call, one bcrypt), and a
    rejected candidate must not leave a half-created account: this happens before the
    transaction opens. Only the hash is written.
  */
  const prepared: PreparedCredential =
    channel === 'ui'
      ? await prepareTemporaryPassword(dependencies.hibpChecker)
      : { temporaryPassword: null, localPasswordHash: null };

  /* ---- 2. one commit ------------------------------------------------------- */

  const created = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        displayName,
        email,
        organizationalUnitId,
        isLocalOnly: true,
        isActive: true,
        mustChangePassword: true,
        ...(prepared.localPasswordHash === null
          ? {}
          : { localPasswordHash: prepared.localPasswordHash }),
      },
    });
    // A system role is seeded, but resolving it here keeps the grant in the same
    // commit as the account it belongs to.
    const roleId = await ensureSystemRole(transaction as unknown as PrismaService, roleKey);
    await createUserRoleWithinTransaction(transaction, {
      userId: user.id,
      role: { id: roleId, key: roleKey },
      organizationalUnitId,
      serviceId: null,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });
    if (channel === 'email') {
      await enqueueTemporaryPasswordDelivery(dependencies.outbox, transaction, {
        userId: user.id,
        email,
        displayName,
      });
    }
    // Audit last: a failed audit insert rolls the whole account back.
    await recordUserChange(transaction as unknown as AuditLogWriteClient, {
      action: auditLogActions.userCreated,
      entityId: user.id,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      organizationalUnitId,
      metadata: {
        after: {
          displayName: user.displayName,
          organizationalUnitId: user.organizationalUnitId,
          isLocalOnly: user.isLocalOnly,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
          roleKey,
        },
        roleKey,
        // W2.26: how the secret left the system is part of the account's history.
        temporaryPasswordDelivery: channel,
      },
    });
    return user;
  });

  /* ---- 3. delivery of a committed account ---------------------------------- */

  // `ui`: the caller gets the secret in the response below. `email`: the committed
  // outbox intent is the delivery; nothing is mailed from the request path.
  const summaries = await listUsersSummary(prisma, {
    ids: [created.id],
    disabledPolicyPackKeys: await readDisabledPolicyPackKeys(dependencies.settingsService),
  });
  const summary = summaries.find((user) => user.id === created.id);
  if (summary === undefined) {
    throw new UsersError('USER_NOT_FOUND');
  }
  return {
    user: summary,
    temporaryPassword: prepared.temporaryPassword,
    temporaryPasswordDelivery: channel,
  };
}

/** What the create commit writes: a hash for `ui`, nothing for `email`. */
type PreparedCredential = {
  readonly temporaryPassword: string | null;
  readonly localPasswordHash: string | null;
};
