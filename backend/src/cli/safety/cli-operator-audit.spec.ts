import { prepareAuditEntry } from '../../modules/audit-log/audit-event-policy';
import { auditLogActions, auditLogEntityTypes } from '../../modules/audit-log/audit-log.constants';
import {
  CliOperatorError,
  buildCliCommandAuditEntry,
  resolveCliOperatorId,
  type CliOperatorClient,
} from './cli-operator-audit';

type FindFirstArgs = Parameters<CliOperatorClient['user']['findFirst']>[0];

function clientReturning(row: Awaited<ReturnType<CliOperatorClient['user']['findFirst']>>): {
  client: CliOperatorClient;
  calls: FindFirstArgs[];
} {
  const calls: FindFirstArgs[] = [];
  return {
    calls,
    client: {
      user: {
        findFirst: async (args) => {
          calls.push(args);
          return row;
        },
      },
    },
  };
}

const privileged = (key: string) => ({ id: 'operator-1', userRoles: [{ role: { key } }] });

describe('CLI operator and its audit row (W1.5, BA-xcut-08)', () => {
  it('resolves an active, administrative operator and asks only for active, non-anonymized rows', async () => {
    const { client, calls } = clientReturning(privileged('ADMIN'));
    await expect(resolveCliOperatorId(client, 'Admin@Example.invalid')).resolves.toBe('operator-1');
    expect(calls[0]).toEqual({
      where: {
        email: { equals: 'Admin@Example.invalid', mode: 'insensitive' },
        isActive: true,
        anonymizedAt: null,
      },
      select: { id: true, userRoles: { select: { role: { select: { key: true } } } } },
    });
  });

  it('accepts a SuperAdmin as operator', async () => {
    const { client } = clientReturning(privileged('SUPER_ADMIN'));
    await expect(resolveCliOperatorId(client, 'root@example.invalid')).resolves.toBe('operator-1');
  });

  it('refuses an operator that does not exist and one that is not administrative', async () => {
    const missing = clientReturning(null);
    await expect(resolveCliOperatorId(missing.client, 'ghost@example.invalid')).rejects.toThrow(
      expect.objectContaining({ reason: 'CLI_OPERATOR_NOT_FOUND', exitCode: 2 }),
    );
    const agent = clientReturning(privileged('AGENT'));
    await expect(resolveCliOperatorId(agent.client, 'agent@example.invalid')).rejects.toBeInstanceOf(CliOperatorError);
    await expect(resolveCliOperatorId(agent.client, 'agent@example.invalid')).rejects.toThrow(
      expect.objectContaining({ reason: 'CLI_OPERATOR_NOT_PRIVILEGED' }),
    );
  });

  it('writes an audit row the canonical action/entity/scope contract accepts', () => {
    const entry = buildCliCommandAuditEntry({
      command: 'assets-seed-demo',
      target: { environment: 'staging', fingerprint: 'abcdef123456' },
      outcome: 'completed',
      reason: 'demo za prezentaciju',
      operatorUserId: 'operator-1',
      confirmation: 'assets-seed-demo@staging:abcdef123456',
      counts: { assets: 40, locations: 4, licenses: 4, contracts: 2, retainedAssets: 1 },
    });
    expect(entry).toMatchObject({
      action: 'cli.command.executed',
      entityType: 'cli_command',
      entityId: 'assets-seed-demo@staging:abcdef123456',
      actorUserId: 'operator-1',
      organizationalUnitId: null,
    });
    expect(entry.action).toBe(auditLogActions.cliCommandExecuted);
    expect(entry.entityType).toBe(auditLogEntityTypes.cliCommand);

    // The real registry decides, not this test: an unregistered key is refused.
    const prepared = prepareAuditEntry(entry);
    expect(prepared.actionSchemaVersion).toBe(1);
    expect(prepared.metadata).toMatchObject({
      command: 'assets-seed-demo',
      environment: 'staging',
      mode: 'apply',
      outcome: 'completed',
      targetFingerprint: 'abcdef123456',
      counts: { assets: 40 },
    });
    expect(() =>
      prepareAuditEntry({ ...entry, metadata: { ...(entry.metadata as object), unknownKey: true } as never }),
    ).toThrow('AUDIT_METADATA_FIELD_NOT_ALLOWED:cli.command.executed:unknownKey');
  });

  it('leaves counts out of the `started` row instead of pretending the run finished', () => {
    const entry = buildCliCommandAuditEntry({
      command: 'assets-seed-demo',
      target: { environment: 'production', fingerprint: 'abcdef123456' },
      outcome: 'started',
      reason: 'demo za prezentaciju',
      operatorUserId: 'operator-1',
      confirmation: 'assets-seed-demo@production:abcdef123456',
    });
    expect(entry.metadata).not.toHaveProperty('counts');
    expect(prepareAuditEntry(entry).metadata).toMatchObject({ outcome: 'started', environment: 'production' });
  });
});
