import { UsersService } from './users.service';
import { assignUserRole } from './assign-user-role';
import { deleteUser } from './delete-user';
import { removeUserRole } from './remove-user-role';
import { updateUser } from './update-user';

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
jest.mock('./assign-user-role', () => ({ assignUserRole: jest.fn() }));
jest.mock('./remove-user-role', () => ({ removeUserRole: jest.fn() }));
jest.mock('./delete-user', () => ({ deleteUser: jest.fn() }));
jest.mock('./update-user', () => ({ updateUser: jest.fn() }));
jest.mock('./list-users-summary', () => ({ listUsersSummary: jest.fn() }));

const mockedAssignRole = jest.mocked(assignUserRole);
const mockedRemoveRole = jest.mocked(removeUserRole);
const mockedDeleteUser = jest.mocked(deleteUser);
const mockedUpdateUser = jest.mocked(updateUser);

/**
 * Phase 2.2 (plan §2.2): the service is the place where a mutation is wired to
 * the invalidation hook. These tests lock that wiring — the user-facing
 * behaviour of the mutations themselves is covered where they are implemented.
 */
describe('UsersService authorization cache invalidation', () => {
  const invalidateUser = jest.fn().mockResolvedValue(1);

  function createService(): UsersService {
    return new UsersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { invalidateUser } as never,
    );
  }

  beforeEach(() => {
    invalidateUser.mockClear();
    mockedAssignRole.mockReset().mockResolvedValue({} as never);
    mockedRemoveRole.mockReset().mockResolvedValue(undefined);
    mockedDeleteUser.mockReset().mockResolvedValue(undefined);
    mockedUpdateUser.mockReset().mockResolvedValue({} as never);
  });

  it('passes the hook to updateUser and invalidates the edited user', async () => {
    await createService().update({ userId: 'user-1', displayName: 'Novo ime' });
    const hook = mockedUpdateUser.mock.calls[0][2];
    expect(hook).toBeDefined();
    await hook?.('user-1');
    expect(invalidateUser).toHaveBeenCalledWith('user-1');
  });

  it('passes the hook to assignUserRole', async () => {
    await createService().assignRole({
      userId: 'user-2',
      roleKey: 'AGENT',
      organizationalUnitId: null,
      serviceId: null,
      actorIsSuperAdmin: false,
      actorUserId: 'admin-1',
      requestId: 'request-1',
    });
    const hook = mockedAssignRole.mock.calls[0][2];
    await hook?.('user-2');
    expect(invalidateUser).toHaveBeenCalledWith('user-2');
  });

  it('passes the hook to removeUserRole', async () => {
    await createService().removeRole({
      userId: 'user-3',
      userRoleId: 'ur-1',
      actorUserId: 'admin-1',
      requestId: 'request-1',
    });
    const hook = mockedRemoveRole.mock.calls[0][2];
    await hook?.('user-3');
    expect(invalidateUser).toHaveBeenCalledWith('user-3');
  });

  it('passes the hook to deleteUser so a deleted user stops being served', async () => {
    await createService().delete('user-5');
    const hook = mockedDeleteUser.mock.calls[0][2];
    await hook?.('user-5');
    expect(invalidateUser).toHaveBeenCalledWith('user-5');
  });

  it('stays silent (no crash) when no invalidator is wired', async () => {
    const service = new UsersService({} as never, {} as never, {} as never, {} as never);
    await service.update({ userId: 'user-4', displayName: 'Bez keša' });
    const hook = mockedUpdateUser.mock.calls[0][2];
    await expect(hook?.('user-4')).resolves.toBeNull();
    expect(invalidateUser).not.toHaveBeenCalled();
  });
});
