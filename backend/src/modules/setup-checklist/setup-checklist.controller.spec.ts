import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import { AuthenticationModule } from '../authentication/authentication.module';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import {
  AUTHORIZATION_PERMISSION_MATCH_MODE_KEY,
  AUTHORIZATION_REQUIRED_PERMISSIONS_KEY,
  AUTHORIZATION_REQUIRED_ROLES_KEY,
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { AuthorizationModule } from '../authorization/authorization.module';
import { classifyAdminReadOnlyRequest } from '../authorization/classify-admin-read-only-request';
import { RoleGuard } from '../authorization/role.guard';
import { createInstallWizardHarness } from '../install/create-install-wizard-harness';
import { SetupChecklistController } from './setup-checklist.controller';
import { SetupChecklistModule } from './setup-checklist.module';
import { SetupChecklistService } from './setup-checklist.service';

/**
 * Install wizard v2 (F6.3): the checklist is administration content, so the
 * controller asks for the same capability that lets somebody change what it
 * points at. The behaviour of those guards is specced next to them
 * (`session-authentication.guard.spec.ts`, `role.guard.spec.ts`); what this spec
 * holds is the wiring at the controller: a session (401 without one), the admin
 * role and `settings.write` (403 without them), the read-only classification, and —
 * the failure a hand-built controller never shows — the modules the guard chain
 * resolves from.
 */
async function createController() {
  const wizard = await createInstallWizardHarness();
  const service = new SetupChecklistService(wizard.prisma, wizard.settingsService);
  return { wizard, service, controller: new SetupChecklistController(service) };
}

const withoutSession = {} as AuthenticatedHttpRequest;
const asSuperAdmin = {
  [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: { subjectId: 'admin-1' },
} as unknown as AuthenticatedHttpRequest;

describe('SetupChecklistController (post-install checklist)', () => {
  it('requires a session, the admin role and settings.write', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SetupChecklistController) as readonly {
      readonly name: string;
    }[];

    expect(guards.map((guard) => guard.name)).toEqual([
      SessionAuthenticationGuard.name,
      RoleGuard.name,
    ]);
    expect(Reflect.getMetadata(AUTHORIZATION_REQUIRED_ROLES_KEY, SetupChecklistController)).toEqual([
      authorizationRoleKeys.admin,
    ]);
    expect(
      Reflect.getMetadata(AUTHORIZATION_REQUIRED_PERMISSIONS_KEY, SetupChecklistController),
    ).toEqual([permissionKeys.settingsWrite]);
    expect(
      Reflect.getMetadata(AUTHORIZATION_PERMISSION_MATCH_MODE_KEY, SetupChecklistController),
    ).toBe('any');
  });

  it('stays outside read-only mode instead of annotating an exemption', () => {
    // The checklist is administrative content but not configuration: neither the
    // read nor the dismissal is part of a lockable module, so read-only mode has
    // nothing to classify — and the controller carries no exemption of its own.
    expect(
      classifyAdminReadOnlyRequest({
        method: 'GET',
        path: '/setup-checklist',
        handlerIdentity: 'SetupChecklistController.getStatus',
      }),
    ).toBeNull();
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/setup-checklist/dismiss',
        handlerIdentity: 'SetupChecklistController.dismiss',
      }),
    ).toBeNull();
  });

  it('imports the modules its guard chain resolves from', () => {
    // The controller is instantiated inside its own module's injector: importing
    // only `SettingsModule` leaves `SessionAuthenticationGuard` unresolvable, and
    // only `app.module.spec.ts` (which compiles the real AppModule) notices.
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      SetupChecklistModule,
    ) as readonly object[];

    expect(imports).toContain(AuthenticationModule);
    expect(imports).toContain(AuthorizationModule);
  });

  it('serves the open items', async () => {
    const { wizard, controller } = await createController();
    await wizard.skipService.skip('team');

    const status = await controller.getStatus();

    expect(status.items.map((item) => item.key)).toContain('step.team');
  });

  it('refuses a dismissal nobody can be attributed to', async () => {
    const { controller } = await createController();

    // The guard chain answers 401 before this point; were the method reached
    // without a caller, the dismissal must not be written anonymously. `dismiss`
    // throws before it returns a promise, so the call is wrapped.
    await expect(async () => controller.dismiss(withoutSession)).rejects.toMatchObject({
      status: 403,
      response: { code: 'FORBIDDEN' },
    });
  });

  it('dismisses for the signed-in administrator and keeps the items', async () => {
    const { wizard, controller } = await createController();
    await wizard.skipService.skip('smtp');
    const before = await controller.getStatus();

    const after = await controller.dismiss(asSuperAdmin);

    expect(after.dismissedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(after.items.map((item) => item.key)).toEqual(before.items.map((item) => item.key));
    await expect(controller.getStatus()).resolves.toMatchObject({ dismissedAt: after.dismissedAt });
  });
});
