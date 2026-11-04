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
 * Mandatory origins are every persisted OrganizationalUnit: the current model
 * has no inactive/non-ticket-origin flag or per-service OU allowlist. Coverage
 * must match ticket resolution for each such origin: exact rule first, then
 * the nearest ancestor rule. Merely having one rule for the service is not
 * sufficient.
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
  // Keep the missing set stable even if a test double or DB collation returns
  // rows in a different order. OU paths are unique in the data model.
  const orderedUnits = [...units].sort((left, right) =>
    left.ouPath < right.ouPath ? -1 : left.ouPath > right.ouPath ? 1 :
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const unitById = new Map(orderedUnits.map((unit) => [unit.id, unit]));
  const coveredOrigins = new Set(rules.map((rule) => rule.originUnitId));
  const missingOriginUnitIds = orderedUnits
    .filter((unit) =>
      walkOrganizationalUnitAncestors(unit.id, unitById).every(
        (ancestor) => !coveredOrigins.has(ancestor.id),
      ),
    )
    .map((unit) => unit.id);

  return {
    hasCoverage: missingOriginUnitIds.length === 0,
    requireCoverage: configuration.requireCoverage,
    requiredOriginUnitCount: orderedUnits.length,
    missingOriginUnitIds,
  };
}

export function isServiceRoutingCoverageEvaluation(
  value: unknown,
): value is ServiceRoutingCoverageEvaluation {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const evaluation = value as Partial<ServiceRoutingCoverageEvaluation>;
  return (
    typeof evaluation.hasCoverage === 'boolean' &&
    typeof evaluation.requireCoverage === 'boolean' &&
    typeof evaluation.requiredOriginUnitCount === 'number' &&
    Number.isInteger(evaluation.requiredOriginUnitCount) &&
    evaluation.requiredOriginUnitCount >= 0 &&
    Array.isArray(evaluation.missingOriginUnitIds) &&
    evaluation.missingOriginUnitIds.every((id) => typeof id === 'string') &&
    evaluation.missingOriginUnitIds.length <= evaluation.requiredOriginUnitCount &&
    evaluation.hasCoverage === (evaluation.missingOriginUnitIds.length === 0)
  );
}

/** Throws when coverage is required and missing; otherwise returns a soft warning code. */
export function assertOrWarnActivationRoutingCoverage(
  evaluation: ServiceRoutingCoverageEvaluation,
): typeof routingCoverageMissingCode | null {
  if (evaluation.hasCoverage) {
    return null;
  }
  if (evaluation.requireCoverage) {
    throw new RoutingError(routingCoverageMissingCode, routingCoverageMissingCode, {
      routingCoverage: {
        ...evaluation,
        missingOriginUnitIds: [...evaluation.missingOriginUnitIds],
      },
    });
  }
  return routingCoverageMissingCode;
}
