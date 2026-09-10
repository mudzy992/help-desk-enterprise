import { createInMemoryServiceCatalogPrisma } from '../service-catalog/create-in-memory-service-catalog-prisma';
import type { FormVersionRecord } from '../service-catalog/service-forms.types';
import type { ServiceOnboardingPersistence } from './to-onboarding-record';

export function createInMemoryServiceOnboardingPrisma(): {
  prisma: ReturnType<typeof createInMemoryServiceCatalogPrisma>['prisma'] & {
    serviceOnboarding: Record<string, unknown>;
    slaProfile: Record<string, unknown>;
  };
  catalog: ReturnType<typeof createInMemoryServiceCatalogPrisma>;
  seedSlaProfile: (id: string) => void;
  seedOnboarding: (row: ServiceOnboardingPersistence) => void;
  seedFormVersion: (
    input: Pick<FormVersionRecord, 'serviceId' | 'version' | 'schema' | 'status'> & {
      id?: string;
    },
  ) => Promise<FormVersionRecord>;
} {
  const catalog = createInMemoryServiceCatalogPrisma();
  const onboardings = new Map<string, ServiceOnboardingPersistence>();
  const slaProfiles = new Set<string>();
  const prisma: {
    serviceCategory: Record<string, unknown>;
    service: Record<string, unknown>;
    serviceDowntimeWindow: Record<string, unknown>;
    formVersion: Record<string, unknown>;
    ticket: Record<string, unknown>;
    policyPack: Record<string, unknown>;
    changeLog: Record<string, unknown>;
    serviceOnboarding: Record<string, unknown>;
    slaProfile: Record<string, unknown>;
    $transaction: (callback: (client: unknown) => Promise<unknown>) => Promise<unknown>;
  } = {
    ...catalog.prisma,
    serviceOnboarding: {},
    slaProfile: {},
    $transaction: async (callback) => callback(prisma),
  };
  prisma.serviceOnboarding = createOnboardingDelegate(onboardings);
  prisma.slaProfile = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      slaProfiles.has(where.id) ? { id: where.id } : null,
  };
  return {
    prisma,
    catalog,
    seedSlaProfile: (id) => {
      slaProfiles.add(id);
    },
    seedOnboarding: (row) => {
      onboardings.set(row.id, row);
    },
    seedFormVersion: (input) =>
      (
        catalog.prisma.formVersion.create as (args: {
          data: typeof input;
        }) => Promise<FormVersionRecord>
      )({ data: input }),
  };
}

function createOnboardingDelegate(
  onboardings: Map<string, ServiceOnboardingPersistence>,
) {
  const now = () => new Date('2026-09-10T10:00:00.000Z');
  let nextIdentifier = 1;
  return {
    findUnique: async ({
      where,
    }: {
      where: { id?: string; serviceId?: string };
    }) => {
      if (where.id !== undefined) {
        return onboardings.get(where.id) ?? null;
      }
      if (where.serviceId !== undefined) {
        return (
          [...onboardings.values()].find(
            (item) => item.serviceId === where.serviceId,
          ) ?? null
        );
      }
      return null;
    },
    create: async ({ data }: { data: Partial<ServiceOnboardingPersistence> }) => {
      if (
        data.serviceId !== undefined &&
        [...onboardings.values()].some((item) => item.serviceId === data.serviceId)
      ) {
        throw { code: 'P2002', meta: { target: ['serviceId'] } };
      }
      const created: ServiceOnboardingPersistence = {
        id: data.id ?? `onboarding-${nextIdentifier++}`,
        serviceId: data.serviceId ?? '',
        status: data.status ?? 'IN_PROGRESS',
        currentStep: data.currentStep ?? 'SERVICE',
        formVersionRef: data.formVersionRef ?? null,
        routingConfigurationRef: data.routingConfigurationRef ?? null,
        slaConfigurationRef: data.slaConfigurationRef ?? null,
        approvalsConfigurationRef: data.approvalsConfigurationRef ?? null,
        completedSteps: data.completedSteps ?? [],
        lastValidationErrors: data.lastValidationErrors ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      onboardings.set(created.id, created);
      return created;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ServiceOnboardingPersistence>;
    }) => {
      const current = onboardings.get(where.id);
      if (current === undefined) {
        return null;
      }
      const updated = { ...current, ...data, updatedAt: now() };
      onboardings.set(where.id, updated);
      return updated;
    },
  };
}
