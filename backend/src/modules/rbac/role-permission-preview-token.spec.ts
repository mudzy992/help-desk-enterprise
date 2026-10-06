import { RbacError } from './rbac.error';
import {
  rolePermissionPreviewTokenTtlSeconds,
  signRolePermissionPreviewToken,
  verifyRolePermissionPreviewToken,
} from './role-permission-preview-token';

/*
  Paket 5.1 (M4 B2): the token is the only proof that the impact preview ran, so
  these cases are the gate itself — a token must not survive tampering, must not
  describe another set of permissions and must not outlive its 15 minutes.
*/
describe('role permission preview token', () => {
  const secret = 'test-preview-signing-secret-value-0123456789';
  const now = 1_800_000_000;

  const expectation = {
    roleKey: 'AGENT',
    permissionKeys: ['ticket.merge', 'settings.write'],
    actorUserId: 'super-1',
  };

  it('round-trips a preview for exactly the reviewed set', () => {
    const token = signRolePermissionPreviewToken(
      {
        roleKey: expectation.roleKey,
        permissionKeys: expectation.permissionKeys,
        actorUserId: expectation.actorUserId,
        issuedAt: now,
      },
      secret,
    );
    expect(
      verifyRolePermissionPreviewToken(token, expectation, secret, now + 60),
    ).toMatchObject({
      roleKey: 'AGENT',
      permissionKeys: ['settings.write', 'ticket.merge'],
      actorUserId: 'super-1',
      issuedAt: now,
      expiresAt: now + rolePermissionPreviewTokenTtlSeconds,
    });
  });

  it('ignores the order and duplicates of the reviewed keys', () => {
    const token = signRolePermissionPreviewToken(
      {
        roleKey: 'AGENT',
        permissionKeys: ['settings.write', 'ticket.merge', 'ticket.merge'],
        actorUserId: 'super-1',
        issuedAt: now,
      },
      secret,
    );
    expect(
      verifyRolePermissionPreviewToken(
        token,
        {
          ...expectation,
          permissionKeys: ['ticket.merge', 'settings.write'],
        },
        secret,
        now,
      ).permissionKeys,
    ).toEqual(['settings.write', 'ticket.merge']);
  });

  it('rejects a missing token, a mangled token and a foreign signature', () => {
    const token = signRolePermissionPreviewToken(
      {
        roleKey: 'AGENT',
        permissionKeys: expectation.permissionKeys,
        actorUserId: 'super-1',
        issuedAt: now,
      },
      secret,
    );
    const [body] = token.split('.');
    const cases = [
      '',
      'not-a-token',
      `${body}.AAAA`,
      signRolePermissionPreviewToken(
        {
          roleKey: 'AGENT',
          permissionKeys: expectation.permissionKeys,
          actorUserId: 'super-1',
          issuedAt: now,
        },
        'another-secret-0123456789',
      ),
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
    const token = signRolePermissionPreviewToken(
      {
        roleKey: 'AGENT',
        permissionKeys: expectation.permissionKeys,
        actorUserId: 'super-1',
        issuedAt: now,
      },
      secret,
    );
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        roleKey: 'AGENT',
        permissionKeys: ['settings.write', 'ticket.merge', 'users.write'],
        actorUserId: 'super-1',
        issuedAt: now,
        expiresAt: now + 60,
      }),
      'utf8',
    ).toString('base64url');
    expect(() =>
      verifyRolePermissionPreviewToken(
        `${forged}.${signature}`,
        { ...expectation, permissionKeys: ['settings.write', 'ticket.merge', 'users.write'] },
        secret,
        now,
      ),
    ).toThrow(RbacError);
  });

  it('marks an expired preview as stale, not missing', () => {
    const token = signRolePermissionPreviewToken(
      {
        roleKey: 'AGENT',
        permissionKeys: expectation.permissionKeys,
        actorUserId: 'super-1',
        issuedAt: now,
      },
      secret,
    );
    try {
      verifyRolePermissionPreviewToken(
        token,
        expectation,
        secret,
        now + rolePermissionPreviewTokenTtlSeconds,
      );
      throw new Error('expected the preview to expire');
    } catch (error) {
      expect((error as RbacError).code).toBe('PREVIEW_STALE');
    }
  });

  it('marks a preview for another set or another actor as stale', () => {
    const token = signRolePermissionPreviewToken(
      {
        roleKey: 'AGENT',
        permissionKeys: expectation.permissionKeys,
        actorUserId: 'super-1',
        issuedAt: now,
      },
      secret,
    );
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
});
