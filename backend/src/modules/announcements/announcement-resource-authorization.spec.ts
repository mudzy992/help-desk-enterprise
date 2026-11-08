import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import type { AuthorizationService } from '../authorization/authorization.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { authorizeAnnouncementAudiences } from './announcement-resource-authorization';
import type { AnnouncementPermissionScope } from './announcement-permission-scope';

const principal: AuthorizationPrincipal = {
  subjectId: 'actor-1',
  email: 'actor@example.invalid',
  displayName: 'Actor',
  isLocalOnly: false,
};
const noOuScope: AnnouncementPermissionScope = { global: false, organizationalUnits: [] };
const itScope: AnnouncementPermissionScope = {
  global: false,
  organizationalUnits: [{ organizationalUnitId: 'ou-it', organizationalUnitPath: '/root/IT' }],
};

function authorization(allowed: (input: Parameters<AuthorizationService['authorizeResource']>[0]) => boolean) {
  return {
    authorizeResource: jest.fn(async (input: Parameters<AuthorizationService['authorizeResource']>[0]) => ({
      allowed: allowed(input),
      reason: allowed(input) ? 'OU_ASSIGNMENT_ALLOWED' as const : 'NO_MATCHING_PERMISSION_SCOPE' as const,
    })),
  } as unknown as Pick<AuthorizationService, 'authorizeResource'> & {
    authorizeResource: jest.Mock;
  };
}

describe('announcement resource authorization', () => {
  it('requires a global resource decision for an audience without OU filters', async () => {
    const denied = authorization(() => false);
    const result = await authorizeAnnouncementAudiences({
      authorization: denied,
      principal,
      permissionKey: permissionKeys.announcementReportRead,
      permissionScope: noOuScope,
      candidates: [{ key: 'global-audience', organizationalUnitIds: [] }],
      unitPaths: new Map(),
    });
    expect(result.has('global-audience')).toBe(false);
    expect(denied.authorizeResource).toHaveBeenCalledTimes(1);
    expect(denied.authorizeResource).toHaveBeenCalledWith(expect.objectContaining({
      permissionKey: permissionKeys.announcementReportRead,
      organizationalUnitId: null,
      serviceId: null,
      allowOwner: false,
    }));
  });

  it('allows a truly global authorization decision without leaking audience IDs', async () => {
    const global = authorization((input) => input.organizationalUnitId === null && input.serviceId === null);
    const result = await authorizeAnnouncementAudiences({
      authorization: global,
      principal,
      permissionKey: permissionKeys.announcementManage,
      permissionScope: noOuScope,
      candidates: [
        { key: 'global-audience', organizationalUnitIds: [] },
        { key: 'multi-ou', organizationalUnitIds: ['ou-it', 'ou-hr'] },
      ],
      unitPaths: new Map(),
    });
    expect([...result]).toEqual(['global-audience', 'multi-ou']);
    expect(global.authorizeResource).toHaveBeenCalledTimes(1);
  });

  it('requires every audience OU to be authorized, not just one member OU', async () => {
    const scoped = authorization((input) => ['ou-it', 'ou-it-child'].includes(input.organizationalUnitId ?? ''));
    const result = await authorizeAnnouncementAudiences({
      authorization: scoped,
      principal,
      permissionKey: permissionKeys.announcementManage,
      permissionScope: itScope,
      candidates: [
        { key: 'it-only', organizationalUnitIds: ['ou-it', 'ou-it-child'] },
        { key: 'it-and-hr', organizationalUnitIds: ['ou-it', 'ou-hr'] },
        { key: 'unfiltered', organizationalUnitIds: [] },
      ],
      unitPaths: new Map([
        ['ou-it', '/root/IT'],
        ['ou-it-child', '/root/IT/Support'],
        ['ou-hr', '/root/HR'],
      ]),
    });

    expect([...result]).toEqual(['it-only']);
    expect(scoped.authorizeResource).toHaveBeenCalledTimes(3);
    expect(scoped.authorizeResource).toHaveBeenCalledWith(expect.objectContaining({
      permissionKey: permissionKeys.announcementManage,
      organizationalUnitId: 'ou-it-child',
      serviceId: null,
      allowOwner: false,
    }));
  });

  it('denies service-only grants when they cannot bound an announcement audience OU', async () => {
    const serviceGrantCannotAuthorize = authorization(() => false);
    const result = await authorizeAnnouncementAudiences({
      authorization: serviceGrantCannotAuthorize,
      principal,
      permissionKey: permissionKeys.announcementManage,
      permissionScope: noOuScope,
      candidates: [{ key: 'service-tagged', organizationalUnitIds: ['ou-it'] }],
      unitPaths: new Map([['ou-it', '/root/IT']]),
    });
    expect(result.has('service-tagged')).toBe(false);
    expect(serviceGrantCannotAuthorize.authorizeResource).toHaveBeenCalledTimes(1);
  });

  it('fails closed on unknown audience units and permits the separate agent OU policy only inside its path', async () => {
    const denied = authorization(() => false);
    const result = await authorizeAnnouncementAudiences({
      authorization: denied,
      principal,
      permissionKey: permissionKeys.announcementManage,
      permissionScope: noOuScope,
      candidates: [
        { key: 'unknown', organizationalUnitIds: ['missing'] },
        { key: 'agent-own', organizationalUnitIds: ['ou-it-child'] },
        { key: 'agent-foreign', organizationalUnitIds: ['ou-hr'] },
      ],
      unitPaths: new Map([
        ['ou-it-child', '/root/IT/Support'],
        ['ou-hr', '/root/HR'],
      ]),
      fallbackOrganizationalUnitPaths: ['/root/IT'],
    });

    expect([...result]).toEqual(['agent-own']);
  });

  it('requires a principal context', async () => {
    const auth = authorization(() => true);
    const result = await authorizeAnnouncementAudiences({
      authorization: auth,
      principal: null,
      permissionKey: permissionKeys.announcementManage,
      permissionScope: noOuScope,
      candidates: [{ key: 'announcement', organizationalUnitIds: ['ou-it'] }],
      unitPaths: new Map([['ou-it', '/root/IT']]),
    });
    expect(result.size).toBe(0);
    expect(auth.authorizeResource).not.toHaveBeenCalled();
  });
});
