import { ForbiddenException } from '@nestjs/common';
import { assertCanManageTargetUser } from './assert-can-manage-target-user';

describe('assertCanManageTargetUser (review 2026-09-25)', () => {
  it('forbids an ADMIN from managing a SUPER_ADMIN (password reset takeover)', () => {
    expect(() =>
      assertCanManageTargetUser({ actorIsSuperAdmin: false, targetIsSuperAdmin: true }),
    ).toThrow(ForbiddenException);
  });
  it('allows a SUPER_ADMIN to manage a SUPER_ADMIN', () => {
    expect(() =>
      assertCanManageTargetUser({ actorIsSuperAdmin: true, targetIsSuperAdmin: true }),
    ).not.toThrow();
  });
  it('allows an ADMIN to manage regular users', () => {
    expect(() =>
      assertCanManageTargetUser({ actorIsSuperAdmin: false, targetIsSuperAdmin: false }),
    ).not.toThrow();
  });
});
