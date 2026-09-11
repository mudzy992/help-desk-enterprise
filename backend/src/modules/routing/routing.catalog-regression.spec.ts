import { createRoutingServiceHarness } from './create-routing-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('routing catalog regression', () => {
  it('does not change service lifecycle or availability when creating a rule', async () => {
    const { routing, memory } = createRoutingServiceHarness();
    const before = memory.getService('service-vpn');
    await routing.createRule({
      originUnitId: 'ou-root',
      serviceId: 'service-vpn',
      groupId: 'group-it',
    });
    expect(memory.getService('service-vpn')).toEqual(before);
    expect(before?.lifecycle).toBe('DRAFT');
    expect(before?.availability).toBe('OPERATIONAL');
  });
});
