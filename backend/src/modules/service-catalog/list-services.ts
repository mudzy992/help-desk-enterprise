import { PrismaService } from "../../common/prisma/prisma.service";
import {
  serviceListDefaultTake,
  serviceListMaximumResponseBytes,
  serviceListMaximumTake,
} from "./service-catalog.constants";
import {
  decodeServiceListCursor,
  encodeServiceListCursor,
} from "./service-list-cursor";
import { requestedServiceLifecycles } from "./service-visible-lifecycles";
import { countOpenTicketsByService } from "./count-open-tickets-by-service";
import { loadActiveFormSummaries } from "./load-active-form-summaries";
import { loadServiceCategoryLabels } from "./load-service-category-labels";
import { loadServiceOnboardingSummaries } from "./load-service-onboarding-summaries";
import { loadServiceDowntimeSummaries } from "./load-service-downtime-summary";
import { defaultServiceAvailabilityEvaluationContext } from "./parse-service-availability-configuration";
import { defaultTicketApprovalsConfiguration } from "../tickets/approvals/approvals.constants";
import type { TicketApprovalsConfiguration } from "../tickets/approvals/approvals.types";
import type { ServiceAvailabilityEvaluationContext } from "./service-availability.types";
import type {
  ListServicesInput,
  ServiceListPage,
  ServiceResponse,
} from "./service-catalog.types";
import { loadOpenIncidentImpacts } from "./load-open-incident-impacts";
import { toServiceResponse } from "./to-service-response";
import { ServiceCatalogError } from "./service-catalog.error";

export async function listServices(
  prisma: PrismaService,
  input: ListServicesInput = {},
  evaluation: ServiceAvailabilityEvaluationContext = defaultServiceAvailabilityEvaluationContext(),
  approvalsConfiguration: TicketApprovalsConfiguration = defaultTicketApprovalsConfiguration,
): Promise<ServiceListPage> {
  const take = Math.min(
    serviceListMaximumTake,
    Math.max(1, input.take ?? serviceListDefaultTake),
  );
  const search = input.search?.trim() ?? "";
  const lifecycle = requestedLifecycle(input);
  // Val 2 (M6/B2): drafts (and, for requesters, deprecated services) are filtered
  // in the query itself, not after mapping — a caller asking for a state they may
  // not see gets an empty page instead of a 403 that would reveal it exists.
  const lifecycles =
    lifecycle === null
      ? []
      : requestedServiceLifecycles({ ...input, lifecycle });
  const filterKey = JSON.stringify({
    lifecycles: [...lifecycles].sort(),
    categoryId: input.categoryId ?? null,
    offeredOnly: input.offeredOnly === true,
    search,
    originUnitId: input.originUnitId ?? null,
  });
  const cursor = decodeServiceListCursor(input.cursor, filterKey);
  const emptyPage = (): ServiceListPage => ({
    items: [],
    total: 0,
    take,
    cursor: input.cursor ?? null,
    nextCursor: null,
    hasMore: false,
  });
  if (lifecycles.length === 0) return emptyPage();

  const filterWhere = {
    lifecycle: { in: [...lifecycles] },
    ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    ...(search.length === 0
      ? {}
      : {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }),
    ...(input.originUnitId === undefined
      ? {}
      : { routingRules: { some: { originUnitId: input.originUnitId } } }),
  };
  const pageWhere =
    cursor === null
      ? filterWhere
      : {
          AND: [
            filterWhere,
            {
              OR: [
                { name: { gt: cursor.name } },
                { name: cursor.name, id: { gt: cursor.id } },
              ],
            },
          ],
        };
  const [total, records] = await Promise.all([
    prisma.service.count({ where: filterWhere }),
    prisma.service.findMany({
      where: pageWhere,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: take + 1,
    }),
  ]);
  const hasMore = records.length > take;
  const pageRecords = hasMore ? records.slice(0, take) : records;
  const serviceIds = pageRecords.map((record) => record.id);
  const [
    downtimeSummariesByServiceId,
    openTicketCounts,
    incidentImpacts,
    activeForms,
    categoryLabels,
    onboardingSummaries,
  ] = await Promise.all([
    loadServiceDowntimeSummaries(prisma, serviceIds, evaluation.now),
    countOpenTicketsByService(prisma, serviceIds),
    loadOpenIncidentImpacts(prisma, serviceIds),
    loadActiveFormSummaries(prisma, serviceIds),
    loadServiceCategoryLabels(
      prisma,
      pageRecords.map((record) => record.categoryId),
    ),
    loadServiceOnboardingSummaries(prisma, serviceIds),
  ]);
  const items = pageRecords.map((record): ServiceResponse => ({
    ...toServiceResponse(
      record,
      downtimeSummariesByServiceId.get(record.id)?.windows ?? [],
      evaluation,
      openTicketCounts.get(record.id) ?? 0,
      approvalsConfiguration,
      incidentImpacts.get(record.id) ?? null,
      activeForms.get(record.id) ?? undefined,
      downtimeSummariesByServiceId.get(record.id)?.upcomingCount ?? 0,
    ),
    category: categoryLabels.get(record.categoryId) ?? null,
    onboarding: onboardingSummaries.get(record.id) ?? null,
  }));
  const last = pageRecords.at(-1);
  const page: ServiceListPage = {
    items,
    total,
    take,
    cursor: input.cursor ?? null,
    nextCursor:
      hasMore && last !== undefined
        ? encodeServiceListCursor({ name: last.name, id: last.id, filterKey })
        : null,
    hasMore,
  };
  if (
    Buffer.byteLength(JSON.stringify(page), "utf8") >
    serviceListMaximumResponseBytes
  ) {
    throw new ServiceCatalogError("CATALOG_RESOURCE_LIMIT_EXCEEDED");
  }
  return page;
}

function requestedLifecycle(
  input: ListServicesInput,
): ListServicesInput["lifecycle"] | null {
  if (input.offeredOnly !== true) return input.lifecycle;
  return input.lifecycle === undefined || input.lifecycle === "ACTIVE"
    ? "ACTIVE"
    : null;
}
