import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { DefaultOnboardingApprovalsProvider } from './default-onboarding-approvals.provider';
import { DefaultOnboardingSlaProvider } from './default-onboarding-sla.provider';
import { completeOnboardingStep } from './complete-onboarding-step';
import { finalizeServiceOnboarding } from './finalize-service-onboarding';
import { getServiceOnboarding } from './get-service-onboarding';
import { defaultServiceOnboardingConfiguration } from './service-onboarding.constants';
import { PersistedOnboardingRoutingProvider } from './persisted-onboarding-routing.provider';
import {
  saveOnboardingApprovalsStep,
  saveOnboardingRoutingStep,
  saveOnboardingSlaStep,
} from './save-onboarding-configuration-steps';
import { buildRoutingConfigurationReference } from '../routing/build-routing-configuration-reference';
import { defaultRoutingConfiguration } from '../routing/routing.constants';
import { RoutingService } from '../routing/routing.service';
import { defaultServiceLifecycleConfiguration } from '../service-catalog/service-catalog.constants';

const databaseUrl = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;
const stamp = `${Date.now()}-${process.pid}`;

type OrganizationalUnitRow = {
  readonly id: string;
  readonly parentId: string | null;
  readonly ouPath: string;
};

type RoutingCoverageEvaluation = {
  readonly hasCoverage: boolean;
  readonly requireCoverage: boolean;
  readonly requiredOriginUnitCount: number;
  readonly missingOriginUnitIds: readonly string[];
};

type RoutingCoverageAudit = RoutingCoverageEvaluation & {
  readonly policySettingKey: string;
  readonly overrideApplied: boolean;
};

