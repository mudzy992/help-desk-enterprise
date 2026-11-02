import { PrismaService } from "../../common/prisma/prisma.service";
import { ServiceCatalogError } from "./service-catalog.error";
import { loadActiveServiceFormVersion } from "./load-active-service-form-version";
import { loadActiveServiceFormVersionRef } from "./load-active-service-form-version-ref";
import { listFormVersionRecords } from "./list-form-version-records";
import { serviceFormVersionsMaximumResponseBytes } from "./service-forms.constants";
import type {
  ServiceFormListInput,
  ServiceFormResponse,
} from "./service-forms.types";
import { toFormVersionResponse } from "./to-form-version-response";

export async function toServiceFormResponse(
  prisma: PrismaService,
  serviceId: string,
  formsEnabled = true,
  requireVersionOnTicket = true,
  input: ServiceFormListInput = {},
): Promise<ServiceFormResponse> {
  const [page, activeFormVersionRef] = await Promise.all([
    listFormVersionRecords(prisma, serviceId, input),
    loadActiveServiceFormVersionRef(prisma, serviceId),
  ]);
  const activeFormIsOnPage = page.records.some(
    (record) => record.id === activeFormVersionRef,
  );
  const active =
    activeFormVersionRef !== null && !activeFormIsOnPage
      ? await loadActiveServiceFormVersion(prisma, serviceId)
      : null;
  const versions = page.records.map((record) =>
    toFormVersionResponse(record, record.ticketCount),
  );
  const response: ServiceFormResponse = {
    serviceId,
    formsEnabled,
    requireVersionOnTicket,
    activeFormVersionRef,
    activeForm:
      active === null
        ? null
        : toFormVersionResponse(active, active.ticketCount),
    versions,
    total: page.total,
    take: page.take,
    cursor: page.cursor,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
  if (
    Buffer.byteLength(JSON.stringify(response), "utf8") >
    serviceFormVersionsMaximumResponseBytes
  ) {
    throw new ServiceCatalogError("CATALOG_RESOURCE_LIMIT_EXCEEDED");
  }
  return response;
}
