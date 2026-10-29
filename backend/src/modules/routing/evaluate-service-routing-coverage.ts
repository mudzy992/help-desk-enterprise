import { PrismaService } from '../../common/prisma/prisma.service';
import { routingCoverageMissingCode } from './routing.constants';
import { RoutingError } from './routing.error';
import { walkOrganizationalUnitAncestors } from './load-organizational-unit-ancestors';
import type { RoutingConfiguration } from './routing.types';

export type ServiceRoutingCoverageEvaluation = {
  readonly hasCoverage: boolean;
  readonly requireCoverage: boolean;
  readonly requiredOriginUnitCount: number;
  readonly missingOriginUnitIds: readonly string[];
};

/**
 * Activation coverage means every organizational unit from which a ticket can
 * originate resolves through either an exact rule or an ancestor fallback.
 * Merely having one rule for the service is not sufficient.
 */
export async function evaluateServiceRoutingCoverage(
  prisma: PrismaService,
  serviceId: string,
  configuration: RoutingConfiguration,
): Promise<ServiceRoutingCoverageEvaluation> {
  const [units, rules] = await Promise.all([
    prisma.organizationalUnit.findMany({
      select: { id: true, parentId: true, ouPath: true },
      orderBy: { ouPath: 'asc' },
    }),
    prisma.routingRule.findMany({ where: { serviceId } }),
  ]);
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const coveredOrigins = new Set(rules.map((rule) => rule.originUnitId));
  const missingOriginUnitIds = units
    .filter((unit) =>
      walkOrganizationalUnitAncestors(unit.id, unitById).every(
        (ancestor) => !coveredOrigins.has(ancestor.id),
      ),
    )
    .map((unit) => unit.id);

  return {
    hasCoverage: missingOriginUnitIds.length === 0,
    requireCoverage: configuration.requireCoverage,
    requiredOriginUnitCount: units.length,
    missingOriginUnitIds,
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
