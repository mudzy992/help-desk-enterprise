import { previewTicketRouting } from './preview-ticket-routing';
import { routingOutcomes } from '../../routing/routing.constants';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const authContext = { subjectId: 'u1', isSuperAdmin: true, isLocalOnly: true, assignments: [] };

function createPrismaStub(slaProfile: { name: string; isActive: boolean } | null) {
  return {
    user: { findUnique: async () => ({ organizationalUnitId: 'ou-1' }) },
    service: {
      findUnique: async () => ({
        requiresApproval: false,
        autoAssignStrategy: 'NONE',
        slaProfileId: slaProfile === null ? null : 'profile-1',
      }),
    },
    group: { findUnique: async () => ({ name: 'IT Support', autoAssignStrategy: 'NONE' }) },
    slaProfile: { findUnique: async () => slaProfile },
  };
}

const routingService = {
  resolve: async () => ({
    outcome: routingOutcomes.exact,
    groupId: 'group-1',
    fallbackDepth: 0,
  }),
};
const authorizationContextLoader = { loadBySubjectId: async () => authContext };
const approvalsConfigurationLoader = {
  load: async () => ({ enabled: true, requiredByService: {}, defaultApproverRole: 'ADMIN', allowRequesterManager: false }),
};
const assignmentConfigurationLoader = {
  load: async () => ({ groupInboxEnabled: true, autoAssignEnabled: true, autoAssignStrategy: 'NONE' }),
};

describe('previewTicketRouting SLA profile resolution', () => {
  it('reports the profile name when the service has an active SLA profile', async () => {
    const preview = await previewTicketRouting(
      createPrismaStub({ name: 'Standard SLA', isActive: true }) as never,
      routingService as never,
      authorizationContextLoader as never,
      approvalsConfigurationLoader as never,
      assignmentConfigurationLoader as never,
      { originUnitId: 'ou-1', serviceId: 'service-1' },
      { actorUserId: 'u1' },
    );
    expect(preview.slaProfileName).toBe('Standard SLA');
  });

  it('hides an inactive SLA profile, same as SLA timers would', async () => {
    const preview = await previewTicketRouting(
      createPrismaStub({ name: 'Retired SLA', isActive: false }) as never,
      routingService as never,
      authorizationContextLoader as never,
      approvalsConfigurationLoader as never,
      assignmentConfigurationLoader as never,
      { originUnitId: 'ou-1', serviceId: 'service-1' },
      { actorUserId: 'u1' },
    );
    expect(preview.slaProfileName).toBeNull();
  });

  it('reports no profile when the service has none bound', async () => {
    const preview = await previewTicketRouting(
      createPrismaStub(null) as never,
      routingService as never,
      authorizationContextLoader as never,
      approvalsConfigurationLoader as never,
      assignmentConfigurationLoader as never,
      { originUnitId: 'ou-1', serviceId: 'service-1' },
      { actorUserId: 'u1' },
    );
    expect(preview.slaProfileName).toBeNull();
  });
});
