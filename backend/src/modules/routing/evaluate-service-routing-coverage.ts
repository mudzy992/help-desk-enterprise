import { PrismaService } from '../../common/prisma/prisma.service';
import { routingCoverageMissingCode } from './routing.constants';
import { RoutingError } from './routing.error';
import { hasRoutingRulesForService } from './routing-onboarding-support';
import type { RoutingConfiguration } from './routing.types';

export type ServiceRoutingCoverageEvaluation = {
  readonly hasCoverage: boolean;
  readonly requireCoverage: boolean;
};

export async function evaluateServiceRoutingCoverage(
  prisma: PrismaService,
  serviceId: string,
  configuration: RoutingConfiguration,
): Promise<ServiceRoutingCoverageEvaluation> {
  return {
    hasCoverage: await hasRoutingRulesForService(prisma, serviceId),
    requireCoverage: configuration.requireCoverage,
  };
}

/** Throws when coverage is required and missing; otherwise returns a soft warning code. */
export function assertOrWarnActivationRoutingCoverage(
  evaluation: ServiceRoutingCoverageEvaluation,
): typeof routingCoverageMissingCode | null {
  if (evaluation.hasCoverage) {
    return null;
  }
  if (evaluation.requireCoverage) {
    throw new RoutingError(routingCoverageMissingCode);
  }
  return routingCoverageMissingCode;
}
