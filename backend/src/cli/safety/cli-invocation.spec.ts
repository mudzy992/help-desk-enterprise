import { resolveCliInvocation } from './cli-invocation';

const databaseUrl = 'postgresql://u:p@db.example:5432/helpdesk';
const fingerprintOf = (environment: string): string =>
  resolveCliInvocation({ command: 'assets-seed-demo', argv: ['--environment', environment], env: {}, databaseUrl })
    .expectedConfirmation.split(':')[1] as string;
const confirmFor = (environment: string): string => `assets-seed-demo@${environment}:${fingerprintOf(environment)}`;

const writeArgs = (options: {
  environment?: string;
  reason?: string | null;
  operator?: string | null;
  confirm?: string | null;
  extra?: readonly string[];
} = {}): string[] => {
  const environment = options.environment ?? 'development';
  const reason = options.reason === undefined ? 'demo podaci za prezentaciju' : options.reason;
  const operator = options.operator === undefined ? 'admin@example.invalid' : options.operator;
  const confirm = options.confirm === undefined ? confirmFor(environment) : options.confirm;
  return [
    '--environment',
    environment,
    '--apply',
    ...(reason === null ? [] : ['--reason', reason]),
    ...(operator === null ? [] : ['--operator', operator]),
    ...(confirm === null ? [] : ['--confirm', confirm]),
    ...(options.extra ?? []),
  ];
};

const invoke = (argv: readonly string[], env: NodeJS.ProcessEnv = {}) =>
  resolveCliInvocation({ command: 'assets-seed-demo', argv, env, databaseUrl, supportsRemove: true });

describe('CLI invocation guard (W1.5, BA-xcut-08)', () => {
  it('is a dry run by default: no reason, no operator, no confirmation', () => {
    expect(invoke(['--environment', 'development'])).toMatchObject({
      apply: false,
      remove: false,
      reason: null,
      operatorEmail: null,
    });
  });

  it('does not let a `--remove` sneak past the apply guards', () => {
    expect(() => invoke(['--environment', 'development', '--remove'])).toThrow(
      expect.objectContaining({ reason: 'CLI_REMOVE_REQUIRES_APPLY' }),
    );
    expect(() => invoke(['--environment', 'development', '--apply', '--remove'])).toThrow(
      expect.objectContaining({ reason: 'CLI_APPLY_REQUIRES_REASON' }),
    );
  });

  it('requires a reason of at least five characters on every apply', () => {
    expect(() => invoke(['--environment', 'development', '--apply'])).toThrow(
      expect.objectContaining({ reason: 'CLI_APPLY_REQUIRES_REASON' }),
    );
    expect(() => invoke(writeArgs({ reason: 'abcd' }))).toThrow(
      expect.objectContaining({ reason: 'CLI_REASON_TOO_SHORT:5' }),
    );
    expect(() => invoke(writeArgs({ reason: '    ' }))).toThrow(
      expect.objectContaining({ reason: 'CLI_REASON_TOO_SHORT:5' }),
    );
  });

  it('requires an operator that looks like an account, and takes it from CLI_OPERATOR too', () => {
    expect(() => invoke(writeArgs({ operator: null }))).toThrow(
      expect.objectContaining({ reason: 'CLI_APPLY_REQUIRES_OPERATOR' }),
    );
    expect(() => invoke(writeArgs({ operator: 'nije-adresa' }))).toThrow(
      expect.objectContaining({ reason: 'CLI_OPERATOR_INVALID' }),
    );
    expect(invoke(writeArgs({ operator: null }), { CLI_OPERATOR: 'admin@example.invalid' })).toMatchObject({
      apply: true,
      operatorEmail: 'admin@example.invalid',
    });
  });

  it('requires the target phrase to be typed back exactly', () => {
    expect(() => invoke(writeArgs({ confirm: null }))).toThrow(
      expect.objectContaining({ reason: 'CLI_APPLY_REQUIRES_CONFIRMATION' }),
    );
    expect(() => invoke(writeArgs({ confirm: 'assets-seed-demo@production:000000000000' }))).toThrow(
      expect.objectContaining({ reason: `CLI_CONFIRMATION_MISMATCH:expected=${confirmFor('development')}` }),
    );
  });

  it('refuses a production write without --allow-production, and accepts it with', () => {
    expect(() => invoke(writeArgs({ environment: 'production' }))).toThrow(
      expect.objectContaining({ reason: 'CLI_PRODUCTION_REQUIRES_ALLOW_FLAG' }),
    );
    expect(invoke(writeArgs({ environment: 'production', extra: ['--allow-production'] }))).toMatchObject({
      apply: true,
      remove: false,
      target: { environment: 'production' },
    });
    expect(invoke(writeArgs({ environment: 'staging' }))).toMatchObject({ apply: true, target: { environment: 'staging' } });
  });

  it('carries the remove mode only when apply was accepted', () => {
    expect(invoke(writeArgs({ environment: 'staging', extra: ['--remove'] }))).toMatchObject({ apply: true, remove: true });
    expect(() =>
      resolveCliInvocation({
        command: 'rekey-asset-licenses',
        argv: writeArgs({ extra: ['--remove'] }),
        env: {},
        databaseUrl,
        supportsRemove: false,
      }),
    ).toThrow(expect.objectContaining({ reason: 'CLI_COMMAND_HAS_NO_REMOVE_MODE:rekey-asset-licenses' }));
  });

  it('rejects an unknown flag instead of silently running a dry run', () => {
    expect(() => invoke(['--environment', 'development', '--aply'])).toThrow(
      expect.objectContaining({ reason: 'CLI_UNKNOWN_FLAG:--aply' }),
    );
    expect(() => invoke(['--environment', 'development', '--allow-productionn'])).toThrow(
      expect.objectContaining({ reason: 'CLI_UNKNOWN_FLAG:--allow-productionn' }),
    );
  });

  it('lets the environment supply the reason and the operator but never the apply decision', () => {
    const invocation = invoke(['--confirm', confirmFor('staging')], {
      CLI_ENVIRONMENT: 'staging',
      CLI_REASON: 'demo za prezentaciju',
      CLI_OPERATOR: 'admin@example.invalid',
    });
    // Everything looks ready, but `--apply` was never typed: no write.
    expect(invocation.apply).toBe(false);
    expect(invocation.reason).toBeNull();

    const applied = invoke([...writeArgs({ environment: 'staging', reason: null, operator: null })], {
      CLI_REASON: 'demo za prezentaciju',
      CLI_OPERATOR: 'admin@example.invalid',
    });
    expect(applied).toMatchObject({
      apply: true,
      reason: 'demo za prezentaciju',
      operatorEmail: 'admin@example.invalid',
    });
  });
});
