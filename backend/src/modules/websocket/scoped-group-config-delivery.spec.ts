import { createTestAssignment, createTestAuthorizationContext } from '../authorization/create-test-authorization-context';
import { permissionKeys } from '../authorization/authorization.constants';
import { deliverScopedGroupConfig } from './scoped-group-config-delivery';

const principal = (subjectId: string) => ({ subjectId, jti: subjectId, sessionId: null, issuedAt: 1, expiresAt: 9999999999, authzVersion: 1 });
function socket(id: string, rooms: string[] = []) {
  return { data: { principal: principal(id) }, connected: true, rooms: new Set(rooms), emit: jest.fn() };
}
function context(id: string, path: string, permissions: string[] = [permissionKeys.groupManage], serviceId: string | null = null) {
  return createTestAuthorizationContext({ subjectId: id, assignments: [createTestAssignment({ roleKey: 'ADMIN', permissionKeys: permissions, organizationalUnitId: 'ou-a', organizationalUnitPath: path, serviceId })] });
}

describe('scoped group config delivery', () => {
  it('checks current session and authoritative OU access, sends only neutral event to eligible local sockets', async () => {
    const a = socket('a'); const b = socket('b'); const noPermission = socket('no-permission');
    const serviceScoped = socket('service'); const revoked = socket('revoked'); const global = socket('global', ['role:admins']);
    const contexts = new Map([
      ['a', context('a', '/A')], ['b', context('b', '/B')],
      ['no-permission', context('no-permission', '/A', [])], ['service', context('service', '/A', [permissionKeys.groupManage], 'svc')],
      ['revoked', context('revoked', '/A')], ['global', context('global', '/A')],
    ]);
    await deliverScopedGroupConfig([a, b, noPermission, serviceScoped, revoked, global] as never, 'unit', {
      loadUnit: async () => ({ id: 'unit', ouPath: '/A/Team' }),
      isSessionCurrent: async (p) => p.subjectId !== 'revoked',
      loadContext: async (id) => contexts.get(id) ?? null,
    });
    expect(a.emit).toHaveBeenCalledWith('admin.config.updated', { domain: 'groups' });
    for (const denied of [b, noPermission, serviceScoped, revoked, global]) expect(denied.emit).not.toHaveBeenCalled();
  });

  it('does not emit if a socket disconnects while authorization is pending', async () => {
    const client = socket('a');
    let finish!: (value: ReturnType<typeof context>) => void;
    const pending = new Promise<ReturnType<typeof context>>((resolve) => { finish = resolve; });
    const loading = jest.fn(() => pending);
    const delivery = deliverScopedGroupConfig([client] as never, 'unit', {
      loadUnit: async () => ({ id: 'unit', ouPath: '/A' }),
      isSessionCurrent: async () => true,
      loadContext: loading,
    });
    while (loading.mock.calls.length === 0) await Promise.resolve();
    client.connected = false;
    finish(context('a', '/A'));
    await delivery;
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('fails closed on missing unit, failed authorization and disconnected sockets', async () => {
    const a = socket('a'); const disconnected = socket('disconnected'); disconnected.connected = false;
    const base = { loadUnit: async () => ({ id: 'unit', ouPath: '/A' }), isSessionCurrent: async () => true, loadContext: async () => context('a', '/A') };
    await deliverScopedGroupConfig([a] as never, 'unit', { ...base, loadUnit: async () => null });
    await deliverScopedGroupConfig([a] as never, 'unit', { ...base, loadContext: async () => { throw new Error('db unavailable'); } });
    await deliverScopedGroupConfig([disconnected] as never, 'unit', base);
    expect(a.emit).not.toHaveBeenCalled(); expect(disconnected.emit).not.toHaveBeenCalled();
  });
});
