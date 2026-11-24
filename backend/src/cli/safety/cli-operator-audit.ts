import { auditLogActions, auditLogEntityTypes } from '../../modules/audit-log/audit-log.constants';
import { appendAuditLog } from '../../modules/audit-log/append-audit-log';
import { recordAuditEntry } from '../../modules/audit-log/record-audit-entry';
import { authorizationRoleKeys } from '../../modules/authorization/authorization.constants';
import type { RecordAuditEntryInput } from '../../modules/audit-log/audit-log.types';
import type { CliTarget } from './cli-target';

/*
  W1.5 (`BA-xcut-08`): a CLI write is only as trustworthy as the two things it
  leaves behind — *who* ran it and *what* the run committed.

  Who: an operator is a real, active account with an administrative role, not a
  free-text string. The audit row therefore carries `actorUserId` like every
  other action, and "someone typed --operator" is not evidence on its own: the
  email has to resolve, or nothing runs.

  What: `started` is written before the first write (fail-closed — if the row
  cannot be written, the command refuses to touch the database), `completed`
  carries the counts the run actually committed. For a destructive run the
  `completed` row is written inside the same transaction as the deletes, so a
  rollback leaves only the honest "attempted" record.
*/

export type CliCommandOutcome = 'started' | 'completed';

export type CliCommandAuditInput = Readonly<{
  readonly command: string;
  readonly target: Pick<CliTarget, 'environment' | 'fingerprint'>;
  readonly outcome: CliCommandOutcome;
  readonly reason: string;
  readonly operatorUserId: string;
  readonly confirmation: string;
  readonly counts?: Readonly<Record<string, number>>;
}>;

type OperatorRow = Readonly<{
  id: string;
  userRoles: readonly Readonly<{ role: Readonly<{ key: string }> }>[];
}>;

/**
 * Structural view of `prisma.user`, so the guard can be unit-tested with a
 * three-line fake. The real client is passed through one cast at the call site,
 * the same way the other CLIs here do it.
 */
export type CliOperatorClient = Readonly<{
  user: {
    findFirst(args: {
      where: {
        email: { equals: string; mode: 'insensitive' };
        isActive: true;
        anonymizedAt: null;
      };
      select: { id: true; userRoles: { select: { role: { select: { key: true } } } } };
    }): Promise<OperatorRow | null>;
  };
}>;

const privilegedRoles = new Set<string>([authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin]);

export class CliOperatorError extends Error {
  constructor(
    readonly reason: string,
    readonly exitCode = 2,
  ) {
    super(reason);
    this.name = 'CliOperatorError';
  }
}

/**
 * Resolves the operator to a user id, or refuses. A deactivated, anonymized or
 * non-administrative account cannot authorize a CLI write — otherwise the audit
 * trail would name an actor who could not have performed the command in the app.
 */
export async function resolveCliOperatorId(client: CliOperatorClient, email: string): Promise<string> {
  const operator = await client.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, isActive: true, anonymizedAt: null },
    select: { id: true, userRoles: { select: { role: { select: { key: true } } } } },
  });
  if (operator === null) {
    throw new CliOperatorError('CLI_OPERATOR_NOT_FOUND');
  }
  const keys = operator.userRoles.map((assignment) => assignment.role.key);
  if (!keys.some((key) => privilegedRoles.has(key))) {
    throw new CliOperatorError('CLI_OPERATOR_NOT_PRIVILEGED');
  }
  return operator.id;
}

/** Exported so a unit test can push it through the real `prepareAuditEntry` validation. */
export function buildCliCommandAuditEntry(input: CliCommandAuditInput): RecordAuditEntryInput {
  return {
    action: auditLogActions.cliCommandExecuted,
    entityType: auditLogEntityTypes.cliCommand,
    entityId: `${input.command}@${input.target.environment}:${input.target.fingerprint}`,
    actorUserId: input.operatorUserId,
    organizationalUnitId: null,
    metadata: {
      command: input.command,
      environment: input.target.environment,
      mode: 'apply',
      outcome: input.outcome,
      reason: input.reason,
      targetFingerprint: input.target.fingerprint,
      confirmation: input.confirmation,
      ...(input.counts === undefined ? {} : { counts: input.counts }),
    } as never,
  };
}

const auditEntry = buildCliCommandAuditEntry;

/** Inside an existing transaction: the audit row and the writes commit together. */
export async function appendCliCommandAudit(
  transaction: Parameters<typeof appendAuditLog>[0],
  input: CliCommandAuditInput,
): Promise<void> {
  await appendAuditLog(transaction, auditEntry(input));
}

/** Standalone row, in its own transaction (used for the fail-closed `started` gate). */
export async function recordCliCommandAudit(
  prisma: Parameters<typeof recordAuditEntry>[0],
  input: CliCommandAuditInput,
): Promise<void> {
  await recordAuditEntry(prisma, auditEntry(input));
}
