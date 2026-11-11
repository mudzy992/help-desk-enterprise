import { PrismaService } from '../../common/prisma/prisma.service';
import {
  assertOrWarnActivationRoutingCoverage,
  evaluateServiceRoutingCoverage,
} from './evaluate-service-routing-coverage';
import {
  buildRoutingConfigurationReference,
  isRoutingConfigurationReferenceForService,
} from './build-routing-configuration-reference';
import type { RoutingConfiguration } from './routing.types';

export async function hasRoutingRulesForService(
  prisma: PrismaService,
  serviceId: string,
): Promise<boolean> {
  const count = await prisma.routingRule.count({ where: { serviceId } });
  return count > 0;
}

export async function suggestRoutingOnboardingReference(
  prisma: PrismaService,
  serviceId: string,
  configuration: RoutingConfiguration,
): Promise<string | null> {
  const [hasRules, evaluation] = await Promise.all([
    hasRoutingRulesForService(prisma, serviceId),
    evaluateServiceRoutingCoverage(prisma, serviceId, configuration),
  ]);
  if (
    !hasRules ||
    (evaluation.requireCoverage && !evaluation.hasCoverage)
  ) {
    return null;
  }
  return buildRoutingConfigurationReference(serviceId);
}

export async function acceptsRoutingOnboardingReference(
  prisma: PrismaService,
  input: { readonly serviceId: string; readonly reference: string },
  configuration: RoutingConfiguration,
): Promise<boolean> {
  if (
    !isRoutingConfigurationReferenceForService(
      input.reference,
      input.serviceId,
    )
  ) {
    return false;
  }
  const evaluation = await evaluateServiceRoutingCoverage(
    prisma,
    input.serviceId,
    configuration,
  );
  assertOrWarnActivationRoutingCoverage(evaluation);
  return true;
}
