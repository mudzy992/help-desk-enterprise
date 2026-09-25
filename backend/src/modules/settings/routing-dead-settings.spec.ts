import { ticketRoutingSettings } from './definitions/ticket-routing-settings';
import { settingKeys } from './setting-keys';

describe('routing dead settings housekeeping', () => {
  const registeredKeys = Object.values(settingKeys);

  it('does not register private.ticket.routing.fallbackGroupId', () => {
    expect(registeredKeys).not.toContain(
      'private.ticket.routing.fallbackGroupId',
    );
    expect(
      ticketRoutingSettings.some(
        (definition) =>
          definition.key === 'private.ticket.routing.fallbackGroupId',
      ),
    ).toBe(false);
  });

  it('does not register private.routing.strictOuIsolation', () => {
    expect(registeredKeys).not.toContain('private.routing.strictOuIsolation');
  });

  it('keeps only live ticket routing settings', () => {
    expect(ticketRoutingSettings.map((definition) => definition.key)).toEqual([
      settingKeys.privateTicketUnroutedQueueEnabled,
      settingKeys.privateTicketUnroutedQueueOwnerRole,
      // Package 1.7 (U1/U2): live — read at ticket create and by the sweep.
      settingKeys.privateTicketUnroutedQueueTargetGroupId,
      settingKeys.privateTicketUnroutedQueueCleanupSlaHours,
      settingKeys.privateTicketUnroutedQueueWeeklyDigest,
      settingKeys.privateTicketRoutingRequireCoverage,
    ]);
  });
});
