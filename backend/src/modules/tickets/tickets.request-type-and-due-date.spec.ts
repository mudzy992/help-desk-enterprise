import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';
import { normalizeTicketRequestType } from './normalize-ticket-request-type';
import { parseTicketDueAt } from './parse-ticket-due-at';
import { TicketsError } from './tickets.error';
import { vpnCreateInput } from './vpn-create-input';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * M8 #3 (val 5): RAW asks for `service -> request type -> due date`. The ticket
 * had neither an explicit request type nor a writable deadline (`dueAt` sat in
 * the schema and was never written), so both are covered here: normalisation,
 * create, update, clearing and what the change log sees.
 */
describe('ticket request type and requested deadline (M8 #3)', () => {
  const actor = { actorUserId: ticketsTestIds.requester };
  const future = new Date(Date.now() + 3 * 86_400_000);

  it('normalises the request type and refuses blank or over-long values', () => {
    expect(normalizeTicketRequestType('  VPN   ne radi  ')).toBe('VPN ne radi');
    expect(() => normalizeTicketRequestType('   ')).toThrow(TicketsError);
    expect(() => normalizeTicketRequestType('x'.repeat(81))).toThrow(
      TicketsError,
    );
    expect(normalizeTicketRequestType('x'.repeat(80))).toHaveLength(80);
  });

  it('parses the requested deadline and refuses a past one', () => {
    const now = new Date('2026-10-05T10:00:00.000Z');
    expect(parseTicketDueAt(null, now)).toBeNull();
    expect(parseTicketDueAt('   ', now)).toBeNull();
    expect(parseTicketDueAt('2026-10-08T10:00:00.000Z', now)?.toISOString()).toBe(
      '2026-10-08T10:00:00.000Z',
    );
    // One minute of slack absorbs client/server clock skew.
    expect(
      parseTicketDueAt('2026-10-05T09:59:30.000Z', now)?.toISOString(),
    ).toBe('2026-10-05T09:59:30.000Z');
    expect(() => parseTicketDueAt('2026-10-04T10:00:00.000Z', now)).toThrow(
      TicketsError,
    );
    expect(() => parseTicketDueAt('not-a-date', now)).toThrow(TicketsError);
  });

  it('creates a ticket with both fields and returns them', async () => {
    const { tickets } = createTicketsServiceHarness();

    const created = await tickets.create(
      vpnCreateInput({
        requestType: '  VPN   pristup  ',
        dueAt: future.toISOString(),
      }),
      actor,
    );

    expect(created.requestType).toBe('VPN pristup');
    expect(created.dueAt).toBe(future.toISOString());
    const loaded = await tickets.getById(created.id, actor);
    expect(loaded.requestType).toBe('VPN pristup');
  });

  it('leaves both fields empty when the request does not set them', async () => {
    const { tickets } = createTicketsServiceHarness();

    const created = await tickets.create(vpnCreateInput(), actor);

    expect(created.requestType).toBeNull();
    expect(created.dueAt).toBeNull();
  });

  it('updates both fields and can clear them again', async () => {
    const { tickets } = createTicketsServiceHarness();
    const created = await tickets.create(vpnCreateInput(), actor);

    const updated = await tickets.update(
      created.id,
      { requestType: 'Nova oprema', dueAt: future.toISOString() },
      actor,
    );
    expect(updated.requestType).toBe('Nova oprema');
    expect(updated.dueAt).toBe(future.toISOString());

    const cleared = await tickets.update(
      created.id,
      { requestType: null, dueAt: null },
      actor,
    );
    expect(cleared.requestType).toBeNull();
    expect(cleared.dueAt).toBeNull();
  });

  it('keeps an untouched request type on an unrelated edit', async () => {
    const { tickets } = createTicketsServiceHarness();
    const created = await tickets.create(
      vpnCreateInput({ requestType: 'VPN pristup' }),
      actor,
    );

    const renamed = await tickets.update(created.id, { title: 'Novi naslov' }, actor);

    expect(renamed.requestType).toBe('VPN pristup');
  });
});
