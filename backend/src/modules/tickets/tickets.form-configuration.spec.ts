import { defaultServiceFormsConfiguration } from '../service-catalog/service-forms.constants';
import type { ServiceFormsConfiguration } from '../service-catalog/service-forms.types';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const actor = { actorUserId: ticketsTestIds.requester };

function formsConfiguration(
  overrides: Partial<ServiceFormsConfiguration>,
): ServiceFormsConfiguration {
  return { ...defaultServiceFormsConfiguration, ...overrides };
}

describe('ticket creation and service forms configuration', () => {
  it('creates an unbound ticket when forms are disabled, even if the client supplied a version', async () => {
    const { tickets } = createTicketsServiceHarness(
      formsConfiguration({ enabled: false }),
    );
    const created = await tickets.create(
      vpnCreateInput({
        formVersionRef: ticketsTestIds.formVpnV1,
        formData: {},
      }),
      actor,
    );

    expect(created.formVersionRef).toBeNull();
    expect(created.formData).toEqual({});
  });

  it('creates an unbound ticket when forms are enabled but the version is optional and none is active', async () => {
    const { tickets, memory } = createTicketsServiceHarness(
      formsConfiguration({ requireVersionOnTicket: false }),
    );
    await memory.prisma.formVersion.update({
      where: { id: ticketsTestIds.formVpnV1 },
      data: { status: 'RETIRED' },
    });

    const created = await tickets.create(vpnCreateInput({ formData: {} }), actor);
    expect(created.formVersionRef).toBeNull();
  });

  it('preserves the required-version error when no form version is active', async () => {
    const { tickets, memory } = createTicketsServiceHarness(
      formsConfiguration({ requireVersionOnTicket: true }),
    );
    await memory.prisma.formVersion.update({
      where: { id: ticketsTestIds.formVpnV1 },
      data: { status: 'RETIRED' },
    });

    await expect(
      tickets.create(vpnCreateInput({ formData: {} }), actor),
    ).rejects.toMatchObject({
      response: { code: 'FORM_VERSION_REQUIRED' },
    });
  });
});
