import { flattenOriginUnitOptions, type OriginUnitOption } from "@/lib/tickets/ticket-display";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import {
  listOfferedServices,
  type ServiceResponse,
} from "@/services/service-catalog-api";

export type CreateTicketCatalogLoadResult = {
  readonly services: readonly ServiceResponse[];
  readonly originUnits: readonly OriginUnitOption[];
  readonly errorKey: "tickets.errorCatalog" | null;
};

export async function loadCreateTicketCatalog(): Promise<CreateTicketCatalogLoadResult> {
  const [offered, originUnits] = await Promise.all([
    listOfferedServices().then(
      (services) => ({ ok: true as const, services }),
      () => ({ ok: false as const, services: [] as const }),
    ),
    listOrganizationalUnitTree().then(
      (tree) => flattenOriginUnitOptions(tree),
      () => [] as const,
    ),
  ]);
  return {
    services: offered.services,
    originUnits,
    errorKey: offered.ok ? null : "tickets.errorCatalog",
  };
}
