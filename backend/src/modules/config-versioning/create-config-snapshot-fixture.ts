import { configSnapshotSchemaVersion } from './config-versioning.constants';
import { configVersioningScopes } from './config-versioning.constants';
import type { ConfigSnapshot } from './config-versioning.types';

export function createConfigSnapshotFixture(
  overrides: Partial<ConfigSnapshot> = {},
): ConfigSnapshot {
  return {
    schemaVersion: configSnapshotSchemaVersion,
    capturedAt: '2026-09-14T08:00:00.000Z',
    scopes: [...Object.values(configVersioningScopes)],
    rollbackOfVersion: null,
    settings: {
      'private.ticket.unroutedQueue.enabled': true,
    },
    routing: {
      configuration: {
        unroutedQueueEnabled: true,
        unroutedQueueOwnerRole: 'SUPER_ADMIN',
      },
      rules: [
        {
          id: 'rule-1',
          originUnitId: 'ou-root',
          serviceId: 'service-vpn',
          groupId: 'group-it',
        },
      ],
    },
    sla: {
      calendars: [
        {
          id: 'cal-1',
          key: 'BH_STANDARD',
          name: 'BH Standard',
          timezone: 'Europe/Sarajevo',
          weeklyHours: {
            '1': [{ start: '08:00', end: '16:00' }],
          },
          isActive: true,
          holidays: [],
        },
      ],
      profiles: [
        {
          id: 'profile-1',
          key: 'INCIDENT',
          name: 'Incident',
          description: null,
          calendarId: 'cal-1',
          isActive: true,
        },
      ],
      rules: [
        slaRule('LOW'),
        slaRule('MEDIUM'),
        slaRule('HIGH'),
        slaRule('CRITICAL'),
      ],
      escalations: [],
      priorityMatrix: [
        matrix('LOW', 'LOW', 'LOW'),
        matrix('LOW', 'MEDIUM', 'LOW'),
        matrix('LOW', 'HIGH', 'MEDIUM'),
        matrix('LOW', 'CRITICAL', 'HIGH'),
        matrix('MEDIUM', 'LOW', 'LOW'),
        matrix('MEDIUM', 'MEDIUM', 'MEDIUM'),
        matrix('MEDIUM', 'HIGH', 'HIGH'),
        matrix('MEDIUM', 'CRITICAL', 'HIGH'),
        matrix('HIGH', 'LOW', 'MEDIUM'),
        matrix('HIGH', 'MEDIUM', 'HIGH'),
        matrix('HIGH', 'HIGH', 'HIGH'),
        matrix('HIGH', 'CRITICAL', 'CRITICAL'),
        matrix('CRITICAL', 'LOW', 'HIGH'),
        matrix('CRITICAL', 'MEDIUM', 'HIGH'),
        matrix('CRITICAL', 'HIGH', 'CRITICAL'),
        matrix('CRITICAL', 'CRITICAL', 'CRITICAL'),
      ],
    },
    catalog: {
      services: [
        {
          id: 'service-vpn',
          name: 'VPN',
          slug: 'vpn',
          categoryId: 'cat-1',
          lifecycle: 'ACTIVE',
          availability: 'OPERATIONAL',
          classification: 'INTERNAL',
          requiresApproval: false,
          isConfidentialDefault: false,
          autoAssignStrategy: 'NONE',
          slaProfileId: 'profile-1',
          policyPackId: null,
        },
      ],
    },
    forms: {
      versions: [
        {
          id: 'form-1',
          serviceId: 'service-vpn',
          version: 1,
          status: 'ACTIVE',
          schema: { schemaVersion: 1, fields: [] },
        },
      ],
    },
    references: {
      organizationalUnits: [
        { id: 'ou-root', parentId: null, ouPath: '/EP' },
      ],
      groups: [{ id: 'group-it' }],
    },
    ...overrides,
  };
}

function slaRule(priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') {
  return {
    id: `rule-${priority}`,
    slaProfileId: 'profile-1',
    priority,
    responseMinutes: 30,
    resolutionMinutes: 120,
    evaluationOrder: 100,
    organizationalUnitId: null,
    serviceId: null,
  };
}

function matrix(
  impact: string,
  urgency: string,
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
) {
  return {
    id: `mx-${impact}-${urgency}`,
    impact,
    urgency,
    priority,
  };
}
