import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { UsersService } from './users.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));
jest.mock('../notifications/email/smtp-mail-transport', () => ({
  SmtpMailTransport: class SmtpMailTransport {},
}));
jest.mock('../directory-sync/directory-sync.service', () => ({
  DirectorySyncService: class DirectorySyncService {},
}));

const assign = (
  overrides: Partial<AuthorizationContext['assignments'][number]> = {},
): AuthorizationContext['assignments'][number] => ({
  roleKey: 'ADMIN',
  permissionKeys: [permissionKeys.userManage],
  organizationalUnitId: null,
  organizationalUnitPath: null,
  serviceId: null,
  ...overrides,
});

function createService(input: {
  readonly context: AuthorizationContext | null;
  readonly units?: readonly { id: string; ouPath: string }[];
  readonly users?: readonly { id: string; organizationalUnitId: string | null }[];
}) {
  const unitFindMany = jest.fn().mockResolvedValue(input.units ?? []);
  const userFindMany = jest.fn().mockResolvedValue(input.users ?? []);
  const userCount = jest.fn().mockResolvedValue((input.users ?? []).length);
  const loader = { loadBySubjectId: jest.fn().mockResolvedValue(input.context) };
  const prisma = {
    organizationalUnit: { findMany: unitFindMany },
    user: { findMany: userFindMany, count: userCount },
  };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    loader as never,
  );
  return { service, unitFindMany, userFindMany, userCount, loader };
}

describe('UsersService.listSummaryPageForActor (W2.10)', () => {
  it('pushes the caller subtree into both the page and the total count', async () => {
    const { service, unitFindMany, userCount, loader } = createService({
      context: {
        subjectId: 'admin-1',
        isLocalOnly: true,
        isSuperAdmin: false,
        assignments: [assign({ organizationalUnitId: 'ou-a', organizationalUnitPath: 'OU=A' })],
      },
      units: [{ id: 'ou-a', ouPath: 'OU=A' }],
      users: [],
    });

    await service.listSummaryPageForActor('admin-1', { query: 'ana' });

    expect(loader.loadBySubjectId).toHaveBeenCalledWith('admin-1');
    expect(unitFindMany).toHaveBeenCalledWith({
      where: {
        OR: [{ ouPath: 'OU=A' }, { ouPath: { startsWith: 'OU=A/' } }],
      },
      select: { id: true },
    });
    // Same filter object reaches the rows and the count, so `X-Total-Count`
    // cannot advertise users the page hides.
    expect(userCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ organizationalUnitId: { in: ['ou-a'] } }),
    });
  });

  it('keeps the directory unrestricted for a global grant', async () => {
    const { service, unitFindMany, userCount } = createService({
      context: {
        subjectId: 'admin-1',
        isLocalOnly: true,
        isSuperAdmin: false,
        assignments: [assign()],
      },
    });

    await service.listSummaryPageForActor('admin-1');

    expect(unitFindMany).not.toHaveBeenCalled();
    expect(userCount).toHaveBeenCalledWith({ where: {} });
  });

  it('returns nothing when the caller controls no unit at all', async () => {
    const { service, userCount } = createService({
      context: {
        subjectId: 'admin-1',
        isLocalOnly: true,
        isSuperAdmin: false,
        assignments: [
          assign({ organizationalUnitId: null, organizationalUnitPath: null, serviceId: 'svc-1' }),
        ],
      },
    });

    await service.listSummaryPageForActor('admin-1');

    expect(userCount).toHaveBeenCalledWith({
      where: { organizationalUnitId: { in: [] } },
    });
  });

  it('fails closed when the service has no authorization loader at all', async () => {
    const userCount = jest.fn().mockResolvedValue(0);
    const service = new UsersService(
      { user: { findMany: jest.fn().mockResolvedValue([]), count: userCount } } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listSummaryPageForActor('admin-1');

    expect(userCount).toHaveBeenCalledWith({
      where: { organizationalUnitId: { in: [] } },
    });
  });

  it('treats a missing actor as "no scope", not as an unscoped read', async () => {
    const { service, userCount, loader } = createService({
      context: {
        subjectId: 'admin-1',
        isLocalOnly: true,
        isSuperAdmin: false,
        assignments: [assign()],
      },
    });

    await service.listSummaryPageForActor(null);

    expect(loader.loadBySubjectId).not.toHaveBeenCalled();
    expect(userCount).toHaveBeenCalledWith({
      where: { organizationalUnitId: { in: [] } },
    });
  });
});