describeIfDatabase(
  'service onboarding routing coverage audit PostgreSQL integration (BA-routing-02)',
  () => {
    jest.setTimeout(120_000);

    let prisma: PrismaClient | undefined;
    const categoryId = `ba02-coverage-category-${stamp}`;
    const serviceId = `ba02-coverage-service-${stamp}`;
    const rootUnitId = `ba02-coverage-root-${stamp}`;
    const coveredUnitId = `ba02-coverage-child-${stamp}`;
    const groupId = `ba02-coverage-group-${stamp}`;
    let onboardingId: string | undefined;
    let slaProfileId: string | undefined;
    let calendarId: string | undefined;

    const db = (): PrismaClient => {
      if (prisma === undefined)
        throw new Error('BA-routing-02 PostgreSQL client is not initialized');
      return prisma;
    };

    const missingOriginsForRule = (
      organizationalUnits: readonly OrganizationalUnitRow[],
      ruleOriginUnitIds: ReadonlySet<string>,
    ): readonly string[] => {
      const unitById = new Map(organizationalUnits.map((unit) => [unit.id, unit]));
      const isCovered = (originUnitId: string): boolean => {
        let current: OrganizationalUnitRow | undefined = unitById.get(originUnitId);
        while (current !== undefined) {
          if (ruleOriginUnitIds.has(current.id)) return true;
          current = current.parentId === null ? undefined : unitById.get(current.parentId);
        }
        return false;
      };
      return [...organizationalUnits]
        .filter((unit) => !isCovered(unit.id))
        .sort((left, right) =>
          left.ouPath < right.ouPath
            ? -1
            : left.ouPath > right.ouPath
              ? 1
              : left.id < right.id
                ? -1
                : left.id > right.id
                  ? 1
                  : 0,
        )
        .map((unit) => unit.id);
    };

    beforeAll(async () => {
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
      await db().serviceCategory.create({
        data: {
          id: categoryId,
          name: `BA-routing-02 category ${stamp}`,
          slug: `ba02-coverage-category-${stamp}`,
        },
      });
      await db().organizationalUnit.create({
        data: {
          id: rootUnitId,
          name: `BA-routing-02 root ${stamp}`,
          type: 'DIRECTORATE',
          distinguishedName: `OU=BA-routing-02 root ${stamp}`,
          ouPath: `/BA-routing-02 ${stamp}`,
        },
      });
      await db().organizationalUnit.create({
        data: {
          id: coveredUnitId,
          name: `BA-routing-02 covered child ${stamp}`,
          type: 'SERVICE',
          distinguishedName: `OU=BA-routing-02 covered child ${stamp},OU=BA-routing-02 root ${stamp}`,
          ouPath: `/BA-routing-02 ${stamp}/Covered child`,
          parentId: rootUnitId,
        },
      });
      await db().group.create({
        data: {
          id: groupId,
          key: `ba02-coverage-${stamp}`,
          name: `BA-routing-02 coverage group ${stamp}`,
          organizationalUnitId: coveredUnitId,
        },
      });
      await db().service.create({
        data: {
          id: serviceId,
          name: `BA-routing-02 coverage service ${stamp}`,
          slug: `ba02-coverage-service-${stamp}`,
          categoryId,
          lifecycle: 'DRAFT',
        },
      });
      await db().routingRule.create({
        data: {
          originUnitId: coveredUnitId,
          serviceId,
          groupId,
        },
      });
      const formVersion = await db().formVersion.create({
        data: {
          serviceId,
          version: 1,
          schema: { schemaVersion: 1, fields: [] },
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      const calendar = await db().businessHoursCalendar.create({
        data: {
          key: `BA02_COVERAGE_${stamp}`,
          name: `BA-routing-02 coverage calendar ${stamp}`,
          timezone: 'UTC',
          weeklyHours: {},
        },
        select: { id: true },
      });
      calendarId = calendar.id;
      const profile = await db().slaProfile.create({
        data: {
          key: `ba02-coverage-${stamp}`,
          name: `BA-routing-02 coverage SLA ${stamp}`,
          calendarId: calendar.id,
        },
        select: { id: true },
      });
      slaProfileId = profile.id;
      const onboarding = await db().serviceOnboarding.create({
        data: {
          serviceId,
          status: 'IN_PROGRESS',
          currentStep: 'ROUTING',
          formVersionRef: formVersion.id,
          routingConfigurationRef: buildRoutingConfigurationReference(serviceId),
          completedSteps: ['SERVICE', 'FORM'],
        },
        select: { id: true },
      });
      onboardingId = onboarding.id;
    });

    afterAll(async () => {
      if (prisma === undefined) return;
      try {
        await db().changeLog.deleteMany({
          where: {
            entityId: { in: [serviceId, ...(onboardingId === undefined ? [] : [onboardingId])] },
          },
        });
        await db().routingRule.deleteMany({ where: { serviceId } });
        await db().serviceOnboarding.deleteMany({ where: { serviceId } });
        await db().formVersion.deleteMany({ where: { serviceId } });
        await db().service.deleteMany({ where: { id: serviceId } });
        await db().group.deleteMany({ where: { id: groupId } });
        if (slaProfileId !== undefined) {
          await db().slaProfile.deleteMany({ where: { id: slaProfileId } });
        }
        if (calendarId !== undefined) {
          await db().businessHoursCalendar.deleteMany({ where: { id: calendarId } });
        }
        await db().organizationalUnit.deleteMany({ where: { id: coveredUnitId } });
        await db().organizationalUnit.deleteMany({ where: { id: rootUnitId } });
        await db().serviceCategory.deleteMany({ where: { id: categoryId } });
      } finally {
        await prisma.$disconnect();
      }
    });

    it('persists missing coverage errors and the override warning/audit through the onboarding workflow', async () => {
      const organizationalUnits = await db().organizationalUnit.findMany({
        select: { id: true, parentId: true, ouPath: true },
      });
      const missingOriginUnitIds = missingOriginsForRule(
        organizationalUnits,
        new Set([coveredUnitId]),
      );
      expect(missingOriginUnitIds).toContain(rootUnitId);
      const requiredCoverage: RoutingCoverageEvaluation = {
        hasCoverage: false,
        requireCoverage: true,
        requiredOriginUnitCount: organizationalUnits.length,
        missingOriginUnitIds,
      };

      let requireCoverage = true;
      const routing = new RoutingService(
        db() as never,
        {
          load: async () => ({ ...defaultRoutingConfiguration, requireCoverage }),
        } as never,
        { loadBySubjectId: async () => null } as never,
      );
      const routingProvider = new PersistedOnboardingRoutingProvider(routing);
      const providers = {
        routing: routingProvider,
        sla: new DefaultOnboardingSlaProvider(db() as never),
        approvals: new DefaultOnboardingApprovalsProvider(),
      };
      const context = { actorUserId: null };
      const routingReference = buildRoutingConfigurationReference(serviceId);

      const strictOnboarding = await getServiceOnboarding(
        db() as never,
        serviceId,
        defaultServiceOnboardingConfiguration,
        routingProvider,
      );
      expect(strictOnboarding.routingSuggestion).toBeNull();
      await expect(
        saveOnboardingRoutingStep(
          db() as never,
          serviceId,
          { routingConfigurationRef: routingReference },
          defaultServiceOnboardingConfiguration,
          providers,
          context,
        ),
      ).rejects.toMatchObject({
        code: 'ROUTING_COVERAGE_MISSING',
        details: { routingCoverage: requiredCoverage },
      });
      await expect(
        completeOnboardingStep(
          db() as never,
          serviceId,
          'ROUTING',
          defaultServiceOnboardingConfiguration,
          providers,
          context,
        ),
      ).rejects.toMatchObject({
        code: 'ROUTING_COVERAGE_MISSING',
        details: { routingCoverage: requiredCoverage },
      });

      const persistedValidation = await getServiceOnboarding(
        db() as never,
        serviceId,
        defaultServiceOnboardingConfiguration,
        routingProvider,
      );
      expect(persistedValidation.lastValidationErrors).toEqual([
        {
          code: 'ROUTING_COVERAGE_MISSING',
          step: 'ROUTING',
          details: { routingCoverage: requiredCoverage },
        },
      ]);

      requireCoverage = false;
      const overrideOnboarding = await getServiceOnboarding(
        db() as never,
        serviceId,
        defaultServiceOnboardingConfiguration,
        routingProvider,
      );
      expect(overrideOnboarding.routingSuggestion).toBe(routingReference);
      const savedRouting = await saveOnboardingRoutingStep(
        db() as never,
        serviceId,
        { routingConfigurationRef: routingReference },
        defaultServiceOnboardingConfiguration,
        providers,
        context,
      );
      expect(savedRouting.lastValidationErrors).toEqual([]);
      await completeOnboardingStep(
        db() as never,
        serviceId,
        'ROUTING',
        defaultServiceOnboardingConfiguration,
        providers,
        context,
      );

      if (slaProfileId === undefined) throw new Error('BA-routing-02 SLA fixture is missing');
      await saveOnboardingSlaStep(
        db() as never,
        serviceId,
        { slaConfigurationRef: slaProfileId },
        defaultServiceOnboardingConfiguration,
        providers,
        context,
      );
      await completeOnboardingStep(
        db() as never,
        serviceId,
        'SLA',
        defaultServiceOnboardingConfiguration,
        providers,
        context,
      );
      await saveOnboardingApprovalsStep(
        db() as never,
        serviceId,
        { approvalsConfigurationRef: 'not_required' },
        defaultServiceOnboardingConfiguration,
        providers,
        context,
      );
      await completeOnboardingStep(
        db() as never,
        serviceId,
        'APPROVALS',
        defaultServiceOnboardingConfiguration,
        providers,
        context,
      );

      const expectedCoverageAudit: RoutingCoverageAudit = {
        ...requiredCoverage,
        requireCoverage: false,
        policySettingKey: 'private.ticket.routing.requireCoverage',
        overrideApplied: true,
      };
      const finalized = await finalizeServiceOnboarding(
        db() as never,
        serviceId,
        defaultServiceOnboardingConfiguration,
        defaultServiceLifecycleConfiguration,
        providers,
        context,
      );

      expect(finalized.record.status).toBe('COMPLETED');
      expect(finalized.warnings).toEqual(['ROUTING_COVERAGE_MISSING']);
      expect(
        await db().service.findUnique({ where: { id: serviceId }, select: { lifecycle: true } }),
      ).toMatchObject({ lifecycle: 'ACTIVE' });

      const lifecycleChanges = await db().changeLog.findMany({
        where: { entityType: 'service', entityId: serviceId, reason: 'lifecycle_transition' },
        orderBy: { createdAt: 'asc' },
        select: { diff: true },
      });
      expect(lifecycleChanges).toHaveLength(1);
      expect(lifecycleChanges[0]?.diff).toMatchObject({
        before: { lifecycle: 'DRAFT' },
        after: { lifecycle: 'ACTIVE' },
        routingCoverage: expectedCoverageAudit,
      });
    });
  },
);
