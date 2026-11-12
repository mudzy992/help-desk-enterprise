jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import type { AnnouncementViewer } from './announcement-viewer';
import { announcementErrorCodes } from './announcements.constants';
import { AnnouncementsService } from './announcements.service';

const globalViewer = {
  userId: 'actor-1',
  roleKeys: ['ADMIN'],
  groupIds: [],
  homeOrganizationalUnitId: null,
  authorizationPrincipal: {
    subjectId: 'actor-1',
    email: 'actor@example.invalid',
    displayName: 'Global manager',
    isLocalOnly: false,
  },
  manageScope: { global: true, organizationalUnits: [] },
  reportScope: { global: true, organizationalUnits: [] },
  canManageAll: true,
  canReadReports: true,
  isAgent: false,
} as unknown as AnnouncementViewer;

function setup() {
  const prisma = {
    organizationalUnit: {
      findMany: jest.fn(async () => [
        { id: 'ou-it', name: 'IT', ouPath: '/root/IT' },
        { id: 'ou-hr', name: 'HR', ouPath: '/root/HR' },
      ]),
    },
    group: { count: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter((id) => id === 'grp-1').length) },
    user: { count: jest.fn(async () => 7) },
  };
  const service = new AnnouncementsService(
    prisma as unknown as PrismaService,
    { getSetting: jest.fn(async () => true) } as never,
    {
      authorizeResource: jest.fn(async () => ({ allowed: true, reason: 'GLOBAL_PERMISSION' as const })),
    } as unknown as AuthorizationService,
  );
  return { service, prisma };
}

describe('BA-announcements-16 audience preview reference validation', () => {
  it('rejects an unknown organizational unit instead of silently counting a smaller audience', async () => {
    const { service, prisma } = setup();
    await expect(
      service.previewAudience({ roles: [], organizationalUnitIds: ['ou-missing'], groupIds: [] }, globalViewer),
    ).rejects.toMatchObject({ code: announcementErrorCodes.invalidAudience });
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('rejects an unknown group', async () => {
    const { service, prisma } = setup();
    await expect(
      service.previewAudience({ roles: [], organizationalUnitIds: [], groupIds: ['grp-missing'] }, globalViewer),
    ).rejects.toMatchObject({ code: announcementErrorCodes.invalidAudience });
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('counts a fully known audience', async () => {
    const { service } = setup();
    await expect(
      service.previewAudience({ roles: [], organizationalUnitIds: ['ou-it'], groupIds: ['grp-1'] }, globalViewer),
    ).resolves.toEqual({ count: 7 });
  });
});
