import {
  activeScheduleFilterKeys,
  schedulePackFilters,
  unsupportedScheduleFilterKeys,
} from './schedule-pack-filters';
import { reportPackKeys } from '../reports.constants';

/**
 * W7.54 (BA-reports-02): the schedule slice must reach every attachment, and a
 * pack that cannot apply it must be refused instead of silently widened.
 */
describe('schedule pack filters', () => {
  it('maps the schedule scope to the pack slice', () => {
    expect(
      schedulePackFilters({ serviceId: 'svc-vpn', groupId: null, priority: 'HIGH' }),
    ).toEqual({ serviceId: 'svc-vpn', priority: 'HIGH' });
    expect(
      schedulePackFilters({ serviceId: null, groupId: null, priority: null }),
    ).toEqual({});
  });

  it('lists only the dimensions that are actually set', () => {
    expect(activeScheduleFilterKeys({ priority: 'LOW' })).toEqual(['priority']);
    expect(activeScheduleFilterKeys({})).toEqual([]);
  });

  it('accepts the slice on packs that own those dimensions', () => {
    const filters = { serviceId: 'svc-vpn', groupId: 'grp-1', priority: 'LOW' } as const;
    for (const pack of [
      reportPackKeys.monthlyKpi,
      reportPackKeys.overdueByService,
      reportPackKeys.topCloseCodes,
      reportPackKeys.forwardPingPong,
      reportPackKeys.timeTracking,
      reportPackKeys.problemTop,
      reportPackKeys.problemBacklog,
    ]) {
      expect(unsupportedScheduleFilterKeys(pack, filters)).toEqual([]);
    }
    expect(
      unsupportedScheduleFilterKeys(reportPackKeys.kbHelpfulness, { serviceId: 'svc-vpn' }),
    ).toEqual([]);
  });

  it('refuses a slice the pack cannot apply', () => {
    expect(
      unsupportedScheduleFilterKeys(reportPackKeys.kbHelpfulness, {
        serviceId: 'svc-vpn',
        groupId: 'grp-1',
      }),
    ).toEqual(['groupId']);
    for (const pack of [
      reportPackKeys.assetInventory,
      reportPackKeys.assetTopTickets,
      reportPackKeys.changeOutcomes,
      reportPackKeys.changeSchedule,
    ]) {
      expect(
        unsupportedScheduleFilterKeys(pack, { serviceId: 'svc-vpn', priority: 'HIGH' }),
      ).toEqual(['serviceId', 'priority']);
    }
  });
});
