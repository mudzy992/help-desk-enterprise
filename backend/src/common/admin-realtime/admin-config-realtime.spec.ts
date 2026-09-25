jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { broadcastAdminConfigUpdated } from '../../modules/websocket/broadcast-user-realtime';
import { AdminConfigChangeInterceptor } from './admin-config-change.interceptor';
import { AdminConfigRealtimeHub } from './admin-config-realtime.hub';
import { adminConfigDomainsMetadataKey } from './admin-config-domain.metadata';

function contextFor(method: string, domains: string[] | undefined) {
  class Controller {}
  const handler = () => undefined;
  if (domains) Reflect.defineMetadata(adminConfigDomainsMetadataKey, domains, Controller);
  return {
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
    getHandler: () => handler,
    getClass: () => Controller,
  } as never;
}

describe('admin config realtime (package 1.7 R1–R2)', () => {
  const prisma = { user: { findUnique: jest.fn(async () => ({ displayName: 'Emir H.' })) } };

  async function run(method: string, domains?: string[]) {
    const hub = new AdminConfigRealtimeHub();
    const events: unknown[] = [];
    hub.subscribe((payload) => events.push(payload));
    const interceptor = new AdminConfigChangeInterceptor(new Reflector(), hub, prisma as never);
    await lastValueFrom(interceptor.intercept(contextFor(method, domains), { handle: () => of('ok') }));
    await new Promise((resolve) => setImmediate(resolve));
    return events;
  }

  it('publishes one event per domain after a successful mutation', async () => {
    const events = await run('PATCH', ['routing', 'sla']);
    expect(events).toEqual([
      expect.objectContaining({ domain: 'routing', action: 'update' }),
      expect.objectContaining({ domain: 'sla', action: 'update' }),
    ]);
  });

  it('ignores reads and undecorated controllers', async () => {
    expect(await run('GET', ['routing'])).toEqual([]);
    expect(await run('POST')).toEqual([]);
  });

  it('emits only to the admin room; routing also as routing.rules.updated', () => {
    const emitted: [string, string][] = [];
    const server = { to: (room: string) => ({ emit: (name: string) => emitted.push([room, name]) }) };
    const payload = { action: 'create', actorUserId: 'u', actorName: null, occurredAt: 'x' } as const;
    broadcastAdminConfigUpdated(server as never, { ...payload, domain: 'routing' });
    broadcastAdminConfigUpdated(server as never, { ...payload, domain: 'groups' });
    expect(emitted).toEqual([
      ['role:admins', 'admin.config.updated'],
      ['role:admins', 'routing.rules.updated'],
      ['role:admins', 'admin.config.updated'],
    ]);
  });
});
