import { deleteOrganizationalUnit } from './delete-organizational-unit';
import { OrganizationalUnitsService } from './organizational-units.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('./delete-organizational-unit', () => ({
  deleteOrganizationalUnit: jest.fn(),
}));

describe('OrganizationalUnitsService.delete', () => {
  beforeEach(() => jest.mocked(deleteOrganizationalUnit).mockReset());

  it('returns role-removal warnings and invalidates all affected principals', async () => {
    jest.mocked(deleteOrganizationalUnit).mockResolvedValue({
      warnings: [{ code: 'ROLE_ASSIGNMENTS_REMOVED', count: 2 }],
      affectedUserIds: ['user-1', 'user-2'],
    });
    const invalidateUsers = jest.fn().mockResolvedValue(undefined);
    const service = new OrganizationalUnitsService(
      {} as never,
      { invalidateUsers } as never,
    );
    const response = await service.delete('ou-1', {
      actorUserId: 'admin-1',
      requestId: 'req-1',
    });
    expect(response).toEqual({ warnings: [{ code: 'ROLE_ASSIGNMENTS_REMOVED', count: 2 }] });
    expect(invalidateUsers).toHaveBeenCalledWith(['user-1', 'user-2']);
    expect(deleteOrganizationalUnit).toHaveBeenCalledWith(
      expect.anything(),
      'ou-1',
      { actorUserId: 'admin-1', requestId: 'req-1' },
    );
  });

  it('keeps a committed deletion successful if cache invalidation fails', async () => {
    jest.mocked(deleteOrganizationalUnit).mockResolvedValue({
      warnings: [],
      affectedUserIds: ['user-1'],
    });
    const service = new OrganizationalUnitsService(
      {} as never,
      { invalidateUsers: jest.fn().mockRejectedValue(new Error('redis unavailable')) } as never,
    );
    await expect(service.delete('ou-1')).resolves.toEqual({ warnings: [] });
  });
});
