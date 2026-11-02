import { PrismaService } from '../../common/prisma/prisma.service';
import { routingCoverageMissingCode } from '../routing/routing.constants';
import type {
  ServiceRoutingCoverageEvaluation,
} from '../routing/evaluate-service-routing-coverage';
import { settingKeys } from '../settings/setting-keys';
import { assertServiceLifecycleTransition } from './assert-service-lifecycle-transition';
import { buildServiceResponse } from './build-service-response';
import { loadService } from './load-service';
import { selectActiveFormVersionRef } from './select-active-form-version-ref';
import { ServiceFormsError } from './service-forms.error';
import { ServiceCatalogError } from './service-catalog.error';
import {
  recordServiceCatalogChange,
  serviceChangeLogEntityType,
} from './record-service-catalog-change';
import type {
  CatalogMutationContext,
  ServiceLifecycleConfiguration,
  ServiceResponse,
  TransitionServiceLifecycleInput,
} from './service-catalog.types';

export async function transitionServiceLifecycle(
  prisma: PrismaService,
  serviceId: string,
  input: TransitionServiceLifecycleInput,
  configuration: ServiceLifecycleConfiguration,
  context: CatalogMutationContext,
  coverageEvaluation: ServiceRoutingCoverageEvaluation | null = null,
): Promise<ServiceResponse> {
  const routingCoverageAudit =
    input.lifecycle === 'ACTIVE' && coverageEvaluation !== null
      ? {
          policySettingKey: settingKeys.privateTicketRoutingRequireCoverage,
          requireCoverage: coverageEvaluation.requireCoverage,
          hasCoverage: coverageEvaluation.hasCoverage,
          requiredOriginUnitCount: coverageEvaluation.requiredOriginUnitCount,
          missingOriginUnitIds: [...coverageEvaluation.missingOriginUnitIds],
          overrideApplied:
            !coverageEvaluation.requireCoverage &&
            !coverageEvaluation.hasCoverage,
        }
      : null;
  const current = await loadService(prisma, serviceId);
  assertServiceLifecycleTransition({
    from: current.lifecycle,
    to: input.lifecycle,
    configuration,
  });
  if (input.lifecycle === 'ACTIVE') {
    try {
      await selectActiveFormVersionRef(prisma, serviceId);
    } catch (error) {
      if (
        error instanceof ServiceFormsError &&
        error.code === 'NO_ACTIVE_FORM_VERSION'
      ) {
        throw new ServiceCatalogError('NO_ACTIVE_FORM_VERSION');
      }
      throw error;
    }
  }
  const updated = await prisma.$transaction(async (transaction) => {
    const service = await transaction.service.update({
      where: { id: serviceId },
      data: { lifecycle: input.lifecycle },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceChangeLogEntityType(),
      entityId: service.id,
      reason: 'lifecycle_transition',
      diff: {
        before: {
          lifecycle: current.lifecycle,
          id: current.id,
          slug: current.slug,
        },
        after: {
          lifecycle: service.lifecycle,
          id: service.id,
          slug: service.slug,
        },
        ...(routingCoverageAudit === null
          ? {}
          : { routingCoverage: routingCoverageAudit }),
      },
      actorUserId: context.actorUserId,
    });
    return service;
  });
  const response = await buildServiceResponse(prisma, updated);
  if (routingCoverageAudit === null || routingCoverageAudit.hasCoverage) {
    return response;
  }
  return { ...response, warnings: [routingCoverageMissingCode] };
}
