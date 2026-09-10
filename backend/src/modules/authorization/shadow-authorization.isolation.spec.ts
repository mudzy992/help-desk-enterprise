import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { permissionKeys } from './authorization.constants';
import { authorizationDecisionReasons } from './authorization-decision-reason';
import { AuthorizationService } from './authorization.service';
import {
  createTestAuthorizationContext,
} from './create-test-authorization-context';
import {
  createTestAuthorizationHarness,
  createTestAuthorizationRequirements,
  shadowTestPrincipal,
} from './create-test-authorization-harness';
import { OuAccessGuard } from './ou-access.guard';
import { RoleGuard } from './role.guard';
import { shadowAuthorizationDecisions } from './shadow-authorization.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createHttpContext(
  principal: AuthorizationPrincipal,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: principal,
        params: {},
      }),
    }),
    getHandler: () => function handle() {},
    getClass: () => class Handler {},
  } as unknown as ExecutionContext;
}

describe('shadow authorization isolation', () => {
  const harness = createTestAuthorizationHarness();

  beforeEach(() => {
    harness.loadBySubjectId.mockReset();
    harness.findOrganizationalUnit.mockReset();
    harness.findService.mockReset();
    harness.userCreate.mockReset();
    harness.userUpdate.mockReset();
    harness.loadBySubjectId.mockResolvedValue(createTestAuthorizationContext());
  });

  it('mirrors authorize() without changing the enforcing decision', async () => {
    const input = {
      principal: shadowTestPrincipal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.ticketMerge],
      }),
      organizationalUnitId: null,
      serviceId: null,
    };
    const before = await harness.authorizationService.authorize(input);
    const report = await harness.shadowAuthorizationService.evaluate(input);
    const after = await harness.authorizationService.authorize(input);
    expect(before).toBe(true);
    expect(after).toBe(before);
    expect(report.decision === shadowAuthorizationDecisions.allow).toBe(before);
    expect(report.isEnforcing).toBe(false);
    expect(report.kind).toBe('shadow');
  });

  it('does not let a shadow ALLOW grant RoleGuard or OuAccessGuard access', async () => {
    const report = await harness.shadowAuthorizationService.evaluate({
      principal: shadowTestPrincipal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.ticketMerge],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    expect(report.decision).toBe(shadowAuthorizationDecisions.allow);
    const authorize = jest.fn().mockResolvedValue(false);
    const authorizationService = { authorize } as unknown as AuthorizationService;
    const roleGuard = new RoleGuard(new Reflector(), authorizationService);
    const ouAccessGuard = new OuAccessGuard(new Reflector(), authorizationService);
    await expect(
      roleGuard.canActivate(createHttpContext(shadowTestPrincipal)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      ouAccessGuard.canActivate(createHttpContext(shadowTestPrincipal)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorize).toHaveBeenCalled();
  });

  it('does not mutate the principal, context, or database', async () => {
    const principal = Object.freeze({ ...shadowTestPrincipal });
    const context = createTestAuthorizationContext();
    Object.freeze(context);
    Object.freeze(context.assignments);
    harness.loadBySubjectId.mockResolvedValue(context);
    const snapshot = structuredClone(principal);
    await harness.shadowAuthorizationService.evaluate({
      principal,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.ticketMerge],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    expect(principal).toEqual(snapshot);
    expect(harness.userCreate).not.toHaveBeenCalled();
    expect(harness.userUpdate).not.toHaveBeenCalled();
    expect(harness.prisma.organizationalUnit.create).not.toHaveBeenCalled();
    expect(harness.prisma.service.update).not.toHaveBeenCalled();
  });

  it('uses the same path for local and Entra-linked principals', async () => {
    const context = createTestAuthorizationContext({ isLocalOnly: false });
    harness.loadBySubjectId.mockResolvedValue(context);
    const requirements = createTestAuthorizationRequirements({
      requiredPermissions: [permissionKeys.ticketMerge],
    });
    const localPrincipal: AuthorizationPrincipal = {
      subjectId: 'user-1',
      email: 'local.user@example.com',
      displayName: 'Local User',
      isLocalOnly: true,
    };
    const entraPrincipal: AuthorizationPrincipal = {
      subjectId: 'user-1',
      email: 'entra.user@contoso.com',
      displayName: 'Entra User',
      isLocalOnly: false,
    };
    const localReport = await harness.shadowAuthorizationService.evaluate({
      principal: localPrincipal,
      requirements,
      organizationalUnitId: null,
      serviceId: null,
    });
    const entraReport = await harness.shadowAuthorizationService.evaluate({
      principal: entraPrincipal,
      requirements,
      organizationalUnitId: null,
      serviceId: null,
    });
    expect(localReport).toEqual(entraReport);
    expect(JSON.stringify(localReport)).not.toContain(localPrincipal.email);
    expect(JSON.stringify(entraReport)).not.toContain(entraPrincipal.email);
    expect(localReport.considered).not.toHaveProperty('provider');
    expect(localReport.considered).not.toHaveProperty('entraObjectId');
    expect(harness.loadBySubjectId).toHaveBeenNthCalledWith(1, 'user-1');
    expect(harness.loadBySubjectId).toHaveBeenNthCalledWith(2, 'user-1');
  });

  it('keeps missing principals as a shadow DENY without touching enforcement APIs', async () => {
    const report = await harness.shadowAuthorizationService.evaluate({
      principal: null,
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.ticketMerge],
      }),
      organizationalUnitId: null,
      serviceId: null,
    });
    expect(report.decision).toBe(shadowAuthorizationDecisions.deny);
    expect(report.reason).toBe(authorizationDecisionReasons.missingPrincipal);
    expect(harness.loadBySubjectId).not.toHaveBeenCalled();
  });

  it('does not wire shadow evaluation into RoleGuard or OuAccessGuard', () => {
    const files = [
      'role.guard.ts',
      'ou-access.guard.ts',
      'authorize-http-execution.ts',
    ];
    for (const fileName of files) {
      const source = readFileSync(join(__dirname, fileName), 'utf8');
      expect(source).not.toContain('ShadowAuthorization');
      expect(source).not.toContain('evaluateShadow');
    }
    expect(
      readFileSync(join(__dirname, 'authorize-http-execution.ts'), 'utf8'),
    ).toContain('.authorize(');
  });
});
