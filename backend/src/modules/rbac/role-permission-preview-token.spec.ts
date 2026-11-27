import { RbacError } from './rbac.error';
import {
  permissionKeySetsMatch,
  rolePermissionPreviewTokenTtlSeconds,
  signRolePermissionPreviewToken,
  verifyRolePermissionPreviewToken,
} from './role-permission-preview-token';

/*
  Paket 5.1 (M4 B2): the token is the only proof that the impact preview ran, so
  these cases are the gate itself — a token must not survive tampering, must not
  describe another set of permissions and must not outlive its 15 minutes.

  BA-rbac-01 (W2.29): the token also carries the baseline the preview saw, so a
  preview that is older than another administrator's commit cannot silently
  overwrite it. The baseline is signed like everything else: editing it in the
  body is indistinguishable from editing the reviewed set.
*/
describe('role permission preview token', () => {
  const secret = 'test-preview-signing-secret-value-0123456789';
  const now = 1_800_000_000;

  const baseline = ['ticket.merge'];
  const expectation = {
    roleKey: 'AGENT',
    permissionKeys: ['ticket.merge', 'settings.write'],
    actorUserId: 'super-1',
  };

  const jti = '11111111-2222-3333-4444-555555555555';
  const sign = (
    overrides: Partial<{
      jti: string;
      roleKey: string;
      permissionKeys: readonly string[];
      baselinePermissionKeys: readonly string[];
      actorUserId: string | null;
      secret: string;
    }> = {},
  ): string =>
    signRolePermissionPreviewToken(
      {
        jti: overrides.jti ?? jti,
        roleKey: overrides.roleKey ?? expectation.roleKey,
        permissionKeys: overrides.permissionKeys ?? expectation.permissionKeys,
        baselinePermissionKeys:
          overrides.baselinePermissionKeys ?? baseline,
        actorUserId:
          overrides.actorUserId === undefined
            ? expectation.actorUserId
            : overrides.actorUserId,
        issuedAt: now,
      },
      overrides.secret ?? secret,
    );

  it('round-trips a preview for exactly the reviewed set and its baseline', () => {
    const token = sign();
    expect(
      verifyRolePermissionPreviewToken(token, expectation, secret, now + 60),
    ).toMatchObject({
      jti,
      roleKey: 'AGENT',
      permissionKeys: ['settings.write', 'ticket.merge'],
      baselinePermissionKeys: ['ticket.merge'],
      actorUserId: 'super-1',
      issuedAt: now,
      expiresAt: now + rolePermissionPreviewTokenTtlSeconds,
    });
  });

  it('ignores the order and duplicates of both the reviewed and the baseline keys', () => {
    const token = sign({
      permissionKeys: ['settings.write', 'ticket.merge', 'ticket.merge'],
      baselinePermissionKeys: ['ticket.merge', 'ticket.merge', 'users.write'],
    });
    const verified = verifyRolePermissionPreviewToken(
      token,
      { ...expectation, permissionKeys: ['ticket.merge', 'settings.write'] },
      secret,
      now,
    );
    expect(verified.permissionKeys).toEqual(['settings.write', 'ticket.merge']);
    expect(verified.baselinePermissionKeys).toEqual(['ticket.merge', 'users.write']);
  });

  it('rejects a missing token, a mangled token and a foreign signature', () => {
    const [body] = sign().split('.');
    const cases = [
      '',
      'not-a-token',
      `${body}.AAAA`,
      sign({ secret: 'another-secret-0123456789' }),
    ];
    for (const candidate of cases) {
      expect(() =>
        verifyRolePermissionPreviewToken(candidate, expectation, secret, now),
      ).toThrow(RbacError);
      try {
        verifyRolePermissionPreviewToken(candidate, expectation, secret, now);
      } catch (error) {
        expect((error as RbacError).code).toBe('PREVIEW_REQUIRED');
      }
    }
  });

  it('rejects a body that was edited after signing', () => {
    const [, signature] = sign().split('.');
    const forged = Buffer.from(
      JSON.stringify({
        jti,
        roleKey: 'AGENT',
        permissionKeys: ['settings.write', 'ticket.merge', 'users.write'],
        baselinePermissionKeys: ['ticket.merge'],
        actorUserId: 'super-1',
        issuedAt: now,
        expiresAt: now + 60,
      }),
      'utf8',
    ).toString('base64url');
    expect(() =>
      verifyRolePermissionPreviewToken(
        `${forged}.${signature}`,
        {
          ...expectation,
          permissionKeys: ['settings.write', 'ticket.merge', 'users.write'],
        },
        secret,
        now,
      ),
    ).toThrow(RbacError);
  });

  it('rejects a body whose baseline was edited after signing', () => {
    // The attack BA-rbac-01 describes: keep your own preview, rewrite the
    // baseline so the compare-and-swap accepts your write over someone else's
    // commit. The baseline is inside the signature, so the edit is visible.
    const [, signature] = sign().split('.');
    const forged = Buffer.from(
      JSON.stringify({
        jti,
        roleKey: 'AGENT',
        permissionKeys: ['settings.write', 'ticket.merge'],
        baselinePermissionKeys: ['settings.write', 'ticket.merge'],
        actorUserId: 'super-1',
        issuedAt: now,
        expiresAt: now + 60,
      }),
      'utf8',
    ).toString('base64url');
    try {
      verifyRolePermissionPreviewToken(
        `${forged}.${signature}`,
        expectation,
        secret,
        now,
      );
      throw new Error('expected the forged baseline to be rejected');
    } catch (error) {
      expect((error as RbacError).code).toBe('PREVIEW_REQUIRED');
    }
  });

  it('refuses a token minted before the baseline existed', () => {
    // Rolling deploy: tokens issued by the previous build carry no baseline.
    // `PREVIEW_STALE`-free upgrade is not worth a silent pass — the reviewer runs
    // the preview again (it costs one request and shows the new state).
    const legacyBody = Buffer.from(
      JSON.stringify({
        roleKey: 'AGENT',
        permissionKeys: ['settings.write', 'ticket.merge'],
        actorUserId: 'super-1',
        issuedAt: now,
        expiresAt: now + 60,
      }),
      'utf8',
    ).toString('base64url');
    const legacySignature = (
      sign() as string
    ).split('.')[1];
    expect(legacySignature).toBeDefined();
    try {
      verifyRolePermissionPreviewToken(
        `${legacyBody}.${legacySignature}`,
        expectation,
        secret,
        now,
      );
      throw new Error('expected the legacy token to be rejected');
    } catch (error) {
      expect((error as RbacError).code).toBe('PREVIEW_REQUIRED');
    }
  });

  it('binds the preview id (jti) — the claim the write consumes', () => {
    // W2.30 (BA-rbac-02): the token must name the row the write claims, and the
    // id must be inside the signature like every other field.
    const token = sign();
    const verified = verifyRolePermissionPreviewToken(token, expectation, secret, now);
    expect(verified.jti).toBe(jti);

    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        jti: '99999999-8888-7777-6666-555555555555',
        roleKey: 'AGENT',
        permissionKeys: ['settings.write', 'ticket.merge'],
        baselinePermissionKeys: ['ticket.merge'],
        actorUserId: 'super-1',
        issuedAt: now,
        expiresAt: now + 60,
      }),
      'utf8',
    ).toString('base64url');
    try {
      verifyRolePermissionPreviewToken(`${forged}.${signature}`, expectation, secret, now);
      throw new Error('expected the forged jti to be rejected');
    } catch (error) {
      expect((error as RbacError).code).toBe('PREVIEW_REQUIRED');
    }
  });

  it('refuses a token without a preview id', () => {
    const [, signature] = sign().split('.');
    const withoutJti = Buffer.from(
      JSON.stringify({
        roleKey: 'AGENT',
        permissionKeys: ['settings.write', 'ticket.merge'],
        baselinePermissionKeys: ['ticket.merge'],
        actorUserId: 'super-1',
        issuedAt: now,
        expiresAt: now + 60,
      }),
      'utf8',
    ).toString('base64url');
    try {
      verifyRolePermissionPreviewToken(`${withoutJti}.${signature}`, expectation, secret, now);
      throw new Error('expected a token without jti to be rejected');
    } catch (error) {
      expect((error as RbacError).code).toBe('PREVIEW_REQUIRED');
    }
  });

  it('marks an expired preview as stale, not missing', () => {
    try {
      verifyRolePermissionPreviewToken(
        sign(),
        expectation,
        secret,
        now + rolePermissionPreviewTokenTtlSeconds,
      );
      throw new Error('expected the preview to expire');
    } catch (error) {
      expect((error as RbacError).code).toBe('PREVIEW_STALE');
    }
  });

  it('marks a preview for another set, role or actor as stale', () => {
    const token = sign();
    const cases = [
      { ...expectation, permissionKeys: ['settings.write'] },
      { ...expectation, roleKey: 'ADMIN' },
      { ...expectation, actorUserId: 'super-2' },
      { ...expectation, actorUserId: null },
    ];
    for (const candidate of cases) {
      try {
        verifyRolePermissionPreviewToken(token, candidate, secret, now);
        throw new Error('expected the preview to be stale');
      } catch (error) {
        expect((error as RbacError).code).toBe('PREVIEW_STALE');
      }
    }
  });

  it('compares baselines as sets, never as arrays', () => {
    expect(permissionKeySetsMatch([], [])).toBe(true);
    expect(permissionKeySetsMatch(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(permissionKeySetsMatch(['a', 'a', 'b'], ['a', 'b'])).toBe(true);
    expect(permissionKeySetsMatch(['a'], ['a', 'b'])).toBe(false);
    expect(permissionKeySetsMatch(['a', 'b'], ['a'])).toBe(false);
    // An empty baseline is a real state (a role with no permissions), so it must
    // not be confused with "no baseline at all".
    expect(permissionKeySetsMatch([], ['a'])).toBe(false);
  });
});
