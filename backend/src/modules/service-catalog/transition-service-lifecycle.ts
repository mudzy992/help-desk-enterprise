import type { OptimisticConcurrencyService } from "../../common/optimistic-concurrency/optimistic-concurrency.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { routingCoverageMissingCode } from "../routing/routing.constants";
import type { ServiceRoutingCoverageEvaluation } from "../routing/evaluate-service-routing-coverage";
import { buildActivationRoutingCoverageAudit } from "./build-activation-routing-coverage-audit";
import { assertServiceLifecycleTransition } from "./assert-service-lifecycle-transition";
import { buildServiceResponse } from "./build-service-response";
import { selectActiveFormVersionRef } from "./select-active-form-version-ref";
import { ServiceFormsError } from "./service-forms.error";
import { ServiceCatalogError } from "./service-catalog.error";
import { normalizeCatalogMutationReason } from "./normalize-catalog-mutation-reason";
import {
  recordServiceCatalogChange,
  serviceChangeLogEntityType,
} from "./record-service-catalog-change";
import type {
  CatalogMutationContext,
  ServiceLifecycleConfiguration,
  ServiceResponse,
  TransitionServiceLifecycleInput,
} from "./service-catalog.types";

export async function transitionServiceLifecycle(
  prisma: PrismaService,
  serviceId: string,
  input: TransitionServiceLifecycleInput,
  ifMatch: string | string[] | undefined,
  configuration: ServiceLifecycleConfiguration,
  context: CatalogMutationContext,
  optimisticConcurrency: OptimisticConcurrencyService,
  coverageEvaluation: ServiceRoutingCoverageEvaluation | null = null,
): Promise<ServiceResponse> {
  const reason = normalizeCatalogMutationReason({
    reason: input.reason,
    context,
    systemFallback: "lifecycle_transition",
  });
  const routingCoverageAudit =
    input.lifecycle === "ACTIVE" && coverageEvaluation !== null
      ? buildActivationRoutingCoverageAudit(coverageEvaluation)
      : null;
  const result = await optimisticConcurrency.execute({
    ifMatch,
    mutate: (expectedRevision) =>
      prisma.$transaction(async (transaction) => {
        const transactionPrisma = transaction as PrismaService;
        const current = await transaction.service.findUnique({
          where: { id: serviceId },
        });
        if (current === null || current.revision !== expectedRevision) {
          return null;
        }
        assertServiceLifecycleTransition({
          from: current.lifecycle,
          to: input.lifecycle,
          configuration,
        });
        if (input.lifecycle === "ACTIVE") {
          try {
            await selectActiveFormVersionRef(transactionPrisma, serviceId);
          } catch (error) {
            if (
              error instanceof ServiceFormsError &&
              error.code === "NO_ACTIVE_FORM_VERSION"
            ) {
              throw new ServiceCatalogError("NO_ACTIVE_FORM_VERSION");
            }
            throw error;
          }
        }
        const write = await transaction.service.updateMany({
          where: { id: serviceId, revision: expectedRevision },
          data: {
            lifecycle: input.lifecycle,
            revision: { increment: 1 },
          },
        });
        if (write.count !== 1) {
          return null;
        }
        const service = await transaction.service.findUnique({
          where: { id: serviceId },
        });
        if (service === null) {
          throw new Error(
            "Updated service disappeared before transaction commit",
          );
        }
        await recordServiceCatalogChange(transactionPrisma, {
          entityType: serviceChangeLogEntityType(),
          entityId: service.id,
          reason,
          diff: {
            action: "service.lifecycle_transition",
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
        return { value: service, version: service.revision };
      }),
    readCurrentVersion: async () => {
      const current = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { revision: true },
      });
      return current?.revision ?? null;
    },
  });
  const response = await buildServiceResponse(prisma, result.value);
  if (routingCoverageAudit === null || routingCoverageAudit.hasCoverage) {
    return response;
  }
  return { ...response, warnings: [routingCoverageMissingCode] };
}
