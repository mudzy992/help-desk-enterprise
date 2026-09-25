import { createEmailChannelTestConfiguration } from './email-channel-test-configuration';
import { fanOutEmailNotifications } from './fan-out-email-notifications';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import { notificationTypes } from '../notifications.constants';

jest.mock('../fan-out/resolve-notification-recipients', () => ({
  resolveNotificationRecipients: jest.fn(async () => ['user-1']),
}));

describe('SLA escalation email gate', () => {
  it('skips email when slaEscalationEmailEnabled is false', async () => {
    const handle = jest.fn();
    await fanOutEmailNotifications(
      {
        ticket: {
          findUnique: async () => ({
            id: 't1',
            ticketNumber: 'HD-1',
            title: 'x',
            status: 'ASSIGNED',
            priority: 'HIGH',
            serviceId: 'svc-1',
            assignedGroupId: null,
            isConfidential: false,
          }),
        },
        service: { findUnique: async () => ({ name: 'VPN' }) },
        group: { findUnique: async () => null },
        user: {
          findMany: async () => [
            { id: 'user-1', email: 'a@epbih.ba', displayName: 'A', preferredLocale: null },
          ],
        },
      } as never,
      enabledConfiguration({ slaEscalationEmailEnabled: false }),
      { send: async () => undefined },
      {
        id: 'msg-1',
        ticketId: 't1',
        type: 'SYSTEM_EVENT',
        body: ticketSystemEventActions.slaResponseEscalated,
        authorUserId: null,
      } as never,
      { handle },
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('dispatches email when slaEscalationEmailEnabled is true', async () => {
    const handle = jest.fn();
    await fanOutEmailNotifications(
      {
        ticket: {
          findUnique: async () => ({
            id: 't1',
            ticketNumber: 'HD-1',
            title: 'x',
            status: 'ASSIGNED',
            priority: 'HIGH',
            serviceId: 'svc-1',
            assignedGroupId: null,
            isConfidential: false,
          }),
        },
        service: { findUnique: async () => ({ name: 'VPN' }) },
        group: { findUnique: async () => null },
        user: {
          findMany: async () => [
            { id: 'user-1', email: 'a@epbih.ba', displayName: 'A', preferredLocale: null },
          ],
        },
      } as never,
      enabledConfiguration({ slaEscalationEmailEnabled: true }),
      { send: async () => undefined },
      {
        id: 'msg-2',
        ticketId: 't1',
        type: 'SYSTEM_EVENT',
        body: `${ticketSystemEventActions.slaResponseEscalated}:rule-1`,
        authorUserId: null,
      } as never,
      { handle },
    );
    expect(handle).toHaveBeenCalled();
    expect(handle.mock.calls[0]?.[0].templateKey).toBe(notificationTypes.ticketSla);
  });
});

function enabledConfiguration(
  overrides: Partial<EmailChannelConfiguration> = {},
): EmailChannelConfiguration {
  return createEmailChannelTestConfiguration(overrides);
}
