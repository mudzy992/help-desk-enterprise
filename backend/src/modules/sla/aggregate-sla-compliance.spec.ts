import {
  aggregateSlaCompliance,
  resolveSlaComplianceWindow,
} from './aggregate-sla-compliance';
import type { SlaComplianceTicketRow } from './sla-compliance.types';

const window = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T23:59:59.000Z'),
};

const profiles = [
  { id: 'profile-a', key: 'INCIDENT', name: 'Incident' },
  { id: 'profile-b', key: 'ACCESS', name: 'Access' },
  { id: 'profile-c', key: 'HR', name: 'HR' },
] as const;

describe('aggregateSlaCompliance', () => {
  it('computes response and resolution compliance percent per profile', () => {
    const actual = aggregateSlaCompliance({
      window,
      profiles,
      openBreached: { response: 0, resolution: 0 },
      rows: [
        // Profile A: 4 tickets → response 75% (1/4 breached), resolution 50% (2/4 breached)
        row('profile-a', false, false, '2026-09-10T10:00:00.000Z'),
        row('profile-a', false, true, '2026-09-11T10:00:00.000Z'),
        row('profile-a', true, true, '2026-09-12T10:00:00.000Z'),
        row('profile-a', false, false, '2026-09-13T10:00:00.000Z'),
        // Profile B: 2 tickets, none breached → 100%/100%
        row('profile-b', false, false, '2026-09-15T10:00:00.000Z'),
        row('profile-b', false, false, '2026-09-16T10:00:00.000Z'),
        // Outside window — ignored
        row('profile-a', true, true, '2026-08-01T10:00:00.000Z'),
      ],
    });
    expect(actual.window).toEqual({
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    });
    expect(actual.profiles).toEqual([
      {
        slaProfileId: 'profile-b',
        profileKey: 'ACCESS',
        profileName: 'Access',
        sampleCount: 2,
        responseCompliancePercent: 100,
        resolutionCompliancePercent: 100,
      },
      {
        slaProfileId: 'profile-c',
        profileKey: 'HR',
        profileName: 'HR',
        sampleCount: 0,
        responseCompliancePercent: null,
        resolutionCompliancePercent: null,
      },
      {
        slaProfileId: 'profile-a',
        profileKey: 'INCIDENT',
        profileName: 'Incident',
        sampleCount: 4,
        responseCompliancePercent: 75,
        resolutionCompliancePercent: 50,
      },
    ]);
  });

  it('breaks terminal compliance down by OU, service and group and reports open breaches', () => {
    const actual = aggregateSlaCompliance({
      window,
      profiles,
      openBreached: { response: 2, resolution: 3 },
      rows: [
        row('profile-a', false, false, '2026-09-10T10:00:00.000Z', {
          originUnitId: 'ou-1',
          originUnitName: 'OU One',
          serviceId: 'svc-1',
          serviceName: 'Service One',
          assignedGroupId: 'g-1',
          assignedGroupName: 'Group One',
        }),
        row('profile-a', true, false, '2026-09-11T10:00:00.000Z', {
          originUnitId: 'ou-1',
          originUnitName: 'OU One',
          serviceId: 'svc-2',
          serviceName: 'Service Two',
          assignedGroupId: 'g-2',
          assignedGroupName: 'Group Two',
        }),
        row('profile-b', false, true, '2026-09-12T10:00:00.000Z', {
          originUnitId: 'ou-2',
          originUnitName: 'OU Two',
          serviceId: 'svc-1',
          serviceName: 'Service One',
          assignedGroupId: null,
          assignedGroupName: null,
        }),
        row('profile-b', false, false, '2026-09-13T10:00:00.000Z', {
          originUnitId: 'ou-2',
          originUnitName: 'OU Two',
          serviceId: 'svc-1',
          serviceName: 'Service One',
          assignedGroupId: 'g-2',
          assignedGroupName: 'Group Two',
        }),
        // An in-flight row never enters completed-ticket compliance.
        row('profile-a', true, true, '2026-09-14T10:00:00.000Z', {
          status: 'IN_PROGRESS',
          originUnitId: 'ou-3',
          originUnitName: 'OU Three',
          serviceId: 'svc-3',
          serviceName: 'Service Three',
          assignedGroupId: 'g-3',
          assignedGroupName: 'Group Three',
        }),
      ],
    });

    expect(actual.byUnit).toEqual([
      expect.objectContaining({
        slaProfileId: 'profile-b',
        dimensionId: 'ou-2',
        dimensionName: 'OU Two',
        sampleCount: 2,
        responseCompliancePercent: 100,
        resolutionCompliancePercent: 50,
      }),
      expect.objectContaining({
        slaProfileId: 'profile-a',
        dimensionId: 'ou-1',
        dimensionName: 'OU One',
        sampleCount: 2,
        responseCompliancePercent: 50,
        resolutionCompliancePercent: 100,
      }),
    ]);
    expect(actual.byService).toContainEqual(
      expect.objectContaining({
        slaProfileId: 'profile-b',
        dimensionId: 'svc-1',
        sampleCount: 2,
        responseCompliancePercent: 100,
        resolutionCompliancePercent: 50,
      }),
    );
    expect(actual.byGroup).toContainEqual(
      expect.objectContaining({
        slaProfileId: 'profile-b',
        dimensionId: null,
        dimensionName: null,
        sampleCount: 1,
        responseCompliancePercent: 100,
        resolutionCompliancePercent: 0,
      }),
    );
    expect(actual.byUnit.some((row) => row.dimensionId === 'ou-3')).toBe(false);
    expect(actual.openBreached).toEqual({ response: 2, resolution: 3 });
  });
});

describe('resolveSlaComplianceWindow', () => {
  it('defaults to a 30-day rolling window ending at now', () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    const actual = resolveSlaComplianceWindow({ now });
    expect(actual.to).toEqual(now);
    expect(actual.from).toEqual(new Date('2026-08-18T12:00:00.000Z'));
  });
});

function row(
  slaProfileId: string,
  isResponseBreached: boolean,
  isResolutionBreached: boolean,
  completionAt: string,
  overrides: Partial<SlaComplianceTicketRow> = {},
): SlaComplianceTicketRow {
  return {
    slaProfileId,
    isResponseBreached,
    isResolutionBreached,
    completionAt: new Date(completionAt),
    status: 'CLOSED',
    originUnitId: 'ou-default',
    originUnitName: 'Default unit',
    serviceId: 'svc-default',
    serviceName: 'Default service',
    assignedGroupId: 'g-default',
    assignedGroupName: 'Default group',
    ...overrides,
  };
}
