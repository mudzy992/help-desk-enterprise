import { PrismaService } from "../../common/prisma/prisma.service";
import { loadActiveServiceFormVersion } from "./load-active-service-form-version";
import { loadService } from "./load-service";
import { isServiceLifecycleVisible } from "./service-visible-lifecycles";
import { ServiceCatalogError } from "./service-catalog.error";
import { serviceFormVersionsMaximumResponseBytes } from "./service-forms.constants";
import type { ServiceActiveFormResponse } from "./service-forms.types";
import { toFormVersionResponse } from "./to-form-version-response";

export async function getActiveServiceForm(
  prisma: PrismaService,
  serviceId: string,
  roleKeys: readonly string[] | undefined,
  formsEnabled: boolean,
  requireVersionOnTicket: boolean,
): Promise<ServiceActiveFormResponse> {
  const service = await loadService(prisma, serviceId);
  if (!isServiceLifecycleVisible(service.lifecycle, roleKeys)) {
    throw new ServiceCatalogError("NOT_FOUND");
  }
  const active = await loadActiveServiceFormVersion(prisma, serviceId);
  const response: ServiceActiveFormResponse = {
    serviceId,
    formsEnabled,
    requireVersionOnTicket,
    activeForm:
      active === null
        ? null
        : toFormVersionResponse(active, active.ticketCount),
  };
  if (
    Buffer.byteLength(JSON.stringify(response), "utf8") >
    serviceFormVersionsMaximumResponseBytes
  ) {
    throw new ServiceCatalogError("CATALOG_RESOURCE_LIMIT_EXCEEDED");
  }
  return response;
}
