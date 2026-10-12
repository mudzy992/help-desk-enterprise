import { AuditLogRepository } from './audit-log.repository';

/*
  Paket 5.4.0-f follow-up: the audit list showed the raw `actorUserId`. The
  display name is resolved in the repository with **one** query for the whole
  page — a 50-row page must not become 50 lookups, and an id with no user
  (deleted account, pseudonymous actor) simply maps to nothing.
*/
describe('AuditLogRepository.listActorDisplayNames', () => {
  function createRepository(users: readonly { id: string; displayName: string }[] = []) {
    const findMany = jest.fn().mockResolvedValue(users);
    const repository = new AuditLogRepository({ user: { findMany } } as never);
    return { repository, findMany };
  }

  it('resolves a whole page with one query and strips duplicate ids', async () => {
    const { repository, findMany } = createRepository([
      { id: 'user-1', displayName: 'Amra Hodžić' },
    ]);

    const names = await repository.listActorDisplayNames(['user-1', 'user-1', 'user-2']);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1', 'user-1', 'user-2'] } },
      select: { id: true, displayName: true },
    });
    expect(names.get('user-1')).toBe('Amra Hodžić');
    expect(names.has('user-2')).toBe(false);
  });

  it('never touches the database without ids', async () => {
    const { repository, findMany } = createRepository();
    await expect(repository.listActorDisplayNames([])).resolves.toEqual(new Map());
    expect(findMany).not.toHaveBeenCalled();
  });
});
