import { ConflictException } from '@nestjs/common';
import { createRoutingServiceHarness } from './create-routing-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('RoutingService rules', () => {
  it('creates a routing rule for origin unit + service → group', async () => {
    const { routing } = createRoutingServiceHarness();
    const created = await routing.createRule({
      originUnitId: 'ou-leaf',
      serviceId: 'service-vpn',
      groupId: 'group-it',
    });
    expect(created.originUnitId).toBe('ou-leaf');
    expect(created.serviceId).toBe('service-vpn');
    expect(created.groupId).toBe('group-it');
    expect(created.originUnitPath).toBe('/Korisnici/Direkcija/IT');
    expect(created.groupName).toBe('IT Support');
  });

  it('rejects a duplicate origin unit + service rule', async () => {
    const { routing } = createRoutingServiceHarness();
    await routing.createRule({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
      groupId: 'group-it',
    });
    await expect(
      routing.createRule({
        originUnitId: 'ou-root',
        serviceId: 'service-vpn',
        groupId: 'group-it',
      }),
    ).rejects.toMatchObject({
      response: { code: 'DUPLICATE_RULE' },
    });
    await expect(
      routing.createRule({
        originUnitId: 'ou-root',
        serviceId: 'service-vpn',
        groupId: 'group-it',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects invalid origin unit, service, and target group', async () => {
    const { routing } = createRoutingServiceHarness();
    await expect(
      routing.createRule({
        originUnitId: 'missing-ou',
        serviceId: 'service-vpn',
        groupId: 'group-it',
      }),
    ).rejects.toMatchObject({ response: { code: 'ORIGIN_UNIT_NOT_FOUND' } });
    await expect(
      routing.createRule({
        originUnitId: 'ou-root',
        serviceId: 'missing-service',
        groupId: 'group-it',
      }),
    ).rejects.toMatchObject({ response: { code: 'SERVICE_NOT_FOUND' } });
    await expect(
      routing.createRule({
        originUnitId: 'ou-root',
        serviceId: 'service-vpn',
        groupId: 'missing-group',
      }),
    ).rejects.toMatchObject({ response: { code: 'GROUP_NOT_FOUND' } });
  });
});
