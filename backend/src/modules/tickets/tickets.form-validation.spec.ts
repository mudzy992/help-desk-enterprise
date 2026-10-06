import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const actor = { actorUserId: ticketsTestIds.requester };

describe('ticket form data validation', () => {
  it('rejects missing required and unknown fields on create', async () => {
    const { tickets } = createTicketsServiceHarness();

    await expect(
      tickets.create(vpnCreateInput({ formData: {} }), actor),
    ).rejects.toMatchObject({
      response: {
        code: 'FORM_DATA_INVALID',
        details: { fields: [{ fieldId: 'asset_tag', code: 'REQUIRED' }] },
      },
    });
    await expect(
      tickets.create(
        vpnCreateInput({ formData: { asset_tag: 'LPT-1', injected: 'value' } }),
        actor,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'FORM_DATA_INVALID',
        details: { fields: [{ fieldId: 'injected', code: 'INVALID' }] },
      },
    });
  });

  it('validates only the submitted update patch, merges it, and rejects cleared required fields', async () => {
    const { tickets, memory } = createTicketsServiceHarness();
    const extendedSchema = {
      schemaVersion: 1,
      fields: [
        {
          id: 'asset_tag',
          label: 'Asset tag',
          type: 'text',
          required: true,
          order: 0,
        },
        {
          id: 'owner',
          label: 'Owner',
          type: 'text',
          required: true,
          order: 1,
        },
      ],
    };
    await memory.prisma.formVersion.update({
      where: { id: ticketsTestIds.formVpnV1 },
      data: { schema: extendedSchema },
    });
    const created = await tickets.create(
      vpnCreateInput({ formData: { asset_tag: 'LPT-1', owner: 'Nadia' } }),
      actor,
    );

    const updated = await tickets.update(
      created.id,
      { formData: { asset_tag: 'LPT-2' } },
      actor,
    );
    expect(updated.formData).toEqual({ asset_tag: 'LPT-2', owner: 'Nadia' });

    await expect(
      tickets.update(created.id, { formData: { owner: null } }, actor),
    ).rejects.toMatchObject({
      response: {
        code: 'FORM_DATA_INVALID',
        details: { fields: [{ fieldId: 'owner', code: 'REQUIRED' }] },
      },
    });
    await expect(
      tickets.update(created.id, { formData: { unknown: 'value' } }, actor),
    ).rejects.toMatchObject({
      response: {
        code: 'FORM_DATA_INVALID',
        details: { fields: [{ fieldId: 'unknown', code: 'INVALID' }] },
      },
    });
  });
});
