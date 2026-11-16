import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { createTestAssignment, createTestAuthorizationContext } from '../authorization/create-test-authorization-context';
import { permissionKeys } from '../authorization/authorization.constants';
import { GroupScopeRealtimeHub } from '../../common/admin-realtime/group-scope-realtime.hub';
import { startScopedGroupConfigDispatcher } from './scoped-group-config-dispatcher';

describe('scoped group invalidation with real Socket.IO clients', () => {
  it('delivers only to the socket authorized for the changed OU', async () => {
    const http = createServer();
    const server = new Server(http, { transports: ['websocket'] });
    const clients: ClientSocket[] = [];
    try {
      server.on('connection', (socket) => {
        const id = String(socket.handshake.auth.user);
        socket.data.principal = { subjectId: id, jti: id, sessionId: null, issuedAt: 1, expiresAt: 9999999999, authzVersion: 1 };
        socket.emit('ready');
      });
      await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
      const port = (http.address() as AddressInfo).port;
      const connect = async (user: string) => {
        const client = io(`http://127.0.0.1:${port}`, { autoConnect: false, reconnection: false, transports: ['websocket'], auth: { user } });
        clients.push(client);
        const ready = new Promise<void>((resolve) => client.once('ready', resolve));
        client.connect(); await ready; return client;
      };
      const a = await connect('a'); const b = await connect('b');
      const seenA: unknown[] = []; const seenB: unknown[] = [];
      a.on('admin.config.updated', (event: unknown) => seenA.push(event));
      b.on('admin.config.updated', (event: unknown) => seenB.push(event));
      const hub = new GroupScopeRealtimeHub();
      const stop = startScopedGroupConfigDispatcher(server, hub, {
        loadUnit: async () => ({ id: 'unit', ouPath: '/A/Team' }),
        isSessionCurrent: async () => true,
        loadContext: async (id) => createTestAuthorizationContext({ subjectId: id, assignments: [createTestAssignment({ roleKey: 'ADMIN', permissionKeys: [permissionKeys.groupManage], organizationalUnitId: id, organizationalUnitPath: id === 'a' ? '/A' : '/B' })] }),
      }, () => undefined);
      try {
        const received = new Promise<void>((resolve) => a.once('admin.config.updated', () => resolve()));
        hub.publish({ organizationalUnitId: 'unit' });
        await received;
        const barriers = [a, b].map((client) => new Promise<void>((resolve) => client.once('barrier', resolve)));
        server.emit('barrier'); await Promise.all(barriers);
        expect(seenA).toEqual([{ domain: 'groups' }]); expect(seenB).toEqual([]);
      } finally { stop(); }
    } finally {
      clients.forEach((client) => client.disconnect());
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10_000);
});
