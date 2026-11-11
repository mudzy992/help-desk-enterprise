import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildRoutingConfigurationReference,
  isRoutingConfigurationReferenceForService,
} from './build-routing-configuration-reference';

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
): Promise<string | null> {
  return (await hasRoutingRulesForService(prisma, serviceId))
    ? buildRoutingConfigurationReference(serviceId)
    : null;
}

export async function acceptsRoutingOnboardingReference(
  prisma: PrismaService,
  input: { readonly serviceId: string; readonly reference: string },
): Promise<boolean> {
  return (
    isRoutingConfigurationReferenceForService(
      input.reference,
      input.serviceId,
    ) && (await hasRoutingRulesForService(prisma, input.serviceId))
  );
}
