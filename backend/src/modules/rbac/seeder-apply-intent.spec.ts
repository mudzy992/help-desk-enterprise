import {
  evaluateSeedApplyRequest,
  parseSeedCommandRequest,
} from './seeder-apply-intent';

/*
  W2.35 (`BA-rbac-08`): the seeder is additive, so a plain maintenance run can
  restore a permission an administrator removed on purpose. These tests pin the
  rule the operator sees: nothing is written without the reviewed plan
  (`--confirm=<fingerprint>`) or an explicit `--restore-defaults`.
*/
const argv = (...flags: string[]) => ['node', '/app/cli.js', ...flags];
const fingerprint = 'a'.repeat(64);

describe('seed command consent (BA-rbac-08)', () => {
  it('reads a dry run', () => {
    expect(parseSeedCommandRequest(argv('--dry-run'))).toEqual({
      kind: 'dry-run',
    });
  });

  it('reads an explicit restore', () => {
    expect(parseSeedCommandRequest(argv('--restore-defaults'))).toEqual({
      kind: 'apply',
      consent: 'restore-defaults',
    });
  });

  it('reads a confirmed plan', () => {
    expect(parseSeedCommandRequest(argv(`--confirm=${fingerprint}`))).toEqual({
      kind: 'apply',
      consent: 'fingerprint',
      confirmedFingerprint: fingerprint,
    });
  });

  it('refuses a plain run: additive seeding is a policy decision', () => {
    const request = parseSeedCommandRequest(argv());
    expect(request.kind).toBe('invalid');
    const decision = evaluateSeedApplyRequest(request, fingerprint);
    expect(decision).toMatchObject({
      allowed: false,
      reason: 'confirmation-required',
    });
  });

  it('refuses an empty or unknown flag set', () => {
    expect(parseSeedCommandRequest(argv('--confirm=')).kind).toBe('invalid');
    expect(parseSeedCommandRequest(argv('--force')).kind).toBe('invalid');
    expect(
      parseSeedCommandRequest(argv('--dry-run', '--restore-defaults')).kind,
    ).toBe('invalid');
    expect(
      parseSeedCommandRequest(
        argv('--restore-defaults', `--confirm=${fingerprint}`),
      ).kind,
    ).toBe('invalid');
  });

  it('applies exactly the plan the operator reviewed', () => {
    const decision = evaluateSeedApplyRequest(
      parseSeedCommandRequest(argv(`--confirm=${fingerprint}`)),
      fingerprint,
    );
    expect(decision).toEqual({ allowed: true, consent: 'fingerprint' });
  });

  it('refuses a confirmation whose plan changed since the dry run', () => {
    const decision = evaluateSeedApplyRequest(
      parseSeedCommandRequest(argv(`--confirm=${'b'.repeat(64)}`)),
      fingerprint,
    );
    expect(decision).toMatchObject({
      allowed: false,
      reason: 'fingerprint-mismatch',
    });
  });

  it('never treats a dry run as a write', () => {
    expect(
      evaluateSeedApplyRequest(
        parseSeedCommandRequest(argv('--dry-run')),
        fingerprint,
      ).allowed,
    ).toBe(false);
  });
});
